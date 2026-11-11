import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { MenuBar } from "@paperboat/shared/components";
import type { Command } from "@paperboat/shared";
import type { Variable } from "@paperboat/shared/protocol";
import { FigureView } from "./plot/FigureView.tsx";
import { parseFigure, type Figure } from "./plot/figure.ts";
import { captureFigure, downloadBlob, encodeFigure, figureFileBase, zipFiles, type FigureFormat, FIGURE_FORMATS } from "./plot/export.ts";
import type { WorkspaceVariable } from "./chart/samples.ts";
import { Script } from "./editor/Script.tsx";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "./editor/CodeEditor.tsx";
import { SqueroLogo } from "./shell/SqueroLogo.tsx";
import { AboutModal } from "./shell/AboutModal.tsx";
import { probeKernel, type KernelInfo } from "./kernel/probe.ts";
import { FRONTEND_VERSION, JULIA_VERSION, KERNEL_PROTOCOL, KERNEL_VERSION, PAPERBOAT_PROTOCOL } from "./version.ts";
import { FilePanel, type FilePanelHandle } from "./files/FilePanel.tsx";
import { askWrite, canWrite, loadDirHandle, readTree, saveDirHandle, storageOf } from "./files/storage.ts";
import { loadServerWorkspace, serverStorage, type ServerWorkspace } from "./files/server.ts";
import { downloadMat } from "./workspace/mat.ts";
import { defineFunction, evaluate, variableFrom, varsOf, type FunctionTable } from "./kernel/localEval.ts";
import { PaperboatLink, type LinkStatus } from "./paperboat/link.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";

type RightTab = "workspace" | "shared" | "figures";

/** The workspace lives on disk; this is the folder the picker starts from and the default. */
export const DEFAULT_WORKSPACE = "~/Documents/paperboat/squero-studio/mx";
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

export function App() {
  const [figures, setFigures] = useState<FigureEntry[]>([]);
  const [activeFigureId, setActiveFigureId] = useState<string | null>(null);
  const [figureSel, setFigureSel] = useState<string[]>([]);
  const [figureAnchor, setFigureAnchor] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<FigureFormat>("png");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(null);
  const [filesHidden, setFilesHidden] = useState(false);
  const [rightHidden, setRightHidden] = useState(false);
  const [figureFocus, setFigureFocus] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [rightTab, setRightTab] = useState<RightTab>("workspace");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedVar, setSelectedVar] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceVariable[]>([]);
  const [functions, setFunctions] = useState<FunctionTable>({});
  const [workspaceRoot, setWorkspaceRoot] = useState(DEFAULT_WORKSPACE);
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [serverRoot, setServerRoot] = useState<string | null>(null);
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
    { level: "info", text: `julia ${JULIA_VERSION} · kernel ${KERNEL_VERSION} · frontend ${FRONTEND_VERSION} · ${KERNEL_PROTOCOL} · ${PAPERBOAT_PROTOCOL}` },
    { level: "info", text: "paperboat: every workspace variable broadcasts when a backend is up" },
    { level: "ok", text: "matrices and vectors travel to blocks, not project variables" },
  ]);
  const [input, setInput] = useState("");
  const [scratch, setScratch] = useState("");
  const [scratchOut, setScratchOut] = useState<{ text: string; type?: string; error?: boolean } | null>(null);
  const [lastRun, setLastRun] = useState<{ time: number; ms: number; lines: number; mode: string } | null>(null);
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
  useEffect(() => { consoleEnd.current?.scrollIntoView({ block: "nearest" }); }, [lines, consoleHidden]);
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
      document.body.classList.remove("resizing");
    };
    document.body.style.cursor = "col-resize";
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const storage = useMemo(() => (dir ? storageOf(dir) : serverRoot ? serverStorage() : undefined), [dir, serverRoot]);

  const currentVars = workspace;
  const rows = useMemo(() => mergeShared(currentVars, paperboat), [currentVars, paperboat]);

  useEffect(() => { localStorage.setItem("mx.editor", JSON.stringify(editor)); }, [editor]);
  useEffect(() => {
    let live = true;
    void probeKernel().then((info) => { if (live) setKernelInfo(info); });
    return () => { live = false; };
  }, []);

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
      for (const [name, fn] of Object.entries(functions)) say(`${name}(${fn.params.join(", ")})  function`);
      return;
    }
    const definition = defineFunction(cmd, functions);
    if (definition) {
      setFunctions(definition);
      say(`${cmd.slice(0, cmd.indexOf("(")).trim()} defined`, "ok");
      return;
    }
    if (head === "attach") { attach(); return; }
    if (head === "detach") { link.current?.close(); setStatus("idle"); say("paperboat: detached", "warn"); return; }
    if (head === "run") { runScript(); return; }
    if (head === "version") { say(`julia ${JULIA_VERSION} · frontend ${FRONTEND_VERSION} · kernel ${KERNEL_VERSION} · ${KERNEL_PROTOCOL} · ${PAPERBOAT_PROTOCOL}`); return; }
    const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(cmd);
    if (assign) {
      const res = evaluate(assign[2], varsOf(workspace), functions);
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
    const res = evaluate(cmd, varsOf(workspace), functions);
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

  const fmt = (n: number) => {
    if (Number.isInteger(n)) return String(n);
    if (Math.abs(n) >= 1e4 || (Math.abs(n) < 1e-3 && n !== 0)) return n.toExponential(1);
    return String(Number(n.toFixed(3)));
  };
  /** The value as the card shows it: a scalar, or the first two entries of an array. */
  const valueOf = (v: { value?: number | boolean | string | number[] | number[][]; preview?: number[] }): string => {
    const raw = v.value;
    if (typeof raw === "number") return fmt(raw);
    if (typeof raw === "boolean") return String(raw);
    if (typeof raw === "string") return raw;
    const list = Array.isArray(raw) ? (Array.isArray(raw[0]) ? (raw as number[][]).flat() : (raw as number[])) : v.preview;
    if (!list || list.length === 0) return "—";
    const head = list.slice(0, 2).map(fmt).join(", ");
    return `[${head}${list.length > 2 ? ", …" : ""}]`;
  };

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
    setFigureSel([entry.id]);
    setFigureAnchor(entry.id);
    setFigureFocus(null);
    setChartHidden(false);
  };

  const removeFigure = (id: string) => {
    const next = figures.filter((f) => f.id !== id);
    setFigures(next);
    setFigureSel((prev) => prev.filter((one) => one !== id));
    if (activeFigureId === id) setActiveFigureId(next[0]?.id ?? null);
    setFigureAnchor(null);
  };

  const removeSelectedFigures = () => {
    if (figureSel.length === 0) return;
    const gone = new Set(figureSel);
    const next = figures.filter((f) => !gone.has(f.id));
    setFigures(next);
    setFigureSel([]);
    setFigureAnchor(null);
    if (activeFigureId && gone.has(activeFigureId)) setActiveFigureId(next[0]?.id ?? null);
    say(`closed ${gone.size} figure${gone.size === 1 ? "" : "s"}`, "warn");
  };

  const selectFigure = (id: string, additive: boolean, range: boolean) => {
    setChartHidden(false);
    if (range) {
      const from = figureAnchor ?? activeFigureId ?? id;
      const a = figures.findIndex((f) => f.id === from);
      const b = figures.findIndex((f) => f.id === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setFigureSel(figures.slice(lo, hi + 1).map((f) => f.id));
      } else {
        setFigureSel([id]);
      }
      setActiveFigureId(id);
      return;
    }
    if (additive) {
      const has = figureSel.includes(id);
      const next = has ? figureSel.filter((one) => one !== id) : [...figureSel, id];
      setFigureSel(next);
      if (has) {
        if (activeFigureId === id) setActiveFigureId(next[0] ?? null);
      } else {
        setActiveFigureId(id);
      }
      setFigureAnchor(id);
      return;
    }
    setFigureSel([id]);
    setFigureAnchor(id);
    setActiveFigureId(id);
  };

  const settle = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 80)));
  });

  /** Export the selected figures; switching the stage lets each one render before capture. */
  const exportFigures = async () => {
    const ids = figureSel.length ? figureSel : activeFigureId ? [activeFigureId] : [];
    if (ids.length === 0 || !stageRef.current) return;
    const before = activeFigureId;
    const files: { name: string; blob: Blob }[] = [];
    for (const id of ids) {
      const entry = figures.find((f) => f.id === id);
      if (!entry) continue;
      setActiveFigureId(id);
      await settle();
      const host = stageRef.current;
      const canvas = host ? captureFigure(host) : null;
      if (!canvas) continue;
      const title = `${baseName(entry.source)} · ${entry.figure.rows}×${entry.figure.cols}`;
      files.push({ name: `${figureFileBase(entry.source, files.length, ids.length)}.${exportFormat}`, blob: encodeFigure(canvas, exportFormat, title) });
    }
    setActiveFigureId(before);
    if (files.length === 0) { say("nothing to export", "warn"); return; }
    if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
    else downloadBlob(await zipFiles(files), "mx-figures.zip");
    say(`exported ${files.length} figure${files.length === 1 ? "" : "s"} · ${exportFormat.toUpperCase()}`, "ok");
  };

  const focusLine = (line: string) => {
    const match = figures.find((f) => f.figure.tiles.some((t) => t.title === line));
    if (!match) { say("run the script to create this figure", "warn"); return; }
    setActiveFigureId(match.id);
    setFigureSel([match.id]);
    setFigureAnchor(match.id);
    setFigureFocus(line);
    setChartHidden(false);
    say(`chart → ${line}`, "ok");
  };

  const clearWorkspace = () => {
    setWorkspace([]);
    setFunctions({});
    setSelectedVar("");
    say("workspace cleared", "warn");
  };

  const clearVar = (name: string) => {
    setWorkspace((prev) => prev.filter((v) => v.name !== name));
    setFunctions((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    say(`clear ${name}`, "warn");
  };

  /** The scratch line evaluates against the workspace; `name = expr` adds a variable. */
  const evalScratch = () => {
    const source = scratch.trim();
    if (!source) return;
    const definition = defineFunction(source, functions);
    if (definition) {
      setFunctions(definition);
      setScratchOut({ text: `${source.slice(0, source.indexOf("(")).trim()} defined`, type: "function" });
      setScratch("");
      return;
    }
    const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(source);
    const res = evaluate(assign ? assign[2] : source, varsOf(workspace), functions);
    if (!res.ok) {
      setScratchOut({ text: res.error, error: true });
      return;
    }
    if (assign) {
      const next = variableFrom(assign[1], res.value);
      setWorkspace((prev) => [...prev.filter((v) => v.name !== next.name), next]);
      setSelectedVar(next.name);
      setScratchOut({ text: `${next.name} = ${res.display}`, type: next.type });
    } else {
      setScratchOut({ text: res.display, type: variableFrom("ans", res.value).type });
    }
    setScratch("");
  };

  const runCode = (code: string, mode: "cell" | "line" | "selection" | "file") => {
    const startedAt = performance.now();
    const fig = parseFigure(code);
    if (fig) addFigure(fig, selectedFile);
    else setFigureFocus(null);
    const byName = new Map(workspace.map((v) => [v.name, v]));
    let fns = { ...functions };
    let changed = false;
    let fnsChanged = false;
    for (const raw of code.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const control = /^(clear|clearvars|clc)\s*(?:\(\s*([^)]*)\s*\))?$/.exec(line);
      if (control) {
        if (control[1] === "clc") {
          setLines([]);
        } else {
          const arg = (control[2] ?? "").replace(/^["']|["']$/g, "").trim();
          if (arg && arg !== "all") { byName.delete(arg); delete fns[arg]; }
          else { byName.clear(); fns = {}; }
          changed = true;
          fnsChanged = true;
        }
        continue;
      }
      const definition = defineFunction(line, fns);
      if (definition) { fns = definition; fnsChanged = true; continue; }
      const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(line);
      if (!assign) continue;
      const res = evaluate(assign[2], Object.fromEntries([...byName].map(([name, v]) => [name, v.value ?? v.preview ?? 0])), fns);
      if (res.ok) {
        byName.set(assign[1], variableFrom(assign[1], res.value));
        changed = true;
      }
    }
    if (changed) setWorkspace([...byName.values()]);
    if (fnsChanged) setFunctions(fns);
    const lines = code.split("\n").filter((line) => line.trim()).length;
    setLastRun({ time: Date.now(), ms: Math.max(1, Math.round(performance.now() - startedAt)), lines, mode });
    say(`run ${mode} · ${lines} lines`, "ok");
  };

  const runScript = () => runCode(files[selectedFile] ?? "", "file");

  const applyServerTree = (tree: ServerWorkspace, restored = true) => {
    setDir(null);
    setServerRoot(tree.root);
    setReadOnly(false);
    setWorkspaceRoot(tree.root);
    setFiles(tree.files);
    setFolders(tree.folders);
    setSelectedFile(Object.keys(tree.files).sort()[0] ?? "");
    setDirty(new Set());
    say(`${restored ? "synced" : "opened"} ${tree.root} · ${Object.keys(tree.files).length} files`, "ok");
  };

  const applyHandle = async (handle: FileSystemDirectoryHandle, restored = false) => {
    const tree = await readTree(handle);
    setDir(handle);
    setServerRoot(null);
    setReadOnly(false);
    setWorkspaceRoot(handle.name === "mx" ? DEFAULT_WORKSPACE : handle.name);
    setFiles(tree.files);
    setFolders(tree.folders);
    setSelectedFile(Object.keys(tree.files).sort()[0] ?? "");
    setDirty(new Set());
    say(`${restored ? "restored" : "opened"} ${handle.name} · ${Object.keys(tree.files).length} files`, "ok");
  };

  useEffect(() => {
    void (async () => {
      // A folder the user picked wins while its permission lasts; otherwise the default folder
      // on disk is opened through the local endpoint, with no prompt.
      const handle = await loadDirHandle();
      if (handle) {
        setSaved(handle);
        if (await canWrite(handle)) { await applyHandle(handle, true); return; }
      }
      const tree = await loadServerWorkspace();
      if (tree) { applyServerTree(tree); return; }
      if (handle) say("workspace folder remembered · click the folder key to reconnect", "info");
    })();
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
        setServerRoot(null);
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
    if (!storage) {
      say(readOnly ? "this folder is read-only; use Chrome or Edge to save" : "no folder is open; open the workspace in Documents to save", "warn");
      return;
    }
    try {
      await storage.write(selectedFile, files[selectedFile] ?? "");
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
      document.body.classList.remove("resizing");
    };
    document.body.style.cursor = "row-resize";
    document.body.classList.add("resizing");
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
    { id: "files-panel", label: "Files panel", menu: "view", group: "panels", checked: !filesHidden, run: () => setFilesHidden((v) => !v) },
    { id: "workspace-panel", label: "Workspace panel", menu: "view", group: "panels", checked: !rightHidden, run: () => setRightHidden((v) => !v) },
    { id: "workspace-tab", label: "Workspace tab", menu: "view", group: "panels", checked: rightTab === "workspace", run: () => setRightTab("workspace") },
    { id: "figures-tab", label: "Figures", menu: "view", group: "panels", checked: rightTab === "figures", run: () => setRightTab("figures") },
    { id: "console", label: "Console", menu: "view", group: "panels", checked: !consoleHidden, run: () => setConsoleHidden((v) => !v) },
    { id: "shared-tab", label: "Shared variables", menu: "view", group: "panels", checked: rightTab === "shared", run: () => setRightTab("shared") },
    { id: "run", label: "Run script", menu: "run", group: "run", run: runScript },
    { id: "about", label: "About Squero Studio", menu: "view", group: "about", run: () => setAboutOpen(true) },
  ];

  return (
    <div className={`app split${chartHidden ? " chart-hidden" : ""}${consoleHidden ? " console-hidden" : ""}${filesHidden ? " files-hidden" : ""}${rightHidden ? " right-hidden" : ""}`} style={{ "--stage-w": `${stageW}px`, "--console-h": `${consoleH}px` } as CSSProperties}>
      <header className="topbar">
        <span className="wordmark" aria-label="Squero Studio: MX">
          <SqueroLogo product="MX" height={20} running />
        </span>
        <MenuBar commands={commands} />
        <button type="button" className="menu-title" aria-expanded={aboutOpen} title="About Squero Studio" onClick={() => setAboutOpen(true)}>About</button>
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
        <div className={`status ${status}`}><span className="pip" />{status === "attached" ? "paperboat · attached" : kernelInfo ? `julia ${kernelInfo.julia} · kernel` : "julia · ready"}</div>
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
        rootBadge={dir ? "folder" : serverRoot ? "synced" : readOnly ? "read-only" : "not open"}
        offline={!dir && !serverRoot && !readOnly}
        collapsed={filesHidden}
        onToggle={() => setFilesHidden((v) => !v)}
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
        functions={functions}
        onChart={(_kind, line) => focusLine(line)}
        onRunSelection={runCode}
        lastRun={lastRun}
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
        <div className={`stage-body${activeFigure ? "" : " empty"}`} ref={stageRef}>
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
            <button className={rightTab === "figures" ? "on" : ""} onClick={() => setRightTab("figures")}>figures</button>
            <button className={rightTab === "shared" ? "on" : ""} onClick={() => setRightTab("shared")}>shared</button>
          </div>
          <span className="sp" />
          {rightTab !== "figures" && <span className="tag">{`${active} shared`}</span>}
          <button type="button" className="panel-toggle" onClick={() => setRightHidden(true)} title="Hide workspace" aria-label="Hide workspace" aria-expanded={!rightHidden}>
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" /></svg>
          </button>
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
                  <span className={`vval${v.type === "Float64" ? " scalar" : ""}`} title={valueOf(v)}>{valueOf(v)}</span>
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
            {consoleHidden && (
              <div className="scratch">
                <div className="lbl">scratch</div>
                <div className="box">
                  <span className="prompt">julia&gt;</span>
                  <input
                    value={scratch}
                    onChange={(e) => setScratch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); evalScratch(); }
                      else if (e.key === "Escape") { setScratch(""); setScratchOut(null); }
                    }}
                    placeholder="x * 2"
                    aria-label="Evaluate an expression"
                    spellCheck={false}
                  />
                  <button className="scratch-run" onClick={evalScratch} title="Evaluate (Enter)" aria-label="Evaluate">↵</button>
                </div>
                {scratchOut ? (
                  <div className={`preview${scratchOut.error ? " err" : ""}`}>
                    <span className="val">{scratchOut.text}</span>
                    {scratchOut.type && <span className="tag">{scratchOut.type}</span>}
                  </div>
                ) : (
                  <div className="preview muted">
                    <span className="val">assign with name = expr</span>
                    <span className="tag">never saved</span>
                  </div>
                )}
              </div>
            )}
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
          <div
            className="tabbody figtab"
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelectedFigures(); }
              else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setFigureSel(figures.map((f) => f.id)); }
              else if (e.key === "Escape") { setFigureSel(activeFigureId ? [activeFigureId] : []); }
            }}
          >
            <div className="figtools">
              <div className="seg figfmt" role="group" aria-label="Export format">
                {FIGURE_FORMATS.map((format) => (
                  <button key={format} className={exportFormat === format ? "on" : ""} onClick={() => setExportFormat(format)} aria-pressed={exportFormat === format}>{format}</button>
                ))}
              </div>
              <button className="key small" onClick={() => void exportFigures()} disabled={figureSel.length === 0 && !activeFigureId}>
                Export
              </button>
              <span className="sp" />
              <span className="tag">{figureSel.length ? `${figureSel.length} selected` : "no selection"}</span>
            </div>
            <div className="figlist" role="listbox" aria-multiselectable="true" aria-label="Figures">
              {figures.map((f) => (
                <div
                  className={`figrow${f.id === activeFigureId ? " on" : ""}${figureSel.includes(f.id) ? " sel" : ""}`}
                  key={f.id}
                  role="option"
                  aria-selected={figureSel.includes(f.id)}
                  tabIndex={0}
                  title={f.source}
                  onClick={(e) => selectFigure(f.id, e.metaKey || e.ctrlKey, e.shiftKey)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectFigure(f.id, e.metaKey || e.ctrlKey, e.shiftKey); } }}
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
            {figures.length > 0 && <p className="hint">Ctrl/⌘ click adds · Shift selects a range · Delete closes · exports the selection, or the shown figure.</p>}
          </div>
        )}
        <button type="button" className="panel-stand" onClick={() => setRightHidden(false)} title="Show workspace" aria-label="Show workspace">
          <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M9 3 5 7l4 4" /></svg>
          <span>{rightTab}</span>
        </button>
      </aside>

      {!consoleHidden && (
        <div className="console-splitter" role="separator" aria-orientation="horizontal" aria-label="Resize the console" onPointerDown={startConsoleResize} onDoubleClick={() => setConsoleH(154)} />
      )}

      <section className="console">
        <div className="chead">
          <span className="on">console</span><span>messages</span><span className="sp" />
          <span className="tag">julia {JULIA_VERSION} · frontend {FRONTEND_VERSION}</span>
          <button
            type="button"
            className={`panel-toggle console-toggle${consoleHidden ? "" : " open"}`}
            onClick={() => setConsoleHidden((v) => {
              if (!v) (document.activeElement as HTMLElement | null)?.blur();
              return !v;
            })}
            title={consoleHidden ? "Show console" : "Hide console"}
            aria-label={consoleHidden ? "Show console" : "Hide console"}
            aria-expanded={!consoleHidden}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 9l4-4 4 4" /></svg>
          </button>
        </div>
        <div className="lines" aria-hidden={consoleHidden}>
          {lines.map((l, i) => (
            <div key={i} className={l.level}>{l.cmd ? <span className="prompt">julia&gt; </span> : null}{l.text}</div>
          ))}
          <div ref={consoleEnd} />
        </div>
        <form className="cin" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-hidden={consoleHidden}>
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

      {aboutOpen && <AboutModal status={status} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
