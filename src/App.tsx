import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Scope } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import { MenuBar } from "@paperboat/shared/components";
import type { Command } from "@paperboat/shared";
import type { Variable } from "@paperboat/shared/protocol";
import { chartAxes, chartView, surfaceEntity } from "./chart/surface.ts";
import { demoWorkspaces, sampled, sampled2, times, type WorkspaceVariable } from "./chart/samples.ts";
import { Script } from "./editor/Script.tsx";
import { FilePanel, type FilePanelHandle } from "./files/FilePanel.tsx";
import { downloadMat } from "./workspace/mat.ts";
import { evaluate, variableFrom, varsOf } from "./kernel/localEval.ts";
import { PaperboatLink, type LinkStatus } from "./paperboat/link.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";
import type { Solver } from "./sim/stateSpace.ts";

type Tab = "3d" | "2d" | "table";
type RightTab = "workspace" | "shared";
type Line = { level: "info" | "ok" | "warn"; text: string; cmd?: boolean };

function TypeIcon({ type }: { type: string }) {
  if (type.startsWith("Matrix")) {
    return (
      <span className="typeicon t-matrix" title={type} aria-label="matrix">
        <svg viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1" /><path d="M4.3 1v10M7.6 1v10M1 4.3h10M1 7.6h10" /></svg>
      </span>
    );
  }
  if (type.startsWith("Vector")) {
    return (
      <span className="typeicon t-vector" title={type} aria-label="vector">
        <svg viewBox="0 0 12 12"><path d="M1.5 9.5 10.5 2.5M8 2.5h2.5V5" /></svg>
      </span>
    );
  }
  return <span className="typeicon t-scalar" title={type} aria-label="scalar"><span className="hash">#</span></span>;
}

const solver: Solver = "rk45";

const INITIAL_FILES: Record<string, string> = {
  "surface.jl": `# surface.jl — a matrix, a selection, a chart
n = 512
X, Y = meshgrid(range(-3, 3, length=n))
R = @. hypot(X, Y) + eps()
A = @. sin(R * 3.4) / (R * 3.4)
sel = A[A .> 0.42]

surf(X, Y, A)
colormap(:viridis)
view(-37.5, 30)

# state_space(A, B, C, D) → Paperboat
`,
  "lorenz.jl": `# lorenz.jl — scaffold
# the kernel opens this file and its workspace
`,
  "plots/peaks.jl": `# peaks.jl — the demo surface
A = peaks(512)
surf(A)
`,
  "state_space.jl": `# state_space.jl — A, B, C, D → Paperboat
# A, B, C, D and x0 are handed to a state_space block.
`,
  "export.jl": `# export.jl — scaffold
savefig("surface.png")
writematrix(A, "data/run-07.csv")
`,
};

export function App() {
  const [tab, setTab] = useState<Tab>("3d");
  const [rightTab, setRightTab] = useState<RightTab>("workspace");
  const [files, setFiles] = useState<Record<string, string>>(INITIAL_FILES);
  const [folders, setFolders] = useState<string[]>(["plots"]);
  const [selectedFile, setSelectedFile] = useState("surface.jl");
  const [selectedVar, setSelectedVar] = useState("A");
  const [workspace, setWorkspace] = useState<WorkspaceVariable[]>(() => [...(demoWorkspaces["surface.jl"] ?? [])]);
  const [workspaceRoot, setWorkspaceRoot] = useState("~/lab/mx");
  const [varQuery, setVarQuery] = useState("");
  const filePanel = useRef<FilePanelHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [stageW, setStageW] = useState(540);
  const [chartHidden, setChartHidden] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [paperboat, setPaperboat] = useState<Variable[]>([]);
  const [shared, setShared] = useState<Set<string>>(() => new Set(["k"]));
  const [url, setUrl] = useState("ws://localhost:8780");
  const [lines, setLines] = useState<Line[]>([
    { level: "info", text: "julia 1.11.5 · kernel 1.11.5-r3 · frontend 0.1.0" },
    { level: "info", text: "paperboat: attach to share scalars; matrices travel to state_space" },
    { level: "ok", text: "3d: Station renderer · mesh A · 4 225 vertices" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histAt, setHistAt] = useState(-1);
  const link = useRef<PaperboatLink | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);
  const say = (text: string, level: Line["level"] = "info", cmd = false) => setLines((l) => [...l, { level, text, cmd }]);
  useEffect(() => { consoleEnd.current?.scrollIntoView({ block: "nearest" }); }, [lines]);
  useEffect(() => {
    if (!(selectedFile in files)) {
      const first = Object.keys(files).sort()[0];
      if (first) setSelectedFile(first);
    }
  }, [files, selectedFile]);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: stageW };
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const max = Math.max(320, window.innerWidth - 220 - 320 - 60);
      setStageW(Math.min(max, Math.max(300, drag.current.w - (ev.clientX - drag.current.x))));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const entities = useMemo(() => {
    const list = chartAxes();
    return Object.fromEntries([["surface", surfaceEntity(64)], ...list.map((e) => [e.id, e])]);
  }, []);
  const currentVars = workspace;
  const rows = useMemo(() => mergeShared(currentVars, paperboat, shared), [currentVars, paperboat, shared]);
  const channels = useMemo(
    () => [
      { id: "v", label: selectedVar || "y", unit: "–", buf: { times, values: sampled } },
      { id: "v2", label: `${selectedVar || "y"}′`, unit: "–", buf: { times, values: sampled2 } },
    ],
    [selectedVar],
  );

  const attach = () => {
    const l = new PaperboatLink();
    l.onStatus = (s, detail) => {
      setStatus(s);
      if (s === "attached") say(`paperboat: attached to ${url}`, "ok");
      if (s === "failed") say(`paperboat: ${detail ?? "attach failed"}`, "warn");
      if (s === "idle") say("paperboat: detached");
    };
    l.onVariables = (vars) => {
      setPaperboat(vars);
      say(`paperboat: ${vars.length} variables loaded`);
    };
    link.current = l;
    l.connect(url);
  };

  const share = (name: string, on: boolean) => {
    const next = new Set(shared);
    if (on) next.add(name); else next.delete(name);
    setShared(next);
    const sent = link.current?.send(setMessage(currentVars, paperboat, next)) ?? false;
    say(`${on ? "share" : "unshare"} ${name} → ${sent ? "variables.set" : "local only (not attached)"}`, sent ? "ok" : "warn");
  };
  const toggle = (name: string) => share(name, !shared.has(name));

  const simulate = () => {
    say(
      status === "attached"
        ? `state_space → paperboat · ${solver} · rk4/rk45/cvode from hello.run.solvers`
        : "state_space → attach a backend to run the Paperboat solver",
      status === "attached" ? "ok" : "warn",
    );
  };

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    say(cmd, "info", true);
    const [head, ...rest] = cmd.split(/\s+/);
    if (head === "clc") { setLines([]); return; }
    if (head === "clear" || head === "clearvars") {
      if (rest[0] && rest[0] !== "all") clearVar(rest[0]);
      else clearWorkspace();
      return;
    }
    if (head === "help") {
      say("commands: help · whos · clear [name] · clc · attach · detach · share <name> · unshare <name> · simulate · version");
      say("variables: type a name (A, k) to inspect it");
      say("anything else is queued for the Julia kernel once squero-kernel/0 is attached");
      return;
    }
    if (head === "whos") {
      for (const r of currentVars) say(`${r.name.padEnd(6)} ${r.shape.padEnd(10)} ${r.type}`);
      return;
    }
    if (head === "attach") { attach(); return; }
    if (head === "detach") { link.current?.close(); setStatus("idle"); say("paperboat: detached", "warn"); return; }
    if (head === "share") { if (rest[0]) share(rest[0], true); else say("usage: share k", "warn"); return; }
    if (head === "unshare") { if (rest[0]) share(rest[0], false); else say("usage: unshare k", "warn"); return; }
    if (head === "simulate" || head === "run") { simulate(); return; }
    if (head === "version") { say("julia 1.11.5 · frontend 0.1.0 · kernel 1.11.5-r3"); return; }
    const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(cmd);
    if (assign) {
      const res = evaluate(assign[2], varsOf(workspace));
      if (res.ok) {
        const next = variableFrom(assign[1], res.value);
        setWorkspace((prev) => [...prev.filter((one) => one.name !== next.name), next]);
        setSelectedVar(next.name);
        say(`${next.name} = ${res.display}`, "ok");
        return;
      }
      say(`local: ${res.error} · queued for squero-kernel/0`, "warn");
      return;
    }
    if (/^[A-Za-z_]\w*$/.test(cmd)) {
      const v = rows.find((r) => r.name === cmd);
      if (v) { say(`${v.name} = ${v.shape} ${v.type}`); return; }
    }
    const res = evaluate(cmd, varsOf(workspace));
    if (res.ok) {
      const next = variableFrom("ans", res.value);
      setWorkspace((prev) => [...prev.filter((one) => one.name !== "ans"), next]);
      say(`ans = ${res.display}`, "ok");
      return;
    }
    say(`kernel not attached · "${cmd}" queued for squero-kernel/0`, "warn");
  };

  const submit = () => {
    const cmd = input;
    if (!cmd.trim()) return;
    setHistory((h) => [...h, cmd]);
    setHistAt(-1);
    setInput("");
    run(cmd);
  };

  const recall = (delta: 1 | -1) => {
    if (history.length === 0) return;
    const next = histAt < 0 ? (delta < 0 ? history.length - 1 : -1) : Math.max(0, Math.min(history.length - 1, histAt + delta));
    if (next < 0) { setInput(""); setHistAt(-1); return; }
    setHistAt(next);
    setInput(history[next]);
  };

  const typeLabel = (type: string) => (type.startsWith("Matrix") ? "matrix" : type.startsWith("Vector") ? "vector" : "float64");

  const chartOf = (type: string): Tab => (type === "Float64" ? "table" : type.startsWith("Matrix") ? "3d" : "2d");

  const openChart = (v: { name: string; type: string }) => {
    setSelectedVar(v.name);
    setTab(chartOf(v.type));
    setChartHidden(false);
    say(`chart: ${v.name} → ${chartOf(v.type)}`, "ok");
  };

  const clearWorkspace = () => {
    setWorkspace([]);
    setSelectedVar("");
    say("workspace cleared", "warn");
  };

  const clearVar = (name: string) => {
    setWorkspace((prev) => prev.filter((v) => v.name !== name));
    say(`clear ${name}`, "warn");
  };

  const runScript = () => {
    const vars = demoWorkspaces[selectedFile] ?? [];
    setWorkspace((prev) => {
      const by = new Map(prev.map((v) => [v.name, v]));
      for (const v of vars) by.set(v.name, v);
      return [...by.values()];
    });
    if (vars[0]) setSelectedVar(vars[0].name);
    say(`run ${selectedFile} · +${vars.length} variables · ${workspace.length + vars.length} total`, "ok");
  };

  const changeRoot = () => {
    const next = window.prompt("Workspace folder", workspaceRoot);
    if (next?.trim()) {
      setWorkspaceRoot(next.trim());
      say(`workspace folder → ${next.trim()}`, "ok");
    }
  };

  const exportWorkspace = () => {
    const name = selectedFile.replace(/\.jl$/, "") || "workspace";
    const ok = downloadMat(workspace, `${name}.mat`);
    say(ok ? `exported ${name}.mat · ${workspace.length} variables` : "workspace is empty", ok ? "ok" : "warn");
  };

  useEffect(() => {
    if (!currentVars.some((v) => v.name === selectedVar)) setSelectedVar(currentVars[0]?.name ?? "");
  }, [currentVars, selectedVar]);

  const picked = rows.find((r) => r.name === selectedVar) ?? rows[0];
  const shownVars = rows.filter((r) => r.source === "mx" && `${r.name} ${r.shape} ${r.type}`.toLowerCase().includes(varQuery.toLowerCase()));
  const active = rows.filter((r) => r.shared).length;

  const commands: Command[] = [
    { id: "new-script", label: "New script…", menu: "file", group: "new", run: () => filePanel.current?.newFile() },
    { id: "new-folder", label: "New folder…", menu: "file", group: "new", run: () => filePanel.current?.newFolder() },
    { id: "root", label: "Change workspace folder…", menu: "file", group: "workspace", run: changeRoot },
    { id: "export", label: "Export workspace (.mat)…", menu: "file", group: "workspace", run: exportWorkspace, enabled: workspace.length > 0, why: "the workspace is empty" },
    { id: "attach", label: "Attach Paperboat…", menu: "file", group: "connect", run: () => setRightTab("shared") },
    { id: "find", label: "Find variables…", menu: "edit", group: "find", run: () => { setRightTab("workspace"); requestAnimationFrame(() => searchRef.current?.focus()); } },
    { id: "clear-workspace", label: "Clear workspace", menu: "edit", group: "console", run: clearWorkspace },
    { id: "clear-console", label: "Clear console", menu: "edit", group: "console", run: () => setLines([]) },
    { id: "chart", label: "Chart", menu: "view", group: "panels", checked: !chartHidden, run: () => setChartHidden((v) => !v) },
    { id: "workspace-tab", label: "Workspace panel", menu: "view", group: "panels", checked: rightTab === "workspace", run: () => setRightTab("workspace") },
    { id: "shared-tab", label: "Shared variables", menu: "view", group: "panels", checked: rightTab === "shared", run: () => setRightTab("shared") },
    { id: "run", label: "Run script", menu: "run", group: "run", run: runScript },
    { id: "simulate", label: "Simulate on Paperboat", menu: "run", group: "run", run: simulate },
  ];

  return (
    <div className={`app split${chartHidden ? " chart-hidden" : ""}`} style={{ "--stage-w": `${stageW}px` } as CSSProperties}>
      <header className="topbar">
        <div className="brand">squero <span className="studio">studio</span><span className="wave"><i /><i /><i /><i /><i /></span><span className="badge">MX</span></div>
        <div className="proj"><span className="dot" />{selectedFile}</div>
        <div className={`status ${status}`}><span className="pip" />{status === "attached" ? "paperboat · attached" : "julia · ready"}</div>
        <MenuBar commands={commands} />
        <div className="keys">
          <button className="key run" onClick={simulate}>▶ Simulate</button>
          <button className="key small" onClick={() => setChartHidden((v) => !v)}>{chartHidden ? "show chart" : "hide chart"}</button>
          <button className="key">Console <span className="tag">{lines.length}</span></button>
          <button className="key small">☾</button>
        </div>
      </header>

      <FilePanel
        ref={filePanel}
        root={workspaceRoot}
        files={files}
        folders={folders}
        active={selectedFile}
        onOpen={setSelectedFile}
        onChange={({ files: nextFiles, folders: nextFolders }) => { setFiles(nextFiles); setFolders(nextFolders); }}
        onEditRoot={changeRoot}
        onSay={say}
      />

      <Script
        file={selectedFile}
        code={files[selectedFile] ?? ""}
        onChange={(code) => setFiles((prev) => ({ ...prev, [selectedFile]: code }))}
        onRun={runScript}
      />

      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the chart"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => setStageW(540)}
      />

      <main className="stage">
        <div className="tabs">
          {(["3d", "2d", "table"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "3d" ? "3d" : t === "2d" ? "2d graph" : "table"}</button>
          ))}
          <span className="sp" />
          <span className="tag">{picked ? `${picked.name} · ${picked.shape} · ${picked.type}` : "no variables"}</span>
          <button className="key small" onClick={() => setChartHidden(true)} title="Hide chart">×</button>
        </div>

        <div className="stage-body">
          {tab === "3d" && (
            <>
              <div className="scene-wrap"><SceneView entities={entities} view={chartView} grid axes /></div>
              <div className="overlay">
                <div className="chip"><span className="sig" />A · surface</div>
                <div className="chip">Station renderer · same SceneView</div>
              </div>
            </>
          )}
          {tab === "2d" && (
            <div className="scope-wrap">
              <Scope name="y(t)" channels={channels} version={1} live={false} settings={{ window: 5, grid: true }} />
            </div>
          )}
          {tab === "table" && (
            <div className="table-wrap">
              <div className="stats">
                <div><b>−0.184</b><span>min</span></div>
                <div><b>1.000</b><span>max</span></div>
                <div><b>0.227</b><span>mean</span></div>
                <div><b>0.201</b><span>std</span></div>
              </div>
              <div className="matrix">
                {Array.from({ length: 48 }, (_, i) => (
                  <span key={i} style={{ opacity: 0.35 + ((Math.sin(i * 1.7) + 1) / 2) * 0.65 }}>{(Math.sin(i * 0.7) * 0.4 + 0.4).toFixed(3)}</span>
                ))}
              </div>
              <p className="hint">The matrix lens (heatmap, profiles, histogram, cell edit) is pb#312 work; this scaffold proves the shared renderer and entries.</p>
            </div>
          )}
        </div>
      </main>

      <aside className="panel rightpane">
        <div className="head">
          <div className="rtabs">
            <button className={rightTab === "workspace" ? "on" : ""} onClick={() => setRightTab("workspace")}>workspace</button>
            <button className={rightTab === "shared" ? "on" : ""} onClick={() => setRightTab("shared")}>shared</button>
          </div>
          <span className="sp" />
          <span className="tag">{active} shared</span>
        </div>

        {rightTab === "workspace" ? (
          <div className="tabbody">
            <div className="varsearch">
              <span aria-hidden>⌕</span>
              <input ref={searchRef} value={varQuery} onChange={(e) => setVarQuery(e.target.value)} placeholder="filter variables" aria-label="Filter variables" />
              <span className="tag">{currentVars.length}</span>
            </div>
            <div className="vars">
              {shownVars.map((v) => (
                <div
                  className={`varc ${selectedVar === v.name ? "on" : ""}`}
                  key={v.name}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedVar === v.name}
                  onClick={() => setSelectedVar(v.name)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedVar(v.name); } }}
                >
                  <TypeIcon type={v.type} />
                  <div className="vmeta">
                    <div className="nm">{v.name}</div>
                    <div className="sh">{typeLabel(v.type)} · {v.shape}</div>
                  </div>
                  <span
                    className="chartpill"
                    role="button"
                    tabIndex={0}
                    title={`Open ${chartOf(v.type)}`}
                    onClick={(e) => { e.stopPropagation(); openChart(v); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openChart(v); } }}
                  >{chartOf(v.type)}</span>
                  <button
                    className={`tie ${v.shared ? "on" : ""}`}
                    disabled={!v.shareable}
                    title={v.shareable ? "Share with Paperboat" : "Matrices travel to a block, not a variable"}
                    onClick={(e) => { e.stopPropagation(); toggle(v.name); }}
                  />
                </div>
              ))}
              {currentVars.length === 0 && (
                <div className="ws-empty">
                  <p>No variables yet.</p>
                  <button className="key small" onClick={runScript}>▶ Run {selectedFile}</button>
                </div>
              )}
            </div>
            <div className="scratch">
              <div className="lbl">scratch</div>
              <div className="box"><span className="prompt">julia&gt;</span><span>A[128, 64] / maximum(A)</span><span className="caret" /></div>
              <div className="preview"><span className="val">0.871</span><span className="tag">Float64</span><span className="k">↵ show</span></div>
            </div>
          </div>
        ) : (
          <div className="tabbody">
            <div className="lbl">paperboat</div>
            <div className="attach">
              <input value={url} onChange={(e) => setUrl(e.target.value)} />
              <button className="key small" onClick={attach}>{status === "attached" ? "Reattach" : "Attach"}</button>
            </div>
            <div className={`linkrow ${status}`}><span className="pip" />{status === "attached" ? "variables.load received" : status === "connecting" ? "connecting…" : "not attached"}</div>

            <div className="rule" />
            <div className="lbl">workspace → project</div>
            <div className="shared-list">
              {rows.map((v) => (
                <div className="shared-row" key={v.name} role="button" tabIndex={0} onClick={() => setSelectedVar(v.name)}>
                  <span className="nm">{v.name}</span>
                  <span className="shape">{v.shape}</span>
                  <span className={`src ${v.source}`}>{v.source === "mx" ? "MX" : "PB"}</span>
                  <span className={`state ${v.shared ? "on" : ""}`}>{v.shared ? "shared" : v.source === "paperboat" ? "project" : v.shareable ? "off" : "block"}</span>
                </div>
              ))}
            </div>
            <p className="hint">Scalars share by name (<span className="mono">k</span> → Paperboat <span className="mono">k</span>). Matrices and vectors are not project variables: they go to <span className="mono">state_space</span>/matrix blocks. If MX is not running, Paperboat runs unchanged.</p>

            <div className="rule" />
            <div className="lbl">simulation</div>
            <div className="simrow"><span className="mono">solver</span><b>{solver}</b><span className="tag">hello.run.solvers</span></div>
            <div className="simrow"><span className="mono">state_space</span><b>A B C D · x0</b><span className="tag">Paperboat</span></div>
            <button className="key" onClick={simulate}>Simulate on Paperboat</button>
            <p className="hint">The kernel never integrates. Paperboat's <span className="mono">solve::Solver</span> advances the state; MX replays the run.</p>
          </div>
        )}
      </aside>

      <section className="console">
        <div className="chead"><span className="on">console</span><span>messages</span><span className="sp" /><span className="tag">julia 1.11.5 · frontend 0.1.0</span></div>
        <div className="lines">
          {lines.map((l, i) => (
            <div key={i} className={l.level}>{l.cmd ? <span className="prompt">julia&gt; </span> : null}{l.text}</div>
          ))}
          <div ref={consoleEnd} />
        </div>
        <form className="cin" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <span className="prompt">julia&gt;</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
            }}
            placeholder="type help"
            autoComplete="off"
            spellCheck={false}
            aria-label="console command"
          />
        </form>
      </section>
    </div>
  );
}
