import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Dev server only for now. The MX launcher (later) will serve dist/ and the kernel bridge.
// dedupe: @paperboat/shared is a linked sibling with its own node_modules; keep one React and one three.

/**
 * The default workspace on disk: `~/Documents/paperboat/squero-studio/mx` (override with
 * MX_WORKSPACE). The browser cannot open a folder without a picker prompt, so the app reads and
 * writes it through this local endpoint instead. No upload, no permission per session; the
 * picker stays for choosing another folder.
 */
const workspaceRoot = process.env.MX_WORKSPACE ?? path.join(os.homedir(), "Documents/paperboat/squero-studio/mx");

const shortRoot = (root: string) => (root.startsWith(os.homedir()) ? `~${root.slice(os.homedir().length)}` : root);

const inside = (relative: string): string | null => {
  if (!relative || relative.startsWith("/") || relative.includes("\0")) return null;
  const target = path.resolve(workspaceRoot, relative);
  return target === workspaceRoot || target.startsWith(workspaceRoot + path.sep) ? target : null;
};

async function readTree(dir = workspaceRoot, prefix = ""): Promise<{ files: Record<string, string>; folders: string[] }> {
  const files: Record<string, string> = {};
  const folders: string[] = [];
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
      const child = await readTree(full, rel);
      Object.assign(files, child.files);
      folders.push(...child.folders);
    } else if (entry.name.endsWith(".jl")) {
      const stat = await fs.stat(full);
      if (stat.size <= 2 * 1024 * 1024) files[rel] = await fs.readFile(full, "utf8");
    }
  }
  return { files, folders: folders.sort() };
}

const body = (req: import("node:http").IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

function workspaceApi(): Plugin {
  const middleware = async (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const reply = (code: number, value: unknown) => {
      res.statusCode = code;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(value));
    };
    try {
      const pathname = url.pathname.replace(/^\/__mx\/workspace/, "") || "/";
      if (req.method === "GET" && pathname === "/") {
        await fs.mkdir(workspaceRoot, { recursive: true });
        const tree = await readTree();
        return reply(200, { root: shortRoot(workspaceRoot), path: workspaceRoot, ...tree });
      }
      if (req.method === "PUT" && pathname === "/file") {
        const target = inside(url.searchParams.get("path") ?? "");
        if (!target || !target.endsWith(".jl")) return reply(400, { error: "a .jl path inside the workspace is required" });
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, await body(req), "utf8");
        return reply(200, { ok: true });
      }
      if (req.method === "POST" && pathname === "/mkdir") {
        const target = inside(url.searchParams.get("path") ?? "");
        if (!target) return reply(400, { error: "a path inside the workspace is required" });
        await fs.mkdir(target, { recursive: true });
        return reply(200, { ok: true });
      }
      if (req.method === "DELETE" && pathname === "/path") {
        const target = inside(url.searchParams.get("path") ?? "");
        if (!target) return reply(400, { error: "a path inside the workspace is required" });
        await fs.rm(target, { recursive: url.searchParams.get("folder") === "1", force: true });
        return reply(200, { ok: true });
      }
      if (req.method === "POST" && pathname === "/copy") {
        const from = inside(url.searchParams.get("from") ?? "");
        const to = inside(url.searchParams.get("to") ?? "");
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

  return {
    name: "mx-workspace",
    configureServer(server) {
      server.middlewares.use("/__mx/workspace", middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__mx/workspace", middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), workspaceApi()],
  resolve: { dedupe: ["react", "react-dom", "three"] },
  build: { chunkSizeWarningLimit: 900 },
  server: { port: 3049, fs: { allow: [".."] } },
  preview: { port: 3049 },
});
