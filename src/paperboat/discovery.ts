// The launcher discovers running Paperboat backends with `paperboat list --json`; the browser
// has no port to choose and no URL to type.
export type BackendRef = { name: string; engine: string; port: number; ws: string };

export async function discoverBackends(): Promise<{ ok: boolean; error?: string; backends: BackendRef[] }> {
  try {
    const res = await fetch("/__mx/backends", { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}`, backends: [] };
    const value = (await res.json()) as { ok: boolean; error?: string; backends?: BackendRef[] };
    return { ok: Boolean(value.ok), error: value.error, backends: Array.isArray(value.backends) ? value.backends : [] };
  } catch (error) {
    return { ok: false, error: String((error as Error).message ?? error), backends: [] };
  }
}
