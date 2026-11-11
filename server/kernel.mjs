// The launcher side of squero-kernel/0: one Julia kernel per browser WebSocket, bridged over
// stdio. The kernel normally runs in the pinned container with --network=none; SQUERO_JULIA=native
// runs a local checkout instead. Shared by the Vite dev server and bin/squero-mx.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

export const KERNEL_IMAGE = process.env.SQUERO_KERNEL_IMAGE ?? "squero-julia-kernel:1.11.6-r1";
export const KERNEL_PROTOCOL = 0;

// SqueroBase is the verbs' only definition; the kernel loads this checkout. It is mounted read
// only into the container, or passed as SQUERO_BASE to a native julia.
export const SQUERO_BASE =
  process.env.SQUERO_BASE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../squero-mx-base");

const has = (cmd) => {
  const probe = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return probe.status === 0;
};

export function kernelRuntime() {
  if (process.env.SQUERO_JULIA) return process.env.SQUERO_JULIA;
  if (has("podman")) return "podman";
  if (has("docker")) return "docker";
  if (has("julia")) return "native";
  return "none";
}

/** The command that runs the kernel. `workspace` is mounted at /workspace for load/save. */
export function kernelCommand({ workspace, image = KERNEL_IMAGE, runtime = kernelRuntime() } = {}) {
  if (runtime === "native") {
    const repo = process.env.SQUERO_KERNEL_REPO ?? path.resolve(process.cwd(), "../squero-julia-kernel");
    return {
      cmd: "julia",
      args: ["--startup-file=no", `--project=${repo}`, path.join(repo, "src", "kernel.jl")],
      env: { SQUERO_BASE },
      runtime,
    };
  }
  if (runtime === "podman" || runtime === "docker") {
    const args = ["run", "--rm", "-i", "--network=none"];
    if (runtime === "podman") args.push("--userns=keep-id");
    if (workspace) args.push("-v", `${workspace}:/workspace:rw`, "-w", "/workspace");
    if (existsSync(SQUERO_BASE)) {
      // `:z` relabels the read-only mount for SELinux hosts; docker ignores the extra option.
      const mount = runtime === "podman" ? `${SQUERO_BASE}:/opt/squero-mx-base:ro,z` : `${SQUERO_BASE}:/opt/squero-mx-base:ro`;
      args.push("-v", mount, "-e", "SQUERO_BASE=/opt/squero-mx-base");
    }
    args.push(image);
    return { cmd: runtime, args, runtime };
  }
  throw new Error("no Julia runtime: install podman, docker or julia (or set SQUERO_JULIA)");
}

function bridge(socket, options) {
  let command;
  try {
    command = kernelCommand(options);
  } catch (error) {
    socket.send(JSON.stringify({ ok: false, error: String(error.message ?? error) }));
    socket.close(1011, "no kernel runtime");
    return;
  }
  const child = spawn(command.cmd, command.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(command.env ?? {}) },
  });
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
        const bytes = Number(message?.array?.bytes ?? 0);
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
    if (socket.readyState === socket.OPEN) socket.close(1011, `kernel exited ${code ?? signal}`);
  });

  socket.on("message", (data, isBinary) => {
    if (!child.stdin.writable) return;
    if (isBinary) { child.stdin.write(data); return; }
    const text = data.toString();
    child.stdin.write(text.endsWith("\n") ? text : `${text}\n`);
  });
  socket.on("close", () => { if (!child.killed) child.kill("SIGTERM"); });
}

/**
 * Mount `/__mx/kernel` on an HTTP server. Each WebSocket owns one kernel process; text frames
 * carry JSON lines, binary frames carry the matrix payloads named by `array.bytes`.
 */
export function attachKernel(server, options) {
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
      server.off("upgrade", upgrade);
      for (const client of wss.clients) client.close();
      wss.close();
    },
  };
}
