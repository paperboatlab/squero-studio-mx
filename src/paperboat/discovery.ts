// The launcher discovers running Paperboat stations with `paperboat list --json`; the browser
// has no port to choose and no URL to type.
export type StationRef = { name: string; engine: string; port: number; ws: string };

export async function discoverStations(): Promise<{ ok: boolean; error?: string; stations: StationRef[] }> {
  try {
    const res = await fetch("/__mx/stations", { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}`, stations: [] };
    const value = (await res.json()) as { ok: boolean; error?: string; stations?: StationRef[] };
    return { ok: Boolean(value.ok), error: value.error, stations: Array.isArray(value.stations) ? value.stations : [] };
  } catch (error) {
    return { ok: false, error: String((error as Error).message ?? error), stations: [] };
  }
}
