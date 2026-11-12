// The Julia General registry, read through the launcher. The Julia depot already carries a
// General.tar.gz; when it is missing we fetch the GitHub archive once and cache it. Search only
// needs Registry.toml; Package.toml, Versions.toml and Deps.toml are read per package.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const GENERAL_URL = process.env.MX_GENERAL_URL ?? "https://github.com/JuliaRegistries/General/archive/refs/heads/master.tar.gz";
const cacheDir = () => path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "squero-mx");
const cacheFile = () => path.join(cacheDir(), "general.tar.gz");
const localRegistry = () => process.env.MX_REGISTRY ?? path.join(os.homedir(), ".julia", "registries", "General.tar.gz");

let registryPromise = null;
const githubCache = new Map();

async function archive() {
  const local = localRegistry();
  if (existsSync(local)) return { file: local, source: "julia depot" };
  const cached = cacheFile();
  if (existsSync(cached)) return { file: cached, source: "cache" };
  await fs.mkdir(path.dirname(cached), { recursive: true });
  const res = await fetch(GENERAL_URL, { headers: { "user-agent": "squero-mx" } });
  if (!res.ok) throw new Error(`General registry: ${res.status} ${res.statusText}`);
  await fs.writeFile(cached, Buffer.from(await res.arrayBuffer()));
  return { file: cached, source: "github" };
}

function readEntry(file, prefix, entry) {
  for (const name of [entry, `${prefix}${entry}`]) {
    const run = spawnSync("tar", ["-xOzf", file, name], {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (run.status === 0 && run.stdout?.trim()) return run.stdout;
  }
  return "";
}

function parseRegistry(text) {
  const entries = [];
  const re = /^([0-9a-fA-F-]{36})\s*=\s*\{\s*name\s*=\s*"([^"]+)"\s*,\s*path\s*=\s*"([^"]+)"\s*\}/gm;
  let match;
  while ((match = re.exec(text))) entries.push({ uuid: match[1], name: match[2], path: match[3] });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, byName: new Map(entries.map((entry) => [entry.name.toLowerCase(), entry])) };
}

async function load() {
  if (!registryPromise) {
    registryPromise = (async () => {
      const { file, source } = await archive();
      let prefix = "";
      let text = readEntry(file, "", "Registry.toml");
      for (const candidate of ["General-master/", "General-main/"]) {
        if (text) break;
        prefix = candidate;
        text = readEntry(file, "", `${candidate}Registry.toml`);
      }
      if (!text) throw new Error("Registry.toml not found in the General archive");
      return { file, prefix, source, ...parseRegistry(text) };
    })().catch((error) => {
      registryPromise = null;
      throw error;
    });
  }
  return registryPromise;
}

export async function registrySearch(query, limit = 30) {
  const registry = await load();
  const needle = query.trim().toLowerCase();
  if (!needle) return { source: registry.source, total: 0, results: [] };
  const hits = [];
  for (const entry of registry.entries) {
    if (entry.name.toLowerCase().includes(needle)) hits.push(entry);
  }
  hits.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const bp = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
    return ap - bp || a.name.length - b.name.length || a.name.localeCompare(b.name);
  });
  return {
    source: registry.source,
    total: hits.length,
    results: hits.slice(0, Math.max(1, Math.min(50, limit))),
  };
}

function keyValues(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(\w+)\s*=\s*"([^"]*)"/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

function versionsOf(text) {
  const list = [...text.matchAll(/^\["([^"]+)"\]\s*$/gm)].map((match) => match[1]);
  return list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}

function depsOf(text) {
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"/.exec(line.trim());
    if (match && match[1] !== "julia") names.add(match[1]);
  }
  return [...names].sort();
}

async function githubInfo(repo) {
  const match = /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?$/.exec(repo);
  if (!match) return null;
  const key = `${match[1]}/${match[2].replace(/\.git$/, "")}`;
  const cached = githubCache.get(key);
  if (cached && Date.now() - cached.at < (cached.value.error ? 60_000 : 3_600_000)) return cached.value;
  try {
    const res = await fetch(`https://api.github.com/repos/${key}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "squero-mx",
      },
    });
    if (!res.ok) {
      const value = { error: res.status === 403 ? "GitHub rate limit" : `GitHub ${res.status}` };
      githubCache.set(key, { at: Date.now(), value });
      return value;
    }
    const data = await res.json();
    const value = {
      description: data.description ?? "",
      stars: Number(data.stargazers_count ?? 0),
      topics: Array.isArray(data.topics) ? data.topics : [],
      updated: data.updated_at ?? "",
      url: data.html_url ?? repo,
    };
    githubCache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    const value = { error: String(error?.message ?? error) };
    githubCache.set(key, { at: Date.now(), value });
    return value;
  }
}

export async function registryPackage(name) {
  const registry = await load();
  const key = name.trim().toLowerCase();
  const entry = registry.byName.get(key);
  if (!entry) throw new Error(`not in the General registry: ${name || "empty"}`);
  const base = `${entry.path}/`;
  const packageToml = readEntry(registry.file, registry.prefix, `${base}Package.toml`);
  const versionsToml = readEntry(registry.file, registry.prefix, `${base}Versions.toml`);
  const depsToml = readEntry(registry.file, registry.prefix, `${base}Deps.toml`);
  const info = keyValues(packageToml);
  const versions = versionsOf(versionsToml);
  const repo = info.repo ?? "";
  return {
    name: info.name ?? entry.name,
    uuid: info.uuid ?? entry.uuid,
    repo,
    latest: versions[0] ?? "",
    versionCount: versions.length,
    versions: versions.slice(0, 10),
    deps: depsOf(depsToml),
    github: repo ? await githubInfo(repo) : null,
  };
}
