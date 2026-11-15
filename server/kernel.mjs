// The launcher side of squero-kernel/0: one Julia kernel per browser WebSocket, bridged over
// stdio. The kernel normally runs in the pinned container with --network=none; SQUERO_JULIA=native
// runs a local checkout instead. Shared by the Vite dev server and bin/squero-mx.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

export const KERNEL_IMAGE = process.env.SQUERO_KERNEL_IMAGE ?? "squero-julia-kernel:1.11.6-r2";
export const KERNEL_PROTOCOL = 0;

// SqueroBase (session, Paperboat bridges) and SqueroPlot (figures) are the kernel project's own
// dependencies: path deps of the sibling checkouts natively, baked into the image otherwise.
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The kernel checkout beside this app (a sibling checkout, or the pkg store's), not beside
// whatever folder the launcher was started from.
const KERNEL_REPO = process.env.SQUERO_KERNEL_REPO ?? path.resolve(HERE, "../../squero-julia-kernel");

const has = (cmd) => {
  const probe = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
};

// ---- Kernels never outlive the launcher -------------------------------------------------------
// A container's client can die and leave the container running, and Julia as PID 1 ignores
// SIGTERM. So each kernel container is named and labelled with this launcher's pid: closing a
// kernel removes its container, the launcher removes all of its own when it stops, and at start
// it removes those whose launcher is gone (a crash, kill -9).

const LABEL = "squero.kernel";
const OWNER = "squero.kernel.owner";
let serial = 0;
/** Live kernels: a container name (podman/docker) or a native child, by name. */
const live = new Map();

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
};

/** Remove a kernel container now (the launcher is exiting) or in the background. */
function removeContainer(engine, name, wait = false) {
  const args = ["rm", "-f", "-t", "1", name];
  if (wait) spawnSync(engine, args, { stdio: "ignore", timeout: 15000 });
  else spawn(engine, args, { stdio: "ignore" }).on("error", () => {});
}

function stopKernel(name, wait = false) {
  const kernel = live.get(name);
  if (!kernel) return;
  live.delete(name);
  if (kernel.engine) removeContainer(kernel.engine, name, wait);
  if (!kernel.child.killed) kernel.child.kill("SIGTERM");
  // A native Julia busy in a C call can ignore SIGTERM; it gets a moment, then SIGKILL.
  if (!kernel.engine && !wait) setTimeout(() => { if (kernel.child.exitCode === null) kernel.child.kill("SIGKILL"); }, 3000).unref();
  if (!kernel.engine && wait && kernel.child.exitCode === null) kernel.child.kill("SIGKILL");
}

let hooked = false;
function stopAllOnExit() {
  if (hooked) return;
  hooked = true;
  const all = () => { for (const name of [...live.keys()]) stopKernel(name, true); };
  process.on("exit", all);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(signal, () => {
      all();
      // Leave as the signal would have, unless something else also listens for it.
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    });
  }
}

/** Remove kernel containers left by a launcher that is gone. */
export function sweepOrphans(engine = kernelRuntime()) {
  if (engine !== "podman" && engine !== "docker") return 0;
  const listed = spawnSync(engine, ["ps", "-a", "--filter", `label=${LABEL}`, "--format", `{{.Names}} {{.Label "${OWNER}"}}`], { encoding: "utf8", timeout: 15000 });
  let removed = 0;
  for (const line of (listed.stdout ?? "").split("\n")) {
    const [name, owner] = line.trim().split(/\s+/);
    if (!name || alive(Number(owner))) continue;
    removeContainer(engine, name);
    removed++;
  }
  return removed;
}

let runtime;
/** The first runtime present; probed once, as each probe is a blocking child. */
export function kernelRuntime() {
  if (process.env.SQUERO_JULIA) return process.env.SQUERO_JULIA;
  runtime ??= has("podman") ? "podman" : has("docker") ? "docker" : has("julia") ? "native" : "none";
  return runtime;
}

/** The command that runs the kernel. `workspace` is mounted at /workspace for load/save. */
export function kernelCommand({ workspace, image = KERNEL_IMAGE, runtime = kernelRuntime(), name } = {}) {
  if (runtime === "native") {
    const repo = KERNEL_REPO;
    const env = {};
    if (workspace) {
      // The workspace project is a secondary environment: scripts can `using` a package the
      // julia up panel added, while the kernel's own dependencies still come from its repo.
      env.JULIA_LOAD_PATH = ["@", path.resolve(workspace), "@stdlib"].join(path.delimiter);
    }
    return {
      cmd: "julia",
      args: ["--startup-file=no", `--project=${repo}`, path.join(repo, "src", "kernel.jl")],
      env,
      runtime,
    };
  }
  if (runtime === "podman" || runtime === "docker") {
    // --init: Julia isn't PID 1, so signals reach it (Cancel's SIGINT goes through the init).
    const args = ["run", "--rm", "-i", "--init", "--network=none", "--label", `${LABEL}=1`, "--label", `${OWNER}=${process.pid}`];
    if (name) args.push("--name", name);
    if (runtime === "podman") args.push("--userns=keep-id");
    if (workspace) {
      args.push("-v", `${workspace}:/workspace:rw`, "-w", "/workspace");
      // Keep the kernel image's depot for JSON3 and the stdlib, and the workspace depot for
      // packages the user adds. The second load path entry makes those packages visible.
      args.push("-e", "JULIA_DEPOT_PATH=/workspace/.julia:/home/kernel/.julia");
      args.push("-e", "JULIA_LOAD_PATH=@:/workspace:@stdlib");
    }
    args.push(image);
    return { cmd: runtime, args, runtime, name };
  }
  throw new Error("no Julia runtime: install podman, docker or julia (or set SQUERO_JULIA)");
}

function bridge(socket, options) {
  let command;
  const name = `squero-kernel-${process.pid}-${++serial}`;
  try {
    command = kernelCommand({ ...options, name });
  } catch (error) {
    socket.send(JSON.stringify({ ok: false, error: String(error.message ?? error) }));
    socket.close(1011, "no kernel runtime");
    return;
  }
  const child = spawn(command.cmd, command.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(command.env ?? {}) },
  });
  live.set(name, { child, engine: command.runtime === "native" ? null : command.cmd });
  stopAllOnExit();
  let buffer = Buffer.alloc(0);
  let mode = "line";
  let need = 0;

  const pump = () => {
    for (;;) {
      if (mode === "line") {
        const newline = buffer.indexOf(10);
        if (newline < 0) return;
        const line = buffer.subarray(0, newline).toString("utf8");
        buffer = buffer.subarray(newline + 1);
        if (!line.trim()) continue;
        socket.send(line);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        // A matrix (`array`) or a figure artifact (`artifact`) is followed by its raw frame.
        const bytes = Number(message?.array?.bytes ?? message?.artifact?.bytes ?? 0);
        if (bytes > 0) { mode = "frame"; need = bytes; }
        continue;
      }
      if (buffer.length < need) return;
      socket.send(buffer.subarray(0, need), { binary: true });
      buffer = buffer.subarray(need);
      mode = "line";
      need = 0;
    }
  };

  child.stdout.on("data", (chunk) => { buffer = Buffer.concat([buffer, chunk]); pump(); });
  child.stderr.on("data", (chunk) => process.stderr.write(`[kernel] ${chunk}`));
  child.on("error", (error) => {
    socket.send(JSON.stringify({ ok: false, error: `kernel: ${error.message}` }));
    socket.close(1011, "kernel failed");
  });
  child.on("exit", (code, signal) => {
    live.delete(name);
    if (socket.readyState === socket.OPEN) socket.close(1011, `kernel exited ${code ?? signal}`);
  });

  socket.on("message", (data, isBinary) => {
    if (!child.stdin.writable) return;
    if (isBinary) { child.stdin.write(data); return; }
    const text = data.toString();
    child.stdin.write(text.endsWith("\n") ? text : `${text}\n`);
  });
  socket.on("close", () => stopKernel(name));
}

/**
 * Mount `/__mx/kernel` on an HTTP server. Each WebSocket owns one kernel process; text frames
 * carry JSON lines, binary frames carry the matrix payloads named by `array.bytes`.
 */
export function attachKernel(server, options) {
  sweepOrphans();
  const route = options.path ?? "/__mx/kernel";
  const wss = new WebSocketServer({ noServer: true });
  const upgrade = (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== route) return;
    wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, options));
  };
  server.on("upgrade", upgrade);
  return {
    close() {
      for (const name of [...live.keys()]) stopKernel(name, true);  // before the launcher exits
      server.off("upgrade", upgrade);
      for (const client of wss.clients) client.close();
      wss.close();
    },
  };
}
