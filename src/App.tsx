import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { MenuBar } from "@paperboat/shared/components";
import type { Command } from "@paperboat/shared";
import type { Variable } from "@paperboat/shared/protocol";
import { FigureView } from "./plot/FigureView.tsx";
import { parseFigure, type Figure } from "./plot/figure.ts";
import { demoWorkspaces, type WorkspaceVariable } from "./chart/samples.ts";
import { Script } from "./editor/Script.tsx";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "./editor/CodeEditor.tsx";
import { SqueroLogo } from "./shell/SqueroLogo.tsx";
import { FilePanel, type FilePanelHandle } from "./files/FilePanel.tsx";
import { askWrite, canWrite, loadDirHandle, readTree, saveDirHandle, storageOf, writeFile } from "./files/storage.ts";
import { downloadMat } from "./workspace/mat.ts";
import { evaluate, variableFrom, varsOf } from "./kernel/localEval.ts";
import { PaperboatLink, type LinkStatus } from "./paperboat/link.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";

type RightTab = "workspace" | "shared" | "figures";
type FigureEntry = { id: string; source: string; time: number; figure: Figure };
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
  "lorenz.jl": `# lorenz.jl — the Lorenz attractor with a small RK4 loop
σ, ρ, β = 10.0, 28.0, 8 / 3
dt = 0.01
t = 0:dt:20
x = zeros(3, length(t))
x[:, 1] = [1.0, 1.0, 1.0]
f(s) = [σ * (s[2] - s[1]), s[1] * (ρ - s[3]) - s[2], s[1] * s[2] - β * s[3]]
for k in 2:length(t)
    s = x[:, k - 1]
    k1 = f(s)
    k2 = f(s + dt / 2 * k1)
    k3 = f(s + dt / 2 * k2)
    k4 = f(s + dt * k3)
    x[:, k] = s + dt / 6 * (k1 + 2k2 + 2k3 + k4)
end
plot(t, x[1, :])
`,
  "plots/peaks.jl": `# peaks.jl — the demo surface
A = peaks(512)
surf(A)
`,
  "state_space.jl": `# state_space.jl — a second-order system as A, B, C, D
A = [0.0 1.0; -2.0 -3.0]
B = [0.0; 1.0]
C = [1.0 0.0]
D = [0.0]
x0 = [1.0, 0.0]

# Paperboat's state_space block integrates this with the run's solver.
`,
  "export.jl": `# export.jl — write the surface and the workspace
savefig("surface.png")
writematrix(A, "data/run-07.csv")
save("data/run-07.mat")
`,
};

export function App() {
  const [figures, setFigures] = useState<FigureEntry[]>([]);
  const [activeFigureId, setActiveFigureId] = useState<string | null>(null);
  const [figureFocus, setFigureFocus] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("workspace");
  const [files, setFiles] = useState<Record<string, string>>(INITIAL_FILES);
  const [folders, setFolders] = useState<string[]>(["plots"]);
  const [selectedFile, setSelectedFile] = useState("surface.jl");
  const [selectedVar, setSelectedVar] = useState("A");
  const [workspace, setWorkspace] = useState<WorkspaceVariable[]>(() => [...(demoWorkspaces["surface.jl"] ?? [])]);
  const [workspaceRoot, setWorkspaceRoot] = useState("~/Documents/paperboat/squero-studio/mx");
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [saved, setSaved] = useState<FileSystemDirectoryHandle | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [varQuery, setVarQuery] = useState("");
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const filePanel = useRef<FilePanelHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [stageW, setStageW] = useState(540);
  const [consoleH, setConsoleH] = useState(154);
  const [consoleHidden, setConsoleHidden] = useState(false);
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
    { level: "info", text: "paperboat: every workspace variable broadcasts when a backend is up" },
    { level: "ok", text: "matrices and vectors travel to blocks, not project variables" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histAt, setHistAt] = useState(-1);
  const link = useRef<PaperboatLink | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);
  const say = (text: string, level: Line["level"] = "info", cmd = false) => setLines((l) => [...l, { level, text, cmd }]);
  const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  const commitTitle = () => {
    const name = titleDraft.trim();
    if (name && name !== baseName(selectedFile)) filePanel.current?.rename(selectedFile, name);
    setRenamingTitle(false);
  };
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

  const currentVars = workspace;
  const rows = useMemo(() => mergeShared(currentVars, paperboat), [currentVars, paperboat]);

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

  const timeOf = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const addFigure = (figure: Figure, source: string) => {
    const entry: FigureEntry = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      source,
      time: Date.now(),
      figure,
    };
    setFigures((prev) => [entry, ...prev]);
    setActiveFigureId(entry.id);
    setFigureFocus(null);
    setChartHidden(false);
  };

  const removeFigure = (id: string) => {
    setFigures((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (activeFigureId === id) setActiveFigureId(next[0]?.id ?? null);
      return next;
    });
  };

  const focusLine = (line: string) => {
    const match = figures.find((f) => f.figure.tiles.some((t) => t.title === line));
    if (!match) { say("run the script to create this figure", "warn"); return; }
    setActiveFigureId(match.id);
    setFigureFocus(line);
    setChartHidden(false);
    say(`chart → ${line}`, "ok");
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

  const runCode = (code: string, mode: "cell" | "line" | "selection" | "file") => {
    const fig = parseFigure(code);
    if (fig) addFigure(fig, selectedFile);
    else setFigureFocus(null);
    const byName = new Map(workspace.map((v) => [v.name, v]));
    let changed = false;
    for (const raw of code.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const control = /^(clear|clearvars|clc)\s*(?:\(\s*([^)]*)\s*\))?$/.exec(line);
      if (control) {
        if (control[1] === "clc") {
          setLines([]);
        } else {
          const arg = (control[2] ?? "").replace(/^["']|["']$/g, "").trim();
          if (arg && arg !== "all") byName.delete(arg);
          else byName.clear();
          changed = true;
        }
        continue;
      }
      const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(line);
      if (!assign) continue;
      const res = evaluate(assign[2], Object.fromEntries([...byName].map(([name, v]) => [name, v.value ?? v.preview ?? 0])));
      if (res.ok) {
        byName.set(assign[1], variableFrom(assign[1], res.value));
        changed = true;
      }
    }
    if (changed) setWorkspace([...byName.values()]);
    say(`run ${mode} · ${code.split("\n").length} lines`, "ok");
  };

  const runScript = () => runCode(files[selectedFile] ?? "", "file");

  const applyHandle = async (handle: FileSystemDirectoryHandle, restored = false) => {
    const tree = await readTree(handle);
    setDir(handle);
    setReadOnly(false);
    setWorkspaceRoot(handle.name);
    setFiles(tree.files);
    setFolders(tree.folders);
    setSelectedFile(Object.keys(tree.files).sort()[0] ?? "");
    setDirty(new Set());
    say(`${restored ? "restored" : "opened"} ${handle.name} · ${Object.keys(tree.files).length} files`, "ok");
  };

  useEffect(() => {
    void loadDirHandle().then(async (handle) => {
      if (!handle) return;
      setSaved(handle);
      if (await canWrite(handle)) await applyHandle(handle, true);
      else say("workspace folder remembered · click the folder key to reconnect", "info");
    });
  }, []);

  const openFolder = async () => {
    if (typeof window.showDirectoryPicker === "function") {
      try {
        if (saved && (await askWrite(saved))) {
          await applyHandle(saved, true);
          return;
        }
        const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "mx-workspace", startIn: "documents" });
        setSaved(handle);
        await applyHandle(handle);
        try { await saveDirHandle(handle); } catch { /* private mode or a browser without handle storage */ }
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") say(`folder: ${error instanceof Error ? error.message : String(error)}`, "warn");
      }
      return;
    }
    // Firefox and Safari: a read-only folder picker through a directory input.
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.onchange = async () => {
      const picked = [...(input.files ?? [])].filter((file) => file.name.endsWith(".jl"));
      const treeFiles: Record<string, string> = {};
      const treeFolders = new Set<string>();
      for (const file of picked) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = path.split("/").slice(1);
        for (let i = 1; i < parts.length; i++) treeFolders.add(parts.slice(0, i).join("/"));
        if (file.size <= 2 * 1024 * 1024) treeFiles[parts.join("/")] = await file.text();
      }
      setDir(null);
      setReadOnly(true);
      setWorkspaceRoot(picked[0] ? ((picked[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? "").split("/")[0] : "workspace");
      setFiles(treeFiles);
      setFolders([...treeFolders]);
      setSelectedFile(Object.keys(treeFiles).sort()[0] ?? "");
      setDirty(new Set());
      say(`opened ${picked.length} .jl files (read-only)`, "ok");
    };
    input.click();
  };

  const saveCurrent = async () => {
    if (!selectedFile) return;
    if (!dir) {
      say(readOnly ? "this folder is read-only; use Chrome or Edge to save" : "the workspace is in memory; open a folder to save", "warn");
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

  const activeFigure = figures.find((f) => f.id === activeFigureId) ?? figures[0] ?? null;
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
    { id: "figures-tab", label: "Figures", menu: "view", group: "panels", checked: rightTab === "figures", run: () => setRightTab("figures") },
    { id: "console", label: "Console", menu: "view", group: "panels", checked: !consoleHidden, run: () => setConsoleHidden((v) => !v) },
    { id: "shared-tab", label: "Shared variables", menu: "view", group: "panels", checked: rightTab === "shared", run: () => setRightTab("shared") },
    { id: "run", label: "Run script", menu: "run", group: "run", run: runScript },
  ];

  return (
    <div className={`app split${chartHidden ? " chart-hidden" : ""}${consoleHidden ? " console-hidden" : ""}`} style={{ "--stage-w": `${stageW}px`, "--console-h": `${consoleH}px` } as CSSProperties}>
      <header className="topbar">
        <span className="wordmark" aria-label="Squero Studio: MX">
          <SqueroLogo product="MX" height={20} />
        </span>
        <MenuBar commands={commands} />
        <div className="proj" title="Double-click to rename">
          <span className="dot" />
          {renamingTitle ? (
            <input
              className="proj-input"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                else if (e.key === "Escape") { e.preventDefault(); setRenamingTitle(false); }
              }}
              aria-label="File name"
            />
          ) : (
            <span className="proj-name" onDoubleClick={() => { setTitleDraft(baseName(selectedFile)); setRenamingTitle(true); }}>{selectedFile}</span>
          )}
        </div>
        <div className={`status ${status}`}><span className="pip" />{status === "attached" ? "paperboat · attached" : "julia · ready"}</div>
        <div className="keys">
          <button
            className={`key small chartkey${chartHidden ? " off" : ""}`}
            onClick={() => setChartHidden((v) => !v)}
            title={chartHidden ? "Show chart" : "Hide chart"}
            aria-label={chartHidden ? "Show chart" : "Hide chart"}
            aria-pressed={!chartHidden}
          >
            <svg viewBox="0 0 16 16" aria-hidden><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M4 11l3-3 2 2 3-4" /></svg>
          </button>
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
        onOpenFolder={() => void openFolder()}
        rootBadge={dir ? "folder" : readOnly ? "read-only" : "in-memory"}
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
        variables={workspace.map((v) => ({ name: v.name, type: v.type, value: v.value ?? v.preview }))}
        onChart={(_kind, line) => focusLine(line)}
        onRunSelection={runCode}
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
          <b>{activeFigure ? baseName(activeFigure.source) : "figures"}</b>
          <span className="tag">
            {activeFigure
              ? `${timeOf(activeFigure.time)} · ${activeFigure.figure.rows === 1 && activeFigure.figure.cols === 1 ? "" : `${activeFigure.figure.rows}×${activeFigure.figure.cols} · `}${activeFigure.figure.tiles.length} plot${activeFigure.figure.tiles.length === 1 ? "" : "s"}`
              : "run a script or open a figure"}
          </span>
          <span className="sp" />
          <button className="key small stage-hide" onClick={() => setChartHidden(true)} title="Hide chart">×</button>
        </div>
        <div className="stage-body">
          {activeFigure ? (
            <FigureView figure={activeFigure.figure} focus={figureFocus} />
          ) : (
            <div className="stage-empty">
              <p>No figure yet.</p>
              <span>Run a script with <span className="mono">plot</span> or <span className="mono">surf</span>, or open the Figures tab.</span>
            </div>
          )}
        </div>
      </main>

      <aside className="panel rightpane">
        <div className="head">
          <div className="rtabs">
            <button className={rightTab === "workspace" ? "on" : ""} onClick={() => setRightTab("workspace")}>workspace</button>
            <button className={rightTab === "shared" ? "on" : ""} onClick={() => setRightTab("shared")}>shared</button>
            <button className={rightTab === "figures" ? "on" : ""} onClick={() => setRightTab("figures")}>figures</button>
          </div>
          <span className="sp" />
          <span className="tag">{rightTab === "figures" ? `${figures.length} ${figures.length === 1 ? "figure" : "figures"}` : `${active} shared`}</span>
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
        ) : rightTab === "shared" ? (
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
            <p className="hint">Every MX variable is broadcast automatically once the backend is up: scalars as numbers, arrays as text (JSON when small, a typed descriptor otherwise). Array data still travels to <span className="mono">state_space</span>/matrix blocks. A single MX instance is enough.</p>

            <div className="rule" />
            <div className="lbl">runs</div>
            <p className="hint">Runs happen in Paperboat. MX shares the scalars Paperboat needs and reads the signals it produces.</p>
          </div>
        ) : (
          <div className="tabbody figtab">
            <div className="figlist">
              {figures.map((f) => (
                <div
                  className={`figrow${f.id === activeFigureId ? " on" : ""}`}
                  key={f.id}
                  role="button"
                  tabIndex={0}
                  title={f.source}
                  onClick={() => { setActiveFigureId(f.id); setChartHidden(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveFigureId(f.id); setChartHidden(false); } }}
                >
                  <span className="figmark">{f.figure.rows === 1 && f.figure.cols === 1 ? "plot" : `${f.figure.rows}×${f.figure.cols}`}</span>
                  <div className="figmeta">
                    <b>{baseName(f.source)}</b>
                    <span>{timeOf(f.time)} · {f.figure.tiles.length} plot{f.figure.tiles.length === 1 ? "" : "s"}</span>
                  </div>
                  <button className="figx" onClick={(e) => { e.stopPropagation(); removeFigure(f.id); }} title="Close figure">×</button>
                </div>
              ))}
              {figures.length === 0 && <p className="hint">Run a script with <span className="mono">plot</span> or <span className="mono">surf</span>; each run adds a figure here.</p>}
            </div>
          </div>
        )}
      </aside>

      {!consoleHidden && (
        <div className="console-splitter" role="separator" aria-orientation="horizontal" aria-label="Resize the console" onPointerDown={startConsoleResize} onDoubleClick={() => setConsoleH(154)} />
      )}

      <section className="console">
        <div className="chead">
          <span className="on">console</span><span>messages</span><span className="sp" />
          <span className="tag">julia 1.11.5 · frontend 0.1.0</span>
          <button className="key small console-toggle" onClick={() => setConsoleHidden((v) => !v)} title={consoleHidden ? "Show console" : "Hide console"}>{consoleHidden ? "show" : "hide"}</button>
        </div>
        {!consoleHidden && <div className="lines">
          {lines.map((l, i) => (
            <div key={i} className={l.level}>{l.cmd ? <span className="prompt">julia&gt; </span> : null}{l.text}</div>
          ))}
          <div ref={consoleEnd} />
        </div>}
        {!consoleHidden && (
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
        )}
      </section>
    </div>
  );
}
