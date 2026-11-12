// The optimization bridge: one fmincon-shaped problem from the kernel → `paperboat optimize`.
// The solver, its readers and its trace stay in Paperboat; this only moves JSON over HTTP.
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The checkout's CLI (bin/paperboat, else the built binary), or $PAPERBOAT_BIN. */
// On Windows bin/paperboat is a bash script node cannot spawn; the build is paperboat.exe, under
// the configuration's folder with the Visual Studio generator.
export function paperboatBinary() {
  if (process.env.PAPERBOAT_BIN) return process.env.PAPERBOAT_BIN;
  const build = path.resolve(here, "../../paperboat/engine/build/tools");
  const candidates = process.platform === "win32"
    ? ["Release", "RelWithDebInfo", "Debug", "."].map((dir) => path.join(build, dir, "paperboat.exe"))
    : [path.resolve(here, "../../paperboat/bin/paperboat"), path.join(build, "paperboat")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  const lookup = process.platform === "win32"
    ? spawnSync("where", ["paperboat.exe"], { encoding: "utf8" })
    : spawnSync("sh", ["-c", "command -v paperboat"], { encoding: "utf8" });
  return lookup.status === 0 ? lookup.stdout.split(/\r?\n/)[0].trim() : "";
}

/** POST { problem, grid? } → the solver's result JSON (trace, x, objective, grid). */
export function optimizeMiddleware() {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/__mx/optimize") {
      next();
      return;
    }
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") {
      send(405, { ok: false, error: "POST a problem" });
      return;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      send(400, { ok: false, error: "invalid JSON" });
      return;
    }
    const problem = body?.problem;
    if (!problem || typeof problem !== "object") {
      send(400, { ok: false, error: "problem is required" });
      return;
    }
    const binary = paperboatBinary();
    if (!binary) {
      send(503, { ok: false, error: "paperboat not found: build ../paperboat or set PAPERBOAT_BIN" });
      return;
    }
    const dir = mkdtempSync(path.join(os.tmpdir(), "mx-optimize-"));
    const file = path.join(dir, "problem.json");
    writeFileSync(file, JSON.stringify(problem));
    const grid = Number.isInteger(body.grid) ? Math.max(2, Math.min(96, body.grid)) : 33;
    // Async: a solve can take a while, and a sync child would stall every other request.
    const run = await new Promise((resolve) => {
      execFile(binary, ["optimize", file, "--json", "--grid", String(grid)], {
        encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024, env: process.env,
      }, (error, stdout, stderr) => resolve({
        stdout, stderr,
        // a non-zero exit still prints its result; only a spawn failure or a timeout is an error
        error: error && (typeof error.code === "string" || error.killed) ? error : undefined,
      }));
    });
    rmSync(dir, { recursive: true, force: true });

    const last = (run.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
    let payload;
    try {
      payload = JSON.parse(last);
    } catch {
      payload = {
        ok: false,
        error: (run.stderr || run.stdout || "the solver printed no result").trim().slice(0, 1200),
      };
    }
    if (run.error) payload = { ok: false, error: run.error.message };
    send(payload.ok ? 200 : 422, payload);
  };
}
