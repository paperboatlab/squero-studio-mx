// The julia up panel: juliaup channels, the workspace project, its direct packages, and the
// General registry, in the shared package panel (@paperboat/shared/packages). This file is the
// adapter: it loads through the launcher (client.ts) and hands the panel data and actions.
// Launcher work is slow (Pkg can resolve for a while), so one operation runs at a time.
import { useEffect, useRef, useState } from "react";
import { PackagePanel, type RegistryItem } from "@paperboat/shared/packages";
import {
  juliaPackage, juliaUpdate, loadFeaturedRegistry, loadJulia, loadRegistryPackage, searchRegistry,
  type JuliaStatus, type RegistryEntry,
} from "./client.ts";

type Level = "info" | "ok" | "warn";

const stars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const item = (e: RegistryEntry): RegistryItem => ({ name: e.name, latest: e.latest, note: e.path, repo: e.repo });
const message = (failure: unknown) => String((failure as Error).message ?? failure);

export function JuliaPanel({ onSay }: { onSay?: (text: string, level: Level) => void }) {
  const [status, setStatus] = useState<JuliaStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [featured, setFeatured] = useState<RegistryItem[]>([]);
  const [shelf, setShelf] = useState({ loading: "", error: "", source: "", loaded: false });
  const alive = useRef(true);

  const refresh = async (announce = false) => {
    setBusy("reading julia");
    setError("");
    try {
      const next = await loadJulia();
      if (!alive.current) return;
      setStatus(next);
      setError(next.packageError ?? next.error ?? "");
      setOutput(next.output ?? "");
      if (announce) onSay?.(`julia: ${next.packages.length} package${next.packages.length === 1 ? "" : "s"}`, "info");
    } catch (failure) {
      if (alive.current) setError(message(failure));
    } finally {
      if (alive.current) setBusy("");
    }
  };

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
    // The panel reads the launcher once per mount; Reload refreshes it.
  }, []);

  // The popular shelf, once (retry reads it again).
  useEffect(() => {
    if (shelf.loaded) return;
    let live = true;
    setShelf((s) => ({ ...s, loading: "loading the popular shelf", error: "" }));
    void loadFeaturedRegistry()
      .then((found) => {
        if (!found.ok) throw new Error(found.error ?? "registry shelf failed");
        if (live) setFeatured((found.results ?? []).map(item)), setShelf({ loading: "", error: "", source: found.source ?? "", loaded: true });
      })
      .catch((failure) => live && setShelf((s) => ({ ...s, loading: "", error: message(failure) })));
    return () => {
      live = false;
    };
  }, [shelf.loaded]);

  const run = async (label: string, job: () => Promise<JuliaStatus>, done: string) => {
    setBusy(label);
    setError("");
    try {
      const next = await job();
      if (!alive.current) return;
      setStatus(next);
      setOutput(next.output ?? "");
      if (next.ok) onSay?.(done, "ok");
      else {
        setError(next.error || `${label} failed`);
        onSay?.(next.error || `${label} failed`, "warn");
      }
    } catch (failure) {
      if (alive.current) setError(message(failure));
      onSay?.(message(failure), "warn");
    } finally {
      if (alive.current) setBusy("");
    }
  };

  const project = status?.project;
  const packages = status?.packages ?? [];
  const channels = status?.juliaup.channels ?? [];
  const canPackages = Boolean(status?.julia.present);

  return (
    <PackagePanel
      busy={busy}
      error={error}
      output={output}
      loading={busy ? "Reading the Julia kernel, workspace and packages" : undefined}
      runtime={{
        title: "julia up",
        tag: status ? (status.juliaup.present ? `juliaup ${status.juliaup.version ?? ""}`.trim() : "juliaup not found") : undefined,
        channels: channels.map((c) => ({ name: c.channel, version: c.version, update: c.update || undefined, current: c.default })),
        hint: status
          ? status.juliaup.present
            ? "juliaup has no channels installed."
            : "Install juliaup to update Julia versions from here; the workspace environment still works."
          : undefined,
        update: {
          label: "Update",
          title: "Update the juliaup channels on this machine",
          disabled: !status?.juliaup.present,
          run: () => void run("updating julia", () => juliaUpdate("julia"), "juliaup: updated"),
        },
      }}
      environment={
        status && {
          title: "environment",
          tag: status.julia.present ? `julia ${status.julia.version}` : "no julia",
          path: project?.path,
          tags: [project?.exists ? "Project.toml" : "no Project.toml yet", `${status.runtime.kind} · ${status.runtime.image}`],
          packages: packages.map((p) => ({ name: p.name, version: p.version })),
          empty: "No packages in this project yet. Add one from the registry.",
          remove: canPackages ? (name) => void run(`removing ${name}`, () => juliaPackage("remove", name), `julia: removed ${name}`) : undefined,
          actions: [
            { label: "Reload", run: () => void refresh(true) },
            {
              label: "Update packages",
              disabled: !canPackages || packages.length === 0,
              run: () => void run("updating packages", () => juliaUpdate("packages"), "julia: packages updated"),
            },
          ],
        }
      }
      registry={{
        title: "General",
        source: shelf.source,
        items: featured,
        itemsLabel: "popular",
        loading: shelf.loading,
        error: shelf.error,
        retry: () => setShelf((s) => ({ ...s, loaded: false })),
        search: async (query) => {
          const found = await searchRegistry(query);
          if (!found.ok) throw new Error(found.error ?? "registry search failed");
          return { results: (found.results ?? []).map(item), total: found.total ?? 0 };
        },
        detail: async (name) => {
          const d = await loadRegistryPackage(name);
          if (!d.ok) throw new Error(d.error ?? `not in the registry: ${name}`);
          return {
            name: d.name,
            latest: d.latest,
            description: d.github?.description || "No description from GitHub yet.",
            repo: d.repo,
            versions: d.versions,
            id: d.uuid.slice(0, 8),
            facts: [
              ...(typeof d.github?.stars === "number" ? [`★ ${stars(d.github.stars)}`] : []),
              `${d.versionCount} version${d.versionCount === 1 ? "" : "s"}`,
              `${d.deps.length} dep${d.deps.length === 1 ? "" : "s"}`,
            ],
          };
        },
        add: (name) => void run(`adding ${name}`, () => juliaPackage("add", name), `julia: added ${name}`),
      }}
    />
  );
}
