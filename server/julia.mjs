// The Julia environment bridge: juliaup on the host, and the workspace project's packages.
// The launcher owns every command; the panel only renders what they report. Package work runs
// in the same place as the kernel (native Julia or the kernel container), with the workspace
// mounted so Project.toml, Manifest.toml and the depot persist next to the scripts.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { KERNEL_IMAGE, kernelRuntime } from "./kernel.mjs";
import { registryFeatured, registryPackage, registrySearch } from "./registry.mjs";

const LIST = `
print("JULIA\\t", VERSION, "\\n")
using Pkg
Pkg.activate(ARGS[1]; io = devnull)
deps = Pkg.dependencies()
for (name, uuid) in sort(collect(Pkg.project().dependencies); by = first)
    info = get(deps, uuid, nothing)
    version = info === nothing || info.version === nothing ? "" : string(info.version)
    println("PKG\\t", name, "\\t", uuid, "\\t", version)
end
`;

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

/** Package rows the Julia listing prints as `PKG<TAB>name<TAB>uuid<TAB>version`. */
export function parsePackages(text) {
  const packages = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("PKG\t")) continue;
    const [, name, uuid, version = ""] = line.split("\t");
    if (name) packages.push({ name, uuid, version });
  }
  return packages;
}

export function juliaVersion(text) {
  const line = text.split(/\r?\n/).find((one) => one.startsWith("JULIA\t"));
  return line ? line.split("\t")[1] ?? "" : "";
}

export function validPackageName(name, add = false) {
  if (typeof name !== "string") return false;
  const value = name.trim();
  if (!value || value.length > 120) return false;
  return (add ? ADD_SPEC : NAME).test(value);
}

const runCommand = (cmd, args, timeout) => new Promise((resolve) => {
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
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
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
    if (runtime === "podman") call.push("--userns=keep-id");
    call.push(
      "-v", `${workspace}:/workspace:rw${runtime === "podman" ? ",z" : ""}`,
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

const execute = (call, timeout) => runCommand(call.cmd, call.args, timeout);

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

export async function juliaStatus({ workspace, runtime = kernelRuntime(), image = KERNEL_IMAGE }) {
  const projectPath = path.resolve(workspace);
  const projectFile = path.join(projectPath, "Project.toml");
  const status = {
    runtime: { kind: runtime, image },
    project: {
      path: projectPath,
      name: path.basename(projectPath),
      exists: existsSync(projectFile),
      projectFile,
    },
    juliaup: await juliaupInfo(),
    julia: { present: false, version: "" },
    packages: [],
    packageError: "",
  };
  await fs.mkdir(projectPath, { recursive: true });
  const call = runner({ workspace: projectPath, runtime, image, script: LIST });
  if (!call) {
    status.packageError = "no Julia runtime: install julia, podman or docker (or set SQUERO_JULIA)";
    return status;
  }
  const listed = await execute(call, 120000);
  const version = juliaVersion(listed.output);
  status.julia = { present: Boolean(version), version };
  if (!listed.ok) status.packageError = listed.error;
  status.packages = parsePackages(listed.output);
  return status;
}

async function packageOp(options, action, name) {
  const projectPath = path.resolve(options.workspace);
  const call = runner({
    workspace: projectPath,
    runtime: options.runtime,
    image: options.image,
    network: true,
    script: action === "add" ? ADD : action === "remove" ? REMOVE : UPDATE,
    args: action === "update" ? [] : [name],
  });
  if (!call) return { ok: false, output: "", error: "no Julia runtime" };
  await fs.mkdir(projectPath, { recursive: true });
  return await execute(call, 600000);
}

async function updateJuliaup() {
  if (!(await probe("juliaup", ["--version"]))) {
    return { ok: false, output: "", error: "juliaup is not installed" };
  }
  return await execute({ cmd: "juliaup", args: ["update"] }, 600000);
}

const body = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

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
        const run = await packageOp(options, action, name);
        const status = await juliaStatus(options);
        return reply(200, {
          ...status,
          ok: run.ok,
          error: run.error,
          output: run.output,
        });
      }
      if (req.method === "POST" && route === "/update") {
        const payload = JSON.parse(await body(req));
        const target = payload?.target;
        if (target !== "julia" && target !== "packages") return reply(400, { ok: false, error: "target must be julia or packages" });
        const run = target === "julia" ? await updateJuliaup() : await packageOp(options, "update");
        const status = await juliaStatus(options);
        return reply(200, {
          ...status,
          ok: run.ok,
          error: run.error,
          output: run.output,
        });
      }
      return reply(405, { ok: false, error: "GET / or POST /package, /update" });
    } catch (error) {
      return reply(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
}
