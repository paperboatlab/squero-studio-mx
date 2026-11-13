// The default workspace on disk, shared by the Vite dev/preview server and bin/squero-mx.
// It removes the folder-permission prompt for `~/Documents/paperboat/squero-studio/mx`;
// the browser picker still opens any other folder.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_WORKSPACE =
  process.env.MX_WORKSPACE ?? path.join(os.homedir(), "Documents/paperboat/squero-studio/mx");

export const shortRoot = (root) => (root.startsWith(os.homedir()) ? `~${root.slice(os.homedir().length)}` : root);

const inside = (root, relative) => {
  if (!relative || relative.startsWith("/") || relative.includes("\0")) return null;
  const target = path.resolve(root, relative);
  return target === root || target.startsWith(root + path.sep) ? target : null;
};

async function readTree(root, dir = root, prefix = "") {
  const files = {};
  const folders = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { files, folders };
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      folders.push(rel);
      const child = await readTree(root, full, rel);
      Object.assign(files, child.files);
      folders.push(...child.folders);
    } else if (entry.name.endsWith(".jl")) {
      const stat = await fs.stat(full);
      if (stat.size <= 2 * 1024 * 1024) files[rel] = await fs.readFile(full, "utf8");
    }
  }
  return { files, folders: folders.sort() };
}

/** `git <args>` in the workspace: stdout, or null when git is missing, it is no repo, or the call fails. */
const git = (root, args) =>
  new Promise((resolve) => {
    execFile("git", args, { cwd: root, maxBuffer: 32 << 20, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } },
      (error, stdout) => resolve(error ? null : stdout));
  });
const paths = (z) => (z ?? "").split("\0").filter(Boolean);

/**
 * The editor's git gutter: each tracked .jl at HEAD (`head`), and the .jl files HEAD lacks
 * (`untracked`: untracked, or staged but not committed). Paths are workspace-relative.
 * null when the workspace is not inside a git repository.
 */
async function gitState(root) {
  const tracked = await git(root, ["ls-files", "-z", "--", "*.jl"]);
  if (tracked === null) return null;
  const untracked = paths(await git(root, ["ls-files", "-z", "--others", "--exclude-standard", "--", "*.jl"]));
  const head = {};
  // ponytail: one `git show` per tracked file; batch through `git cat-file --batch` if workspaces grow to hundreds of scripts.
  await Promise.all(paths(tracked).map(async (file) => {
    const text = await git(root, ["show", `HEAD:./${file}`]);
    if (text === null) untracked.push(file);
    else head[file] = text;
  }));
  return { head, untracked };
}

const body = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

/** A Connect-style middleware for `/__mx/workspace`. `root` defaults to the MX folder. */
export function workspaceMiddleware(root = DEFAULT_WORKSPACE) {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const reply = (code, value) => {
      res.statusCode = code;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(value));
    };
    try {
      const pathname = url.pathname.replace(/^\/__mx\/workspace/, "") || "/";
      if (req.method === "GET" && pathname === "/") {
        await fs.mkdir(root, { recursive: true });
        const tree = await readTree(root);
        return reply(200, { root: shortRoot(root), path: root, ...tree });
      }
      if (req.method === "GET" && pathname === "/git") return reply(200, await gitState(root));
      if (req.method === "PUT" && pathname === "/file") {
        const target = inside(root, url.searchParams.get("path") ?? "");
        if (!target || !target.endsWith(".jl")) return reply(400, { error: "a .jl path inside the workspace is required" });
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, await body(req), "utf8");
        return reply(200, { ok: true });
      }
      if (req.method === "POST" && pathname === "/mkdir") {
        const target = inside(root, url.searchParams.get("path") ?? "");
        if (!target) return reply(400, { error: "a path inside the workspace is required" });
        await fs.mkdir(target, { recursive: true });
        return reply(200, { ok: true });
      }
      if (req.method === "DELETE" && pathname === "/path") {
        const target = inside(root, url.searchParams.get("path") ?? "");
        if (!target) return reply(400, { error: "a path inside the workspace is required" });
        await fs.rm(target, { recursive: url.searchParams.get("folder") === "1", force: true });
        return reply(200, { ok: true });
      }
      if (req.method === "POST" && pathname === "/copy") {
        const from = inside(root, url.searchParams.get("from") ?? "");
        const to = inside(root, url.searchParams.get("to") ?? "");
        if (!from || !to) return reply(400, { error: "paths inside the workspace are required" });
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.cp(from, to, { recursive: url.searchParams.get("folder") === "1" });
        return reply(200, { ok: true });
      }
      return reply(404, { error: "not a workspace op" });
    } catch (error) {
      return reply(500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}
