// Discover every running Paperboat backend through the launcher's own `paperboat list --json`.
// The browser should not have to know ports: MX broadcasts its workspace to all of them.
import { spawn } from "node:child_process";
import { paperboatBinary } from "./optimize.mjs";

let cached = { at: 0, value: null };
let inflight = null;

const runList = (binary) => new Promise((resolve) => {
  const child = spawn(binary, ["list", "--json"], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  };
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    finish({ ok: false, error: "paperboat list timed out", backends: [] });
  }, 10000);
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", (error) => finish({ ok: false, error: error.message, backends: [] }));
  child.on("close", (code) => {
    if (code !== 0) {
      finish({ ok: false, error: (stderr || stdout || `paperboat list exited ${code}`).trim().slice(0, 800), backends: [] });
      return;
    }
    let rows;
    try {
      rows = JSON.parse(stdout.trim() || "[]");
    } catch {
      finish({ ok: false, error: (stderr || "paperboat list printed no JSON").trim().slice(0, 800), backends: [] });
      return;
    }
    const seen = new Set();
    const backends = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.kind !== "backend") continue;
      const ws = String(row.ws_url ?? row.url ?? (row.port ? `ws://localhost:${row.port}` : ""));
      if (!ws.startsWith("ws") || seen.has(ws)) continue;
      seen.add(ws);
      backends.push({
        name: String(row.domain ?? row.name ?? "paperboat"),
        engine: String(row.engine ?? ""),
        port: Number(row.port ?? 0),
        ws,
      });
    }
    finish({ ok: true, error: "", backends });
  });
});

export function listBackends() {
  const now = Date.now();
  if (cached.value && now - cached.at < 2000) return Promise.resolve(cached.value);
  if (inflight) return inflight;
  const binary = paperboatBinary();
  if (!binary) {
    cached = { at: now, value: { ok: false, error: "paperboat not found: build ../paperboat or set PAPERBOAT_BIN", backends: [] } };
    return Promise.resolve(cached.value);
  }
  inflight = runList(binary)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** A Connect-style middleware for `/__mx/backends`. */
export function backendsMiddleware() {
  return (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname.startsWith("/__mx/backends")
      ? url.pathname.slice("/__mx/backends".length) || "/"
      : url.pathname;
    if (route !== "/") {
      next();
      return;
    }
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "GET /" }));
      return;
    }
    void listBackends().then((value) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(value));
    });
  };
}
