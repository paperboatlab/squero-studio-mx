import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Scope } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import { MenuBar } from "@paperboat/shared/components";
import type { Command } from "@paperboat/shared";
import type { Variable } from "@paperboat/shared/protocol";
import { chartAxes, chartView, surfaceEntity } from "./chart/surface.ts";
import { FigureView } from "./plot/FigureView.tsx";
import { parseFigure, type Figure } from "./plot/figure.ts";
import { demoWorkspaces, sampled, sampled2, times, type WorkspaceVariable } from "./chart/samples.ts";
import { Script } from "./editor/Script.tsx";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "./editor/CodeEditor.tsx";
import { FilePanel, type FilePanelHandle } from "./files/FilePanel.tsx";
import { readTree, storageOf, writeFile } from "./files/storage.ts";
import { downloadMat } from "./workspace/mat.ts";
import { evaluate, variableFrom, varsOf } from "./kernel/localEval.ts";
import { PaperboatLink, type LinkStatus } from "./paperboat/link.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";

type Tab = "3d" | "2d" | "figure" | "table";
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
  "examples/subplots.jl": `# subplots.jl — a 2 × 2 page
x = 0:0.1:10
subplot(2, 2, 1)
plot(x, sin.(x))
subplot(2, 2, 2)
plot(x, cos.(x))
subplot(2, 2, 3)
surf(peaks(64))
subplot(2, 2, 4)
imagesc(peaks(64))
`,
  "examples/lines.jl": `# lines.jl — two panels
x = 0:0.1:10
subplot(1, 2, 1); plot(x, sin.(x))
subplot(1, 2, 2); plot(x, cos.(x))
`,
  "examples/surfaces.jl": `# surfaces.jl — surface and heat
subplot(1, 2, 1); surf(peaks(64))
subplot(1, 2, 2); imagesc(peaks(64))
`,
};

export function App() {
  const [tab, setTab] = useState<Tab>("3d");
  const [figure, setFigure] = useState<Figure | null>(null);
  const [figureFocus, setFigureFocus] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("workspace");
  const [files, setFiles] = useState<Record<string, string>>(INITIAL_FILES);
  const [folders, setFolders] = useState<string[]>(["plots", "examples"]);
  const [selectedFile, setSelectedFile] = useState("surface.jl");
  const [selectedVar, setSelectedVar] = useState("A");
  const [workspace, setWorkspace] = useState<WorkspaceVariable[]>(() => [...(demoWorkspaces["surface.jl"] ?? [])]);
  const [workspaceRoot, setWorkspaceRoot] = useState("mx-workspace");
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [varQuery, setVarQuery] = useState("");
  const filePanel = useRef<FilePanelHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [stageW, setStageW] = useState(540);
  const [consoleH, setConsoleH] = useState(154);
  const [chartHidden, setChartHidden] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [paperboat, setPaperboat] = useState<Variable[]>([]);
  const [pbLoaded, setPbLoaded] = useState(false);
  const [url, setUrl] = useState("ws://localhost:8780");
  const [editor, setEditor] = useState<EditorSettings>(() => {
    try { return { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(localStorage.getItem("mx.editor") ?? "{}") }; }
    catch { return DEFAULT_EDITOR_SETTINGS; }
  });
  const [appTheme, setAppTheme] = useState<"light" | "dark">(() => (localStorage.getItem("mx.theme") === "dark" ? "dark" : "light"));
  const lastSent = useRef("");
  const attachedOnce = useRef(false);
  const [lines, setLines] = useState<Line[]>([
    { level: "info", text: "julia 1.11.5 · kernel 1.11.5-r3 · frontend 0.1.0" },
    { level: "info", text: "paperboat: scalars broadcast automatically when a backend is up" },
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

  const storage = useMemo(() => (dir ? storageOf(dir) : undefined), [dir]);

  const entities = useMemo(() => {
    const list = chartAxes();
    return Object.fromEntries([["surface", surfaceEntity(64)], ...list.map((e) => [e.id, e])]);
  }, []);
  const currentVars = workspace;
  const rows = useMemo(() => mergeShared(currentVars, paperboat), [currentVars, paperboat]);
  const channels = useMemo(
    () => [
      { id: "v", label: selectedVar || "y", unit: "–", buf: { times, values: sampled } },
      { id: "v2", label: `${selectedVar || "y"}′`, unit: "–", buf: { times, values: sampled2 } },
    ],
    [selectedVar],
  );

  useEffect(() => { localStorage.setItem("mx.editor", JSON.stringify(editor)); }, [editor]);
  useEffect(() => {
    document.documentElement.dataset.theme = appTheme;
    localStorage.setItem("mx.theme", appTheme);
  }, [appTheme]);

  useEffect(() => {
    const l = new PaperboatLink();
    link.current = l;
    l.onStatus = (s, detail) => {
      setStatus(s);
      if (s === "attached") {
        lastSent.current = "";
        attachedOnce.current = true;
        say(`paperboat: broadcasting to ${url}`, "ok");
      } else if (s === "failed") {
        setPbLoaded(false);
        if (attachedOnce.current) say(`paperboat: ${detail ?? "lost"}`, "warn");
      } else if (s === "idle") setPbLoaded(false);
    };
    l.onVariables = (vars) => {
      setPaperboat(vars);
      setPbLoaded(true);
      if (vars.length) say(`paperboat: ${vars.length} variables loaded`);
    };
    l.connect(url);
    return () => l.close();
  }, [url]);

  const attach = () => {
    if (!link.current) return;
    link.current.close();
    link.current.connect(url);
    say(`paperboat: looking for ${url}…`);
  };

  // A single MX instance broadcasts to one backend; retry quietly until it appears.
  useEffect(() => {
    if (status === "attached") return;
    const timer = setInterval(() => {
      if (link.current && link.current.status !== "connecting") link.current.connect(url);
    }, 5000);
    return () => clearInterval(timer);
  }, [status, url]);

  // Every scalar is broadcast automatically, once the backend's list has loaded.
  useEffect(() => {
    if (status !== "attached" || !pbLoaded) return;
    const msg = setMessage(currentVars, paperboat);
    const payload = JSON.stringify(msg.variables);
    if (payload === lastSent.current) return;
    const timer = setTimeout(() => {
      if (link.current?.send(msg)) {
        lastSent.current = payload;
        const n = msg.variables.length;
        say(`broadcast ${n} variable${n === 1 ? "" : "s"} → paperboat`, "ok");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [currentVars, paperboat, status, pbLoaded]);

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    say(cmd, "info", true);
    const call = /^([A-Za-z_]\w*)\s*\(\s*([^)]*)\s*\)$/.exec(cmd);
    if (call) {
      const arg = call[2].replace(/^["']|["']$/g, "").trim();
      if (call[1] === "clear" || call[1] === "clearvars") {
        if (arg && arg !== "all") clearVar(arg);
        else clearWorkspace();
        return;
      }
      if (call[1] === "clc") { setLines([]); return; }
    }
    const [head, ...rest] = cmd.split(/\s+/);
    if (head === "clc") { setLines([]); return; }
    if (head === "clear" || head === "clearvars") {
      if (rest[0] && rest[0] !== "all") clearVar(rest[0]);
      else clearWorkspace();
      return;
    }
    if (head === "help") {
      say("commands: help · whos · clear [name] · clc · attach · detach · run · version");
      say("clear() and clc() work too.");
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
    if (head === "run") { runScript(); return; }
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
    const fig = parseFigure(files[selectedFile] ?? "");
    setFigure(fig);
    setFigureFocus(null);
    if (fig) setTab("figure");
    setWorkspace((prev) => {
      const by = new Map(prev.map((v) => [v.name, v]));
      for (const v of vars) by.set(v.name, v);
      return [...by.values()];
    });
    if (vars[0]) setSelectedVar(vars[0].name);
    say(`run ${selectedFile} · +${vars.length} variables · ${workspace.length + vars.length} total`, "ok");
  };

  const openFolder = async () => {
    const picker = window.showDirectoryPicker;
    if (!picker) {
      say("this browser has no folder picker; the workspace stays in memory", "warn");
      return;
    }
    try {
      const handle = await picker({ mode: "readwrite" });
      const tree = await readTree(handle);
      setDir(handle);
      setWorkspaceRoot(handle.name);
      setFiles(tree.files);
      setFolders(tree.folders);
      setSelectedFile(Object.keys(tree.files).sort()[0] ?? "");
      setDirty(new Set());
      say(`opened ${handle.name} · ${Object.keys(tree.files).length} files`, "ok");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") say(`folder: ${error instanceof Error ? error.message : String(error)}`, "warn");
    }
  };

  const saveCurrent = async () => {
    if (!selectedFile) return;
    if (!dir) {
      say("the workspace is in memory; File ▸ Open workspace folder… to save", "warn");
      return;
    }
    try {
      await writeFile(dir, selectedFile, files[selectedFile] ?? "");
      setDirty((prev) => { const next = new Set(prev); next.delete(selectedFile); return next; });
      say(`saved ${selectedFile}`, "ok");
    } catch (error) {
      say(`save: ${error instanceof Error ? error.message : String(error)}`, "warn");
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

  const startConsoleResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = consoleH;
    const move = (ev: PointerEvent) => setConsoleH(Math.min(Math.max(80, startH - (ev.clientY - startY)), window.innerHeight - 300));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "row-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveCurrent(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dir, selectedFile, files]);

  const commands: Command[] = [
    { id: "new-script", label: "New script…", menu: "file", group: "new", run: () => filePanel.current?.newFile() },
    { id: "new-folder", label: "New folder…", menu: "file", group: "new", run: () => filePanel.current?.newFolder() },
    { id: "open-folder", label: "Open workspace folder…", menu: "file", group: "workspace", run: () => void openFolder() },
    { id: "save", label: "Save", menu: "file", group: "workspace", shortcut: "Ctrl+S", run: () => void saveCurrent(), enabled: dirty.has(selectedFile) && dir !== null, why: dir ? "no unsaved changes" : "open a folder first" },
    { id: "export", label: "Export workspace (.mat)…", menu: "file", group: "workspace", run: exportWorkspace, enabled: workspace.length > 0, why: "the workspace is empty" },
    { id: "attach", label: "Attach Paperboat…", menu: "file", group: "connect", run: () => setRightTab("shared") },
    { id: "find", label: "Find variables…", menu: "edit", group: "find", run: () => { setRightTab("workspace"); requestAnimationFrame(() => searchRef.current?.focus()); } },
    { id: "clear-workspace", label: "Clear workspace", menu: "edit", group: "console", run: clearWorkspace },
    { id: "clear-console", label: "Clear console", menu: "edit", group: "console", run: () => setLines([]) },
    { id: "chart", label: "Chart", menu: "view", group: "panels", checked: !chartHidden, run: () => setChartHidden((v) => !v) },
    { id: "workspace-tab", label: "Workspace panel", menu: "view", group: "panels", checked: rightTab === "workspace", run: () => setRightTab("workspace") },
    { id: "shared-tab", label: "Shared variables", menu: "view", group: "panels", checked: rightTab === "shared", run: () => setRightTab("shared") },
    { id: "run", label: "Run script", menu: "run", group: "run", run: runScript },
  ];

  return (
    <div className={`app split${chartHidden ? " chart-hidden" : ""}`} style={{ "--stage-w": `${stageW}px`, "--console-h": `${consoleH}px` } as CSSProperties}>
      <header className="topbar">
        <div className="brand">squero <span className="studio">studio</span><span className="wave"><i /><i /><i /><i /><i /></span><span className="badge">MX</span></div>
        <MenuBar commands={commands} />
        <div className="proj"><span className="dot" />{selectedFile}</div>
        <div className={`status ${status}`}><span className="pip" />{status === "attached" ? "paperboat · attached" : "julia · ready"}</div>
        <div className="keys">
          <button className="key small chartkey" onClick={() => setChartHidden((v) => !v)}>{chartHidden ? "show chart" : "hide chart"}</button>
          <button className="key">Console <span className="tag">{lines.length}</span></button>
          <button className="key small" onClick={() => setAppTheme((t) => (t === "dark" ? "light" : "dark"))} title="Toggle theme">{appTheme === "dark" ? "☀" : "☾"}</button>
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
        onEditRoot={() => void openFolder()}
        rootBadge={dir ? "folder" : "in-memory"}
        storage={storage}
        onSay={say}
      />

      <Script
        file={selectedFile}
        code={files[selectedFile] ?? ""}
        onChange={(code) => {
          setFiles((prev) => ({ ...prev, [selectedFile]: code }));
          setDirty((prev) => new Set(prev).add(selectedFile));
        }}
        onRun={runScript}
        dirty={dirty.has(selectedFile)}
        onSave={() => void saveCurrent()}
        settings={editor}
        onSettings={setEditor}
        variables={workspace.map((v) => ({ name: v.name, type: v.type }))}
        onChart={(kind, line) => { setFigureFocus(line); setTab(figure ? "figure" : kind); setChartHidden(false); say(`chart → ${figure ? line : kind}`, "ok"); }}
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
          {(["3d", "2d", ...(figure ? (["figure"] as const) : []), "table"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "3d" ? "3d" : t === "2d" ? "2d graph" : t === "figure" ? "figure" : "table"}</button>
          ))}
          <span className="sp" />
          <span className="tag">{tab === "3d" ? "surface · A" : tab === "2d" ? `${selectedVar || "y"}(t)` : tab === "figure" ? `figure · ${figure?.rows ?? 1}×${figure?.cols ?? 1}` : `table · ${picked?.name ?? "A"}`}</span>
          <button className="key small stage-hide" onClick={() => setChartHidden(true)} title="Hide chart">×</button>
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
          {tab === "figure" && figure && <FigureView figure={figure} focus={figureFocus} />}
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
                  <span className={`tie ${v.shared ? "on" : ""}`} title={v.shared ? "Broadcast to Paperboat" : "Matrices travel to a block, not a variable"} />
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
                  <span className={`state ${v.shared ? "on" : ""}`}>{v.source === "paperboat" ? "project" : v.shared ? "broadcast" : "block"}</span>
                </div>
              ))}
            </div>
            <p className="hint">Every scalar is broadcast by name automatically once the backend is up (<span className="mono">k</span> → Paperboat <span className="mono">k</span>). Matrices and vectors are not project variables: they go to <span className="mono">state_space</span>/matrix blocks. A single MX instance is enough.</p>

            <div className="rule" />
            <div className="lbl">runs</div>
            <p className="hint">Runs happen in Paperboat. MX shares the scalars Paperboat needs and reads the signals it produces.</p>
          </div>
        )}
      </aside>

      <div className="console-splitter" role="separator" aria-orientation="horizontal" aria-label="Resize the console" onPointerDown={startConsoleResize} onDoubleClick={() => setConsoleH(154)} />

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
