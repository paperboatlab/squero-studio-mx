// The packages part of the kernel tab: the workspace project, its direct packages, the General
// registry and, for a native kernel only, juliaup's channels, in the shared package panel (@paperboat/shared/packages). This file is the
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
  /** Each opened package's newest version: picking it adds the package without a pin. */
  const latest = useRef(new Map<string, string>());

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

  // Pkg's output shows as it prints: an add can resolve and precompile for minutes.
  const run = async (label: string, job: (onLog: (text: string) => void) => Promise<JuliaStatus>, done: string) => {
    setBusy(label);
    setError("");
    setOutput("");
    try {
      const next = await job((text) => { if (alive.current) setOutput((prev) => (prev + text).slice(-8000)); });
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
  // juliaup manages the host's Julia; a container kernel brings its own, so the section is noise there.
  const native = status?.runtime.kind === "native";

  return (
    <PackagePanel
      busy={busy}
      error={error}
      output={output}
      loading={busy ? "Reading the Julia kernel, workspace and packages" : undefined}
      runtime={native ? {
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
          run: () => void run("updating julia", (log) => juliaUpdate("julia", log), "juliaup: updated"),
        },
      } : null}
      environment={
        status && {
          title: "environment",
          path: project?.path,
          tags: [project?.exists ? "Project.toml" : "no Project.toml yet (the first package adds it)", `runs in ${status.runtime.kind}`],
          packages: packages.map((p) => ({ name: p.name, version: p.version })),
          empty: "No packages in this project yet. Add one from the registry.",
          remove: canPackages ? (name) => void run(`removing ${name}`, (log) => juliaPackage("remove", name, log), `julia: removed ${name} · Restart the kernel to unload it`) : undefined,
          actions: [
            { label: "Reload", run: () => void refresh(true) },
            {
              label: "Update packages",
              disabled: !canPackages || packages.length === 0,
              run: () => void run("updating packages", (log) => juliaUpdate("packages", log), "julia: packages updated · Restart the kernel to load them"),
            },
          ],
        }
      }
      registry={{
        title: "General",
        source: shelf.source,
        items: featured,
        itemsLabel: "popular",
        pickVersion: true,
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
          latest.current.set(d.name, d.latest);
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
        // The card picks a version; the newest is a plain add, so Pkg may resolve a compatible one.
        add: (name, version) => {
          const spec = version && version !== latest.current.get(name) ? `${name}@${version}` : name;
          void run(`adding ${spec}`, (log) => juliaPackage("add", spec, log), `julia: added ${spec}`);
        },
      }}
    />
  );
}
