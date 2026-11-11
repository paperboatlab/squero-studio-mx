// The default workspace on disk, served by the local dev/preview server (see vite.config.ts).
// It replaces the browser folder picker for `~/Documents/paperboat/squero-studio/mx`, so opening
// the app needs no permission prompt and the files are the real ones.
import type { FileTree, Storage } from "./storage.ts";

const BASE = "/__mx/workspace";

export type ServerWorkspace = FileTree & { root: string; path: string };

export async function loadServerWorkspace(): Promise<ServerWorkspace | null> {
  try {
    const res = await fetch(BASE, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const tree = (await res.json()) as ServerWorkspace;
    if (!tree || typeof tree.root !== "string" || typeof tree.files !== "object") return null;
    return tree;
  } catch {
    return null;
  }
}

async function op(method: string, route: string, query: Record<string, string>, body?: string): Promise<void> {
  const res = await fetch(`${BASE}${route}?${new URLSearchParams(query)}`, { method, body });
  if (!res.ok) throw new Error((await res.text()) || `${method} ${route} failed`);
}

export function serverStorage(): Storage {
  return {
    write: (path, content) => op("PUT", "/file", { path }, content),
    mkdir: (path) => op("POST", "/mkdir", { path }),
    remove: (path, folder) => op("DELETE", "/path", { path, folder: folder ? "1" : "0" }),
    copy: (from, to, folder) => op("POST", "/copy", { from, to, folder: folder ? "1" : "0" }),
  };
}
