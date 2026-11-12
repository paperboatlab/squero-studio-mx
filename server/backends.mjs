// Discover every running Paperboat backend through the launcher's own `paperboat list --json`.
// The browser should not have to know ports: MX broadcasts its workspace to all of them.
import { spawnSync } from "node:child_process";
import { paperboatBinary } from "./optimize.mjs";

let cached = { at: 0, value: null };

export function listBackends() {
  const now = Date.now();
  if (cached.value && now - cached.at < 2000) return cached.value;
  const binary = paperboatBinary();
  if (!binary) {
    cached = { at: now, value: { ok: false, error: "paperboat not found: build ../paperboat or set PAPERBOAT_BIN", backends: [] } };
    return cached.value;
  }
  const run = spawnSync(binary, ["list", "--json"], {
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  });
  if (run.error) {
    cached = { at: now, value: { ok: false, error: run.error.message, backends: [] } };
    return cached.value;
  }
  let rows;
  try {
    rows = JSON.parse((run.stdout ?? "").trim() || "[]");
  } catch {
    cached = { at: now, value: { ok: false, error: (run.stderr || "paperboat list printed no JSON").trim().slice(0, 800), backends: [] } };
    return cached.value;
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
  cached = { at: now, value: { ok: true, error: "", backends } };
  return cached.value;
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
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(listBackends()));
  };
}
