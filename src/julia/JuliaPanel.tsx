// The julia up panel: juliaup channels, the workspace project, its direct packages, and a
// General-registry browser. Launcher work is slow (Pkg can resolve for a while), so one
// operation runs at a time and the command's tail is shown under the list.
import { useEffect, useRef, useState } from "react";
import {
  juliaPackage, juliaUpdate, loadJulia, loadRegistryPackage, searchRegistry,
  type JuliaStatus, type RegistryEntry, type RegistryPackage,
} from "./client.ts";

type Level = "info" | "ok" | "warn";
type View = "environment" | "registry";

const stars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const repoLabel = (repo: string) => repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");

export function JuliaPanel({ onSay }: { onSay?: (text: string, level: Level) => void }) {
  const [status, setStatus] = useState<JuliaStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [output, setOutput] = useState("");
  const [view, setView] = useState<View>("environment");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistryEntry[]>([]);
  const [registryBusy, setRegistryBusy] = useState("");
  const [registryError, setRegistryError] = useState("");
  const [registrySource, setRegistrySource] = useState("");
  const [registryTotal, setRegistryTotal] = useState(0);
  const [detail, setDetail] = useState<RegistryPackage | null>(null);
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
      if (alive.current) setError(String((failure as Error).message ?? failure));
    } finally {
      if (alive.current) setBusy("");
    }
  };

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; };
    // The panel reads the launcher once per mount; the reload key refreshes it.
  }, []);

  useEffect(() => {
    if (view !== "registry") return;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setRegistryTotal(0);
      setRegistryError("");
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      setRegistryBusy("searching the registry");
      setRegistryError("");
      void searchRegistry(text)
        .then((found) => {
          if (!live) return;
          if (!found.ok) throw new Error(found.error ?? "registry search failed");
          setResults(found.results ?? []);
          setRegistryTotal(found.total ?? 0);
          setRegistrySource(found.source ?? "");
        })
        .catch((failure) => { if (live) setRegistryError(String((failure as Error).message ?? failure)); })
        .finally(() => { if (live) setRegistryBusy(""); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, view]);

  const run = async (label: string, job: () => Promise<JuliaStatus>, done: string) => {
    setBusy(label);
    setError("");
    try {
      const next = await job();
      if (!alive.current) return;
      setStatus(next);
      setOutput(next.output ?? "");
      if (next.ok) {
        onSay?.(done, "ok");
      } else {
        const message = next.error || `${label} failed`;
        setError(message);
        onSay?.(message, "warn");
      }
    } catch (failure) {
      const message = String((failure as Error).message ?? failure);
      if (alive.current) setError(message);
      onSay?.(message, "warn");
    } finally {
      if (alive.current) setBusy("");
    }
  };

  const add = (name: string) => {
    const value = name.trim();
    if (!value || busy) return;
    if (name === draft) setDraft("");
    void run(`adding ${value}`, () => juliaPackage("add", value), `julia: added ${value}`);
  };

  const openDetail = (name: string) => {
    setDetail(null);
    setRegistryBusy(`reading ${name}`);
    setRegistryError("");
    void loadRegistryPackage(name)
      .then((found) => {
        if (!found.ok) throw new Error(found.error ?? `not in the registry: ${name}`);
        if (alive.current) setDetail(found);
      })
      .catch((failure) => { if (alive.current) setRegistryError(String((failure as Error).message ?? failure)); })
      .finally(() => { if (alive.current) setRegistryBusy(""); });
  };

  const project = status?.project;
  const packages = status?.packages ?? [];
  const channels = status?.juliaup.channels ?? [];
  const installed = new Set(packages.map((one) => one.name));
  const canPackages = Boolean(status?.julia.present);
  const canJuliaup = Boolean(status?.juliaup.present);

  return (
    <div className="juliatab">
      <div className="jl-head">
        <div className="jl-title">
          <b>julia up</b>
          <span className="tag">{status?.juliaup.present ? `juliaup ${status.juliaup.version ?? ""}`.trim() : "juliaup not found"}</span>
        </div>
        <button
          className="key small"
          onClick={() => void run("updating julia", () => juliaUpdate("julia"), "juliaup: updated")}
          disabled={!canJuliaup || Boolean(busy)}
          title="Update the juliaup channels on this machine"
        >
          Update
        </button>
      </div>

      {channels.length > 0 ? (
        <div className="jl-chans">
          {channels.map((channel) => (
            <div className={`jl-ch${channel.default ? " on" : ""}`} key={channel.channel}>
              <span className="nm">{channel.default ? `[ ${channel.channel} ]` : channel.channel}</span>
              <span className="ver">{channel.version}</span>
              <span className={`upd${channel.update ? " has" : ""}`}>{channel.update ? `→ ${channel.update}` : "current"}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">
          {status?.juliaup.present
            ? "juliaup has no channels installed."
            : "Install juliaup to update Julia versions from here; the workspace environment still works."}
        </p>
      )}

      <div className="rule" />
      <div className="jl-subtabs" role="tablist" aria-label="Kernel view">
        <button type="button" role="tab" aria-selected={view === "environment"} className={view === "environment" ? "on" : ""} onClick={() => setView("environment")}>environment</button>
        <button type="button" role="tab" aria-selected={view === "registry"} className={view === "registry" ? "on" : ""} onClick={() => setView("registry")}>registry</button>
      </div>

      {view === "environment" ? (
        <>
          <div className="jl-head">
            <div className="jl-title">
              <b>environment</b>
              <span className="tag">{status?.julia.present ? `julia ${status.julia.version}` : "no julia"}</span>
            </div>
            <button className="key small" onClick={() => void refresh(true)} disabled={Boolean(busy)}>Reload</button>
          </div>
          <div className="jl-path" title={project?.path}>{project?.path ?? "Reading the workspace…"}</div>
          <div className="jl-tags">
            <span className="tag">{project?.exists ? "Project.toml" : "no Project.toml yet"}</span>
            <span className="tag">{status ? `${status.runtime.kind} · ${status.runtime.image}` : "kernel runtime"}</span>
          </div>

          <form className="jl-add" onSubmit={(event) => { event.preventDefault(); add(draft); }}>
            <span className="prompt" aria-hidden>pkg</span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="add package"
              aria-label="Package to add"
              spellCheck={false}
              disabled={Boolean(busy) || !canPackages}
            />
            <button className="key small" type="submit" disabled={Boolean(busy) || !canPackages || !draft.trim()}>Add</button>
          </form>

          <div className="jl-list">
            {packages.map((one) => (
              <div className="jl-pkg" key={one.uuid || one.name}>
                <span className="nm">{one.name}</span>
                <span className="ver">{one.version || "—"}</span>
                <button
                  className="jl-rm"
                  type="button"
                  title={`Remove ${one.name}`}
                  aria-label={`Remove ${one.name}`}
                  disabled={Boolean(busy) || !canPackages}
                  onClick={() => void run(`removing ${one.name}`, () => juliaPackage("remove", one.name), `julia: removed ${one.name}`)}
                >
                  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4 4l6 6M10 4l-6 6" /></svg>
                </button>
              </div>
            ))}
            {packages.length === 0 && (
              <p className="hint">
                {status ? "No packages in this project yet. Add one above or browse the registry." : "Reading the environment…"}
              </p>
            )}
          </div>

          <div className="jl-foot">
            <button
              className="key small"
              onClick={() => void run("updating packages", () => juliaUpdate("packages"), "julia: packages updated")}
              disabled={Boolean(busy) || !canPackages || packages.length === 0}
            >
              Update packages
            </button>
            <span className="tag">{packages.length} direct</span>
          </div>
        </>
      ) : (
        <>
          <form className="jl-add" onSubmit={(event) => event.preventDefault()}>
            <span className="prompt" aria-hidden>find</span>
            <input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setDetail(null); }}
              placeholder="search General"
              aria-label="Search the General registry"
              spellCheck={false}
            />
          </form>
          <div className="jl-tags">
            <span className="tag">General{registrySource ? ` · ${registrySource}` : ""}</span>
            <span className="tag">{query.trim().length >= 2 ? `${registryTotal} match${registryTotal === 1 ? "" : "es"}` : "type two letters"}</span>
          </div>

          {detail ? (
            <div className="jr-card">
              <div className="jr-card-head">
                <b>{detail.name}</b>
                <span className="tag">{detail.latest || "—"}</span>
                <button className="jl-rm" type="button" title="Close package" aria-label="Close package" onClick={() => setDetail(null)}>
                  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4 4l6 6M10 4l-6 6" /></svg>
                </button>
              </div>
              <p className="jr-desc">{detail.github?.description || "No description from GitHub yet."}</p>
              <div className="jr-facts">
                {typeof detail.github?.stars === "number" && <span>★ {stars(detail.github.stars)}</span>}
                <span>{detail.versionCount} version{detail.versionCount === 1 ? "" : "s"}</span>
                <span>{detail.deps.length} dep{detail.deps.length === 1 ? "" : "s"}</span>
              </div>
              {detail.versions.length > 0 && (
                <div className="jr-versions">
                  {detail.versions.map((version) => <span className="tag" key={version}>{version}</span>)}
                </div>
              )}
              {detail.repo && <a className="jr-repo" href={detail.repo} target="_blank" rel="noreferrer">{repoLabel(detail.repo)}</a>}
              <div className="jr-actions">
                {installed.has(detail.name) ? (
                  <span className="tag jr-installed">installed</span>
                ) : (
                  <button className="key small" type="button" onClick={() => add(detail.name)} disabled={Boolean(busy)}>Add {detail.name}</button>
                )}
                <span className="sp" />
                <span className="tag">{detail.uuid.slice(0, 8)}</span>
              </div>
            </div>
          ) : (
            <div className="jr-results">
              {results.map((one) => (
                <div className="jr-row" key={one.uuid}>
                  <button className="jr-name" type="button" onClick={() => openDetail(one.name)}>
                    <span className="nm">{one.name}</span>
                    <span className="uuid">{one.path}</span>
                  </button>
                  {installed.has(one.name)
                    ? <span className="tag jr-installed">added</span>
                    : <button className="key small" type="button" onClick={() => add(one.name)} disabled={Boolean(busy)}>Add</button>}
                </div>
              ))}
              {!registryBusy && query.trim().length >= 2 && results.length === 0 && !registryError && (
                <p className="hint">No package matches “{query.trim()}”.</p>
              )}
              {query.trim().length < 2 && (
                <p className="hint">Search the General registry by name. Open a result for its description, stars, versions and dependencies.</p>
              )}
            </div>
          )}
          {registryBusy && <div className="jl-busy">{registryBusy}…</div>}
          {registryError && <div className="jl-error">{registryError}</div>}
        </>
      )}

      {busy && <div className="jl-busy">{busy}…</div>}
      {error && <div className="jl-error">{error}</div>}
      {output && <pre className="jl-log" aria-label="Last julia command output">{output.slice(-2400)}</pre>}
    </div>
  );
}
