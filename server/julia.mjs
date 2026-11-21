// The Julia environment bridge: juliaup on the host, and the workspace project's packages.
// The launcher owns every command; the panel only renders what they report. Package work runs
// in the same place as the kernel (native Julia or the kernel container), with the workspace
// mounted so Project.toml, Manifest.toml and the depot persist next to the scripts.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { KERNEL_IMAGE, MOUNT_ARGS, NO_RUNTIME, kernelRuntime } from "./kernel.mjs";
import { registryFeatured, registryPackage, registrySearch } from "./registry.mjs";

const ADD = `using Pkg; Pkg.activate(ARGS[1]; io = devnull); Pkg.add(ARGS[2])`;
const REMOVE = `using Pkg; Pkg.activate(ARGS[1]; io = devnull); Pkg.rm(ARGS[2])`;
const UPDATE = `using Pkg; Pkg.activate(ARGS[1]; io = devnull); Pkg.update()`;

const NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const ADD_SPEC = /^[A-Za-z_][A-Za-z0-9_.]*(?:@[A-Za-z0-9_.\-+]+)?$/;

/** One entry per juliaup channel, from the fixed-width table `juliaup status` prints. */
export function parseJuliaupStatus(text) {
  const channels = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^-+$/.test(line) || /^Default\b/i.test(line)) continue;
    const parts = line.split(/\s+/);
    let index = 0;
    const isDefault = parts[0] === "*";
    if (isDefault) index = 1;
    const channel = parts[index++];
    if (!channel) continue;
    const version = parts[index++] ?? "";
    const update = parts[index++] ?? "";
    channels.push({ channel, version, update, default: isDefault });
  }
  return channels;
}

/**
 * The project's direct dependencies with their resolved versions, read from the Project.toml and
 * Manifest.toml Pkg writes (canonical TOML, so lines suffice): no Julia process, so it is instant.
 */
export function parseProject(projectText = "", manifestText = "") {
  const deps = [];
  let inDeps = false;
  for (const raw of projectText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) { inDeps = line === "[deps]"; continue; }
    const hit = inDeps && /^"?([A-Za-z_][A-Za-z0-9_.]*)"?\s*=\s*"([0-9a-f-]{36})"/.exec(line);
    if (hit) deps.push({ name: hit[1], uuid: hit[2] });
  }
  const versions = new Map();
  let current = "";
  for (const raw of manifestText.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^\[\[deps\.("?)([^"\]]+)\1\]\]$/.exec(line);
    if (head) { current = head[2]; continue; }
    if (line.startsWith("[")) { current = ""; continue; }
    const version = current && /^version\s*=\s*"([^"]+)"/.exec(line);
    if (version && !versions.has(current)) versions.set(current, version[1]);
  }
  const julia = /^julia_version\s*=\s*"([^"]+)"/m.exec(manifestText)?.[1] ?? "";
  return {
    julia,
    packages: deps.sort((a, b) => a.name.localeCompare(b.name)).map((d) => ({ ...d, version: versions.get(d.name) ?? "" })),
  };
}

export function validPackageName(name, add = false) {
  if (typeof name !== "string") return false;
  const value = name.trim();
  if (!value || value.length > 120) return false;
  return (add ? ADD_SPEC : NAME).test(value);
}

const runCommand = (cmd, args, timeout, onData) => new Promise((resolve) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(result);
  };
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    finish({ ok: false, output: `${stdout}${stderr}`.trim(), error: `${cmd}: timed out` });
  }, timeout);
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); onData?.(chunk.toString()); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); onData?.(chunk.toString()); });
  child.on("error", (error) => finish({ ok: false, output: `${stdout}${stderr}`.trim(), error: error.message }));
  child.on("close", (code) => {
    const output = `${stdout}${stderr}`.trim();
    finish({ ok: code === 0, output, error: code === 0 ? "" : output.slice(-1600) || `${cmd} exited ${code}` });
  });
});

const probe = async (cmd, args = ["--version"]) => {
  const run = await runCommand(cmd, args, 15000);
  return run.ok ? { stdout: run.output } : null;
};

const runner = ({ workspace, runtime, image, network = false, script, args = [] }) => {
  if (runtime === "podman" || runtime === "docker") {
    const call = ["run", "--rm", "--entrypoint", "julia"];
    if (!network) call.push("--network=none");
    if (runtime === "podman") call.push("--user", "0:0"); // see kernelCommand: reaches FUSE workspaces
    call.push(
      ...MOUNT_ARGS,
      "-v", `${workspace}:/workspace:rw`,
      "-w", "/workspace",
      "-e", "JULIA_DEPOT_PATH=/workspace/.julia:/home/kernel/.julia",
      "-e", "JULIA_LOAD_PATH=@:/workspace:@stdlib",
      image,
      "--startup-file=no", "--project=/workspace",
      "-e", script, "/workspace", ...args,
    );
    return { cmd: runtime, args: call };
  }
  if (runtime === "native") {
    return {
      cmd: "julia",
      args: ["--startup-file=no", `--project=${workspace}`, "-e", script, workspace, ...args],
    };
  }
  return null;
};

const execute = (call, timeout, onData) => runCommand(call.cmd, call.args, timeout, onData);

async function juliaupInfo() {
  const tool = await probe("juliaup", ["--version"]);
  if (!tool) return { present: false, channels: [] };
  const version = (tool.stdout ?? "").trim().replace(/^Juliaup\s+/i, "");
  const status = await probe("juliaup", ["status"]);
  return {
    present: true,
    version,
    channels: status ? parseJuliaupStatus(status.stdout ?? "") : [],
    error: status ? "" : "juliaup status failed",
  };
}

const readText = (file) => fs.readFile(file, "utf8").catch(() => "");

export async function juliaStatus({ workspace, runtime = kernelRuntime(), image = KERNEL_IMAGE }) {
  const projectPath = path.resolve(workspace);
  const projectFile = path.join(projectPath, "Project.toml");
  await fs.mkdir(projectPath, { recursive: true });
  const project = parseProject(await readText(projectFile), await readText(path.join(projectPath, "Manifest.toml")));
  return {
    runtime: { kind: runtime, image },
    project: {
      path: projectPath,
      name: path.basename(projectPath),
      exists: existsSync(projectFile),
      projectFile,
    },
    // juliaup manages the host's Julia: only a native kernel runs it.
    juliaup: runtime === "native" ? await juliaupInfo() : { present: false, channels: [] },
    julia: { present: runtime !== "none", version: project.julia },
    packages: project.packages,
    packageError: runtime === "none" ? NO_RUNTIME : "",
  };
}

async function packageOp(options, action, name, onData) {
  const projectPath = path.resolve(options.workspace);
  const call = runner({
    workspace: projectPath,
    runtime: options.runtime,
    image: options.image,
    network: true,
    script: action === "add" ? ADD : action === "remove" ? REMOVE : UPDATE,
    args: action === "update" ? [] : [name],
  });
  if (!call) return { ok: false, output: "", error: NO_RUNTIME };
  await fs.mkdir(projectPath, { recursive: true });
  return await execute(call, 600000, onData);
}

async function updateJuliaup(onData) {
  if (!(await probe("juliaup", ["--version"]))) {
    return { ok: false, output: "", error: "juliaup is not installed" };
  }
  return await execute({ cmd: "juliaup", args: ["update"] }, 600000, onData);
}

const body = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

/**
 * A slow Pkg job, streamed: NDJSON `{"log": text}` lines as Pkg prints, then one
 * `{"done": true, ...status, ok, error, output}` line.
 */
async function stream(res, job, options) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  const run = await job((text) => res.write(`${JSON.stringify({ log: text })}\n`));
  const status = await juliaStatus(options);
  res.end(`${JSON.stringify({ done: true, ...status, ok: run.ok, error: run.error, output: run.output })}\n`);
}

/** A Connect-style middleware for `/__mx/julia`. */
export function juliaMiddleware({ workspace, runtime = kernelRuntime(), image = KERNEL_IMAGE }) {
  const options = { workspace, runtime, image };
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname.startsWith("/__mx/julia")
      ? url.pathname.slice("/__mx/julia".length) || "/"
      : url.pathname;
    const allowed = new Set(["/", "/package", "/update", "/registry", "/registry/package", "/registry/featured"]);
    if (!allowed.has(route)) {
      next();
      return;
    }
    const reply = (status, value) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(value));
    };
    try {
      if (req.method === "GET" && route === "/") {
        return reply(200, { ok: true, ...(await juliaStatus(options)) });
      }
      if (req.method === "GET" && route === "/registry") {
        const query = url.searchParams.get("q") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? 30);
        return reply(200, { ok: true, ...(await registrySearch(query, Number.isFinite(limit) ? limit : 30)) });
      }
      if (req.method === "GET" && route === "/registry/package") {
        return reply(200, { ok: true, ...(await registryPackage(url.searchParams.get("name") ?? "")) });
      }
      if (req.method === "GET" && route === "/registry/featured") {
        return reply(200, { ok: true, ...(await registryFeatured()) });
      }
      if (req.method === "POST" && route === "/package") {
        const payload = JSON.parse(await body(req));
        const action = payload?.action;
        const name = String(payload?.name ?? "").trim();
        if (action !== "add" && action !== "remove") return reply(400, { ok: false, error: "action must be add or remove" });
        if (!validPackageName(name, action === "add")) return reply(400, { ok: false, error: `not a package name: ${name || "empty"}` });
        return stream(res, (onData) => packageOp(options, action, name, onData), options);
      }
      if (req.method === "POST" && route === "/update") {
        const payload = JSON.parse(await body(req));
        const target = payload?.target;
        if (target !== "julia" && target !== "packages") return reply(400, { ok: false, error: "target must be julia or packages" });
        return stream(res, (onData) => (target === "julia" ? updateJuliaup(onData) : packageOp(options, "update", undefined, onData)), options);
      }
      return reply(405, { ok: false, error: "GET / or POST /package, /update" });
    } catch (error) {
      return reply(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
}
