// The julia up panel's launcher API: status, juliaup update, package add/remove/update. The
// browser never runs a command; the launcher does, in the kernel's runtime.
const BASE = "/__mx/julia";

export type JuliaChannel = { channel: string; version: string; update: string; default: boolean };
export type JuliaPackage = { name: string; uuid: string; version: string };

export type JuliaStatus = {
  ok: boolean;
  error?: string;
  output?: string;
  runtime: { kind: string; image: string };
  project: { path: string; name: string; exists: boolean; projectFile: string };
  juliaup: { present: boolean; version?: string; channels: JuliaChannel[]; error?: string };
  julia: { present: boolean; version: string };
  packages: JuliaPackage[];
  packageError?: string;
};

export type RegistryEntry = { name: string; uuid: string; path: string; latest?: string; repo?: string };
export type RegistrySearch = { ok: boolean; source: string; total: number; results: RegistryEntry[]; error?: string };
export type RegistryGithub = { description?: string; stars?: number; topics?: string[]; updated?: string; url?: string; error?: string };
export type RegistryPackage = {
  ok: boolean;
  name: string;
  uuid: string;
  repo: string;
  latest: string;
  versionCount: number;
  versions: string[];
  deps: string[];
  github: RegistryGithub | null;
  error?: string;
};

async function read(res: Response): Promise<JuliaStatus> {
  let value: JuliaStatus;
  try {
    value = (await res.json()) as JuliaStatus;
  } catch {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  if (!res.ok && value.ok !== false) throw new Error(value.error ?? `${res.status} ${res.statusText}`);
  return value;
}

export async function loadJulia(): Promise<JuliaStatus> {
  return read(await fetch(BASE, { headers: { accept: "application/json" } }));
}

/** A Pkg job: `onLog` gets Pkg's output as it prints; resolves with the status after it. */
async function streamed(res: Response, onLog?: (text: string) => void): Promise<JuliaStatus> {
  if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) return read(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += value;
    let newline: number;
    while ((newline = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line) as { log?: string; done?: boolean } & JuliaStatus;
      if (message.done) return message;
      if (message.log) onLog?.(message.log);
    }
  }
  throw new Error("the launcher stopped before the job finished");
}

const post = (route: string, body: unknown) =>
  fetch(`${BASE}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function juliaPackage(action: "add" | "remove", name: string, onLog?: (text: string) => void): Promise<JuliaStatus> {
  return streamed(await post("/package", { action, name }), onLog);
}

export async function juliaUpdate(target: "julia" | "packages", onLog?: (text: string) => void): Promise<JuliaStatus> {
  return streamed(await post("/update", { target }), onLog);
}

export async function searchRegistry(query: string): Promise<RegistrySearch> {
  const res = await fetch(`${BASE}/registry?q=${encodeURIComponent(query)}`);
  return readJson<RegistrySearch>(res);
}

export async function loadFeaturedRegistry(): Promise<RegistrySearch> {
  const res = await fetch(`${BASE}/registry/featured`);
  return readJson<RegistrySearch>(res);
}

export async function loadRegistryPackage(name: string): Promise<RegistryPackage> {
  const res = await fetch(`${BASE}/registry/package?name=${encodeURIComponent(name)}`);
  return readJson<RegistryPackage>(res);
}

async function readJson<T>(res: Response): Promise<T> {
  let value: T;
  try {
    value = (await res.json()) as T;
  } catch {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  if (!res.ok && (value as { ok?: boolean }).ok !== false) throw new Error((value as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  return value;
}
