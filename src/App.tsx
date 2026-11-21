import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AppBar, BarEnd, GlideBrackets, HelpWindow, StatusPill, useDismiss, useTheme } from "@paperboat/shared/components";
import { helpCommand, useShortcuts, type Command } from "@paperboat/shared";
import type { ClientMsg, Variable } from "@paperboat/shared/protocol";
import { bufferOf } from "./plot/export.ts";
import { addEntries, createRunToken, entryForLine, entryFrom, entryLabel, groupFiguresByRun, latestRunFigures, MIME, type FigureEntry, type FigureRun } from "./plot/history.ts";
import { unpackScene } from "./plot/scene.ts";
import { FigureView } from "./plot/FigureView.tsx";
import { ExportModal } from "./plot/ExportModal.tsx";
import { FIGURE_FORMATS, type FigureFormat, type FigureMeta, type KernelEvent, type ViewState } from "./kernel/protocol.ts";
import { SHIPPED_EXAMPLES, findShippedExample, type ShippedExample } from "./examples/catalog.ts";
import type { WorkspaceVariable } from "./workspace/samples.ts";
import { Script } from "./editor/Script.tsx";
import type { AnswerVariable } from "./editor/answers.ts";
import { useSqueroConfig, type ConfigStore } from "@paperboat/shared/editor";
import { RunStatus, SqueroWordmark } from "@paperboat/shared/squero";
import { AboutModal } from "./shell/AboutModal.tsx";
import { kernelUnavailableMessage, probeKernelHandshake, type KernelInfo, type KernelMismatch } from "./kernel/probe.ts";
import { docNames, evalCode, figureArtifact, figureScene, kernel, plotOptimum, resetKernel, setArray, setKernelBreakpoints, debugContinue, debugEval, debugLocals, debugPause, debugStart, debugStep, debugStop, whois, withArrays } from "./kernel/client.ts";
import type { BreakpointSpec, DebugFrame, DebugLocal, KernelEventMessage } from "./kernel/protocol.ts";
import { TypeIcon } from "./workspace/TypeIcon.tsx";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import { flattenBreakpoints, formatDebugValue, removeBreakpoint, setBreakpointCondition, setBreakpointEnabled, toggleBreakpointList, type BreakpointMap, type WatchEntry } from "./debug/state.ts";
import type { ScriptDebugControls } from "./editor/Script.tsx";
import { mxHelp, wordAtCaret } from "./shell/help.ts";
import { IMPORT_EXTENSIONS, importFile, type ImportValue, type Imported } from "./workspace/importData.ts";
import { ImportDialog } from "./workspace/ImportDialog.tsx";
import { VariableEditor } from "@paperboat/shared/components";
import { solveProblem } from "./paperboat/optimize.ts";
import { formatKernelImage, FRONTEND_VERSION, JULIA_VERSION, KERNEL_DIGEST, KERNEL_PROTOCOL, KERNEL_VERSION, kernelImageRef, PAPERBOAT_PROTOCOL } from "./version.ts";
import { FilePanel, type FilePanelHandle } from "./files/FilePanel.tsx";
import { KernelPanel } from "./shell/KernelPanel.tsx";
import { askWrite, canWrite, loadDirHandle, readTree, saveDirHandle, storageOf } from "./files/storage.ts";
import { loadGit, loadServerWorkspace, serverStorage, type GitState, type ServerWorkspace } from "./files/server.ts";
import { downloadMat } from "./workspace/mat.ts";
import { defineFunction, evaluate, variableFrom, varsOf, type FunctionTable } from "./kernel/localEval.ts";
import { replaceLatexAtCaret } from "./editor/unicode.ts";
import type { LinkStatus } from "./paperboat/link.ts";
import { PaperboatHub, type HubCapabilities } from "./paperboat/hub.ts";
import { discoverStations } from "./paperboat/discovery.ts";
import { mergeShared, setMessage } from "./paperboat/variables.ts";
import { detectSimModel, figureEntryFromSignals, rhsRunRequest, stateSpaceRunRequest, type Solver } from "./sim/stateSpace.ts";
import { SimRunDock } from "./sim/RunDock.tsx";

type RightTab = "workspace" | "debug" | "figures" | "kernel";

/** The workspace lives on disk; this is the folder the picker starts from and the default. */
export const DEFAULT_WORKSPACE = "~/Documents/paperboat/squero-studio/mx";
type Line = { level: "info" | "ok" | "warn" | "err"; text: string; cmd?: boolean };

/** The user's squero.toml (editor settings and themes, shared with OM), through server/config.mjs. */
const configStore: ConfigStore = {
  async read() {
    const res = await fetch("/__mx/config", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async write(text) {
    const res = await fetch("/__mx/config", { method: "PUT", body: text });
    if (!res.ok) throw new Error(await res.text());
  },
};

/** What the console prints and how it scrolls; kept in localStorage like the editor's settings. */
type ConsoleSettings = { echoCommands: boolean; echoValues: boolean; follow: boolean; fontSize: number };
const DEFAULT_CONSOLE: ConsoleSettings = { echoCommands: true, echoValues: true, follow: true, fontSize: 11 };

export function App() {
  const [figures, setFigures] = useState<FigureEntry[]>([]);
  const [activeFigureId, setActiveFigureId] = useState<string | null>(null);
  const [figureSel, setFigureSel] = useState<string[]>([]);
  const [figureAnchor, setFigureAnchor] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportEntriesOverride, setExportEntriesOverride] = useState<FigureEntry[] | null>(null);
  const [viewStates, setViewStates] = useState<Record<string, { state: ViewState; modified: boolean }>>({});
  const [resetSeq, setResetSeq] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  // The kernel tab stays mounted once opened, so a package job keeps reporting while another tab shows.
  const [kernelSeen, setKernelSeen] = useState(false);
  const [kernelInfo, setKernelInfo] = useState<KernelInfo | null>(null);
  const [kernelMismatch, setKernelMismatch] = useState<KernelMismatch | null>(null);
  const kernelUp = useRef(false);
  kernelUp.current = kernelInfo !== null;
  const helpProvider = useMemo(() => mxHelp(() => kernelUp.current), []);
  /** The first probe answered (or gave up): until then the chip says the kernel is starting. */
  const [kernelProbed, setKernelProbed] = useState(false);
  const [filesHidden, setFilesHidden] = useState(false);
  const [rightHidden, setRightHidden] = useState(false);
  const [figureFocus, setFigureFocus] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("workspace");
  const [breakpoints, setBreakpoints] = useState<BreakpointMap>({});
  const [debugActive, setDebugActive] = useState(false);
  const [debugPaused, setDebugPaused] = useState(false);
  const [debugLastOutcome, setDebugLastOutcome] = useState<"finished" | "stopped" | "error" | null>(null);
  const [debugFile, setDebugFile] = useState("");
  const [debugLine, setDebugLine] = useState<number | null>(null);
  const [debugFrames, setDebugFrames] = useState<DebugFrame[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<number | null>(null);
  const [debugLocalsList, setDebugLocalsList] = useState<DebugLocal[]>([]);
  const [watches, setWatches] = useState<WatchEntry[]>([]);
  const debugSourceRef = useRef("");
  const debugStartedAtRef = useRef<number | null>(null);
  const debugSessionDoneRef = useRef(false);
  const debugRunRef = useRef<FigureRun | null>(null);
  const debugEventRef = useRef<(event: KernelEventMessage) => void>(() => {});
  useEffect(() => kernel.onEvent((event) => debugEventRef.current(event)), []);
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
  const [openExampleId, setOpenExampleId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [varQuery, setVarQuery] = useState("");
  const filePanel = useRef<FilePanelHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The figure stage starts at about a quarter of the window, so the editor isn't squeezed on a laptop.
  const defaultStageW = () => Math.round(Math.min(540, Math.max(300, window.innerWidth * 0.28)));
  const [stageW, setStageW] = useState(defaultStageW);
  const [consoleH, setConsoleH] = useState(154);
  const [consoleHidden, setConsoleHidden] = useState(false);
  /** Kernel work in flight (a run or a console command): compiling, running, drawing. */
  const [running, setRunning] = useState(0);
  const busy = async <T,>(work: Promise<T>): Promise<T> => {
    setRunning((n) => n + 1);
    try { return await work; } finally { setRunning((n) => n - 1); }
  };
  /** What the run in flight is doing, and since when (#23). */
  const [phase, setPhase] = useState<{ phase: string; since: number } | null>(null);
  const runningNow = useRef(false);
  runningNow.current = phase !== null;
  const [helpQuery, setHelpQuery] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ file: string; data: Imported; reserved?: ReadonlySet<string> } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ name: string; type: string; value: ImportValue } | null>(null);
  const [consoleOpts, setConsoleOpts] = useState<ConsoleSettings>(() => {
    try { return { ...DEFAULT_CONSOLE, ...JSON.parse(localStorage.getItem("mx.console") ?? "{}") }; }
    catch { return DEFAULT_CONSOLE; }
  });
  const [consoleSettingsOpen, setConsoleSettingsOpen] = useState(false);
  const consoleSettingsRef = useRef<HTMLDivElement>(null);
  const consoleGear = useRef<HTMLButtonElement>(null);
  useDismiss(consoleSettingsRef, () => setConsoleSettingsOpen(false), { enabled: consoleSettingsOpen, triggerRef: consoleGear });
  useEffect(() => { localStorage.setItem("mx.console", JSON.stringify(consoleOpts)); }, [consoleOpts]);
  const [chartHidden, setChartHidden] = useState(false);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const [status, setStatus] = useState<LinkStatus>("idle");
  const [paperboat, setPaperboat] = useState<Variable[]>([]);
  const [pbLoaded, setPbLoaded] = useState(false);
  const [pbCount, setPbCount] = useState(0);
  const [pbCaps, setPbCaps] = useState<HubCapabilities>({ solvers: [], hasStateSpace: false, hasRhs: false, hasGraph: false, defaultDt: 0.01, defaultDuration: 10 });
  const [simSolver, setSimSolver] = useState<Solver>("auto");
  const [simDt, setSimDt] = useState(0.01);
  const [simDuration, setSimDuration] = useState(10);
  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState<number | null>(null);
  const [simStatusText, setSimStatusText] = useState<string | undefined>(undefined);
  const simRunRef = useRef<FigureRun | null>(null);
  const simSourceRef = useRef("");
  const simTitleRef = useRef("Paperboat simulation");
  const simStartedAtRef = useRef<number | null>(null);
  // The app theme and the editor settings, from the user's squero.toml (shared with OM).
  const { editor, setEditor, file: configFile, theme: themeChoice, setTheme: setThemeChoice } = useSqueroConfig(configStore, { editor: "mx.editor", theme: "mx.theme" });
  const appTheme = useTheme(themeChoice);
  const lastSent = useRef("");
  const attachedCount = useRef(0);
  const [lines, setLines] = useState<Line[]>([
    { level: "info", text: `julia ${JULIA_VERSION} · kernel ${KERNEL_VERSION} · frontend ${FRONTEND_VERSION} · ${KERNEL_PROTOCOL} · ${PAPERBOAT_PROTOCOL}` },
    { level: "info", text: "paperboat: every workspace variable broadcasts when a station is up" },
    { level: "ok", text: "matrices and vectors travel to blocks, not project variables" },
  ]);
  const [input, setInput] = useState("");
  const [scratch, setScratch] = useState("");
  const [scratchOut, setScratchOut] = useState<{ text: string; type?: string; error?: boolean } | null>(null);
  const [lastRun, setLastRun] = useState<{ time: number; ms: number; lines: number; mode: string } | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [histAt, setHistAt] = useState(-1);
  const link = useRef<PaperboatHub | null>(null);
  const refreshStations = useRef<() => void>(() => {});
  const consoleEnd = useRef<HTMLDivElement>(null);
  const say = (text: string, level: Line["level"] = "info", cmd = false) => setLines((l) => [...l, { level, text, cmd }]);
  /** Julia's `\pi` + Tab in a plain input: replace at the caret, keep the caret after the symbol. */
  const latexTab = (event: ReactKeyboardEvent<HTMLInputElement>, setValue: (value: string) => void): boolean => {
    if (event.key !== "Tab") return false;
    const target = event.currentTarget;
    const caret = target.selectionStart ?? target.value.length;
    const hit = replaceLatexAtCaret(target.value, caret);
    if (!hit) return false;
    event.preventDefault();
    setValue(hit.value);
    requestAnimationFrame(() => target.setSelectionRange(hit.caret, hit.caret));
    return true;
  };
  const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  const openExample = useMemo(
    () => (openExampleId ? SHIPPED_EXAMPLES.find((one) => one.id === openExampleId) ?? null : null),
    [openExampleId],
  );
  const editorFile = openExample ? openExample.path : selectedFile;
  const editorCode = openExample ? openExample.content : (files[selectedFile] ?? "");
  const editorSource = openExample ? `examples/${openExample.path}` : selectedFile;
  const editorReadOnly = openExample !== null;
  const editorDirty = !openExample && dirty.has(selectedFile);

  useEffect(() => {
    document.title = editorFile ? `${editorDirty ? "● " : ""}${editorFile} · Squero Studio` : "Squero Studio";
  }, [editorFile, editorDirty]);

  const openExampleByQuery = (query: { index?: number; name?: string }) => {
    const hit = findShippedExample(query);
    if (!hit) {
      const ref = query.index !== undefined ? `#${query.index}` : JSON.stringify(query.name ?? "");
      say(`open_example: no shipped example matching ${ref} (available: 1..${SHIPPED_EXAMPLES.length})`, "warn");
      return;
    }
    setOpenExampleId(hit.id);
    say(`opened ${hit.path} (read-only)`, "ok");
  };

  const handleKernelEvents = (events: readonly KernelEvent[] | undefined) => {
    for (const event of events ?? []) {
      if (event.type === "clc") {
        setLines([]);
      } else if (event.type === "clear" && !event.names?.length) {
        setFunctions({});
      } else if (event.type === "open_example") {
        openExampleByQuery({ index: event.index, name: event.name });
      }
    }
  };
  useEffect(() => { if (consoleOpts.follow) consoleEnd.current?.scrollIntoView({ block: "nearest" }); }, [lines, consoleHidden, consoleOpts.follow]);
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

  // Git, for the server workspace only (a picked folder has no process to run git in). Reloaded
  // when files come or go and when the window regains focus (a commit in a terminal, say).
  const [git, setGit] = useState<GitState | null>(null);
  const [gitTick, setGitTick] = useState(0);
  const fileKeys = Object.keys(files).join("\n");
  useEffect(() => {
    if (!serverRoot || dir) { setGit(null); return; }
    let live = true;
    void loadGit().then((next) => { if (live) setGit(next); });
    return () => { live = false; };
  }, [serverRoot, dir, fileKeys, gitTick]);
  useEffect(() => {
    const bump = () => setGitTick((n) => n + 1);
    window.addEventListener("focus", bump);
    return () => window.removeEventListener("focus", bump);
  }, []);
  const gitMarks = useMemo(() => {
    const marks: Record<string, string> = {};
    if (!git) return marks;
    const lf = (s: string) => s.replace(/\r\n/g, "\n");
    for (const [path, text] of Object.entries(files)) {
      const head = git.head[path];
      if (head !== undefined) { if (lf(head) !== lf(text)) marks[path] = "M"; }
      else if (git.untracked.includes(path)) marks[path] = "U";
    }
    return marks;
  }, [files, git]);

  const currentVars = workspace;
  const rows = useMemo(() => mergeShared(currentVars, paperboat), [currentVars, paperboat]);

  const applyProbe = (res: Awaited<ReturnType<typeof probeKernelHandshake>>) => {
    setKernelProbed(true);
    if (res.status === "ready") {
      setKernelInfo(res.info);
      setKernelMismatch(null);
      return res.info;
    }
    if (res.status === "mismatch") {
      setKernelInfo(null);
      setKernelMismatch(res.mismatch);
      say(res.mismatch.message, "err");
      return null;
    }
    setKernelInfo(null);
    return null;
  };

  useEffect(() => {
    let live = true;
    void probeKernelHandshake(60000).then((res) => {
      if (!live) return;
      const info = applyProbe(res);
      if (info) {
        say(`julia ${info.julia} · kernel ${formatKernelImage(info.image, info.image_digest)} · squero-kernel/${info.protocol}`, "ok");
      }
    });
    return () => { live = false; };
  }, []);


  useEffect(() => {
    const h = new PaperboatHub();
    link.current = h;
    h.onStatus = (s) => {
      setStatus(s);
      const count = h.attached.length;
      setPbCount(count);
      if (count !== attachedCount.current) {
        attachedCount.current = count;
        lastSent.current = "";
        if (count > 0) say(`paperboat: ${count} instance${count === 1 ? "" : "s"} attached`, "ok");
        else if (s === "failed") say("paperboat: no station answered", "warn");
      } else if (s === "failed" && count === 0) {
        setPbLoaded(false);
      }
    };
    h.onVariables = (vars, loaded) => {
      setPaperboat(vars);
      setPbLoaded(loaded);
    };
    h.onCapabilities = (caps) => {
      setPbCaps(caps);
    };
    h.onRunEvent = (_url, ev) => {
      if (ev.type === "started") {
        setSimRunning(true);
        setSimProgress(0);
        setSimStatusText(undefined);
        return;
      }
      if (ev.type === "progress") {
        setSimProgress(ev.fraction);
        return;
      }
      if (ev.type === "log") {
        say(`paperboat: ${ev.text}`, ev.level === "error" ? "err" : ev.level === "warn" ? "warn" : "info");
        return;
      }
      if (ev.type === "finished") {
        setSimRunning(false);
        setSimProgress(null);
        const ms = simStartedAtRef.current !== null ? Math.max(1, Math.round(performance.now() - simStartedAtRef.current)) : undefined;
        simStartedAtRef.current = null;
        setSimStatusText(ev.status === "done" ? `done · ${ev.samples.length} samples` : ev.status);
        const run = simRunRef.current ? { ...simRunRef.current, ...(ms !== undefined ? { durationMs: ms } : {}) } : undefined;
        if (ev.samples.length > 0) {
          const entry = figureEntryFromSignals(
            ev.samples,
            simSourceRef.current || "simulation",
            simTitleRef.current || "Paperboat simulation",
            run,
          );
          if (entry) {
            setFigures((prev) => addEntries(prev, [entry]));
            setActiveFigureId(entry.key);
            setFigureSel([entry.key]);
            setFigureAnchor(entry.key);
            setSelectedRunId(run?.id ?? null);
            setChartHidden(false);
          }
        }
        say(`paperboat run ${ev.status}${ev.samples.length ? ` · ${ev.samples.length} samples` : ""}`, ev.status === "done" ? "ok" : "warn");
      }
    };
    let live = true;
    const poll = async () => {
      const found = await discoverStations();
      if (!live) return;
      // The launcher knows every station it started; the two conventional ports keep a
      // hand-started station working even when the CLI is not installed.
      const urls = found.ok && found.stations.length
        ? found.stations.map((station) => station.ws)
        : ["ws://localhost:8765", "ws://localhost:8780"];
      h.sync([...new Set(urls)]);
      setPbCount(h.attached.length);
    };
    refreshStations.current = () => { void poll(); };
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => {
      live = false;
      clearInterval(timer);
      h.close();
      link.current = null;
    };
  }, []);

  const attach = () => {
    lastSent.current = "";
    refreshStations.current();
    say("paperboat: looking for running instances…");
  };

  // Every variable is broadcast automatically, once the station's list has loaded.
  useEffect(() => {
    if (status !== "attached" || !pbLoaded || pbCount === 0) return;
    const msg = setMessage(currentVars);
    const payload = JSON.stringify(msg.variables);
    if (payload === lastSent.current) return;
    const timer = setTimeout(() => {
      const n = link.current?.send(msg) ?? 0;
      if (n) {
        lastSent.current = payload;
        const count = msg.variables.length;
        say(`broadcast ${count} variable${count === 1 ? "" : "s"} → ${n} paperboat instance${n === 1 ? "" : "s"}`, "ok");
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [currentVars, status, pbLoaded, pbCount]);

  /** The console is the kernel's REPL: stdout and the value come back from the same session. */
  const consoleEval = (code: string) => tracked(consoleEvalNow(code));
  /** Work that shows in the run strip: busy, its phase from `evaluating`, Cancel. */
  const tracked = <T,>(work: Promise<T>): Promise<T> => {
    const since = performance.now();
    setPhase({ phase: "evaluating", since });
    return busy(work).finally(() => setPhase((p) => (p?.since === since ? null : p)));
  };
  const step = (next: string) => setPhase((p) => (p ? { ...p, phase: next } : p));
  const cancelRun = () => {
    kernel.interrupt();
    say("cancel · stopping the running code", "warn");
  };
  /** The kernel's error, or "cancelled" when Cancel stopped it. */
  const sayError = (error: string | undefined) => {
    if (/^InterruptException/.test(error ?? "")) say("cancelled", "warn");
    else say(error ?? "kernel error", "err");
  };
  const workspaceFilesOverlay = (): Record<string, string> => {
    const overlay: Record<string, string> = {};
    if (dir !== null || serverRoot === null) {
      for (const [path, content] of Object.entries(files)) {
        if (path.endsWith(".jl")) overlay[path] = content;
      }
    } else {
      for (const path of dirty) {
        if (path in files && path.endsWith(".jl")) overlay[path] = files[path];
      }
    }
    return overlay;
  };

  const ensureKernelReady = async (): Promise<KernelInfo | null> => {
    if (kernelMismatch) {
      say(kernelMismatch.message, "err");
      return null;
    }
    if (kernelInfo) return kernelInfo;
    const res = await probeKernelHandshake(60000);
    const info = applyProbe(res);
    if (!info && res.status !== "mismatch") {
      say(kernelUnavailableMessage(res.status === "unavailable" ? res.error : ""), "warn");
    }
    return info;
  };

  const consoleEvalNow = async (code: string) => {
    const info = await ensureKernelReady();
    if (!info) return;
    const startedAt = performance.now();
    const run = createRunToken(editorSource || "console", "console");
    const reply = await evalCode(code, editorSource, workspaceFilesOverlay());
    for (const line of (reply.stdout ?? "").split("\n")) if (line.trim()) say(line);
    // The kernel already applied `clear` between statements; the workspace follows `whos`.
    handleKernelEvents(reply.events);
    if (!reply.ok) {
      sayError(reply.error);
      return;
    }
    if (reply.figures?.length) {
      await addFigures(reply.figures, editorSource || "console", run);
      updateRunDuration(run.id, Math.max(1, Math.round(performance.now() - startedAt)));
    }
    // The kernel prints the value as Julia's REPL would; an older kernel sends only a description.
    if (reply.text !== undefined) {
      if (consoleOpts.echoValues) for (const line of reply.text.split("\n")) if (line.trim()) say(line, "ok");
    }
    const value = reply.value as { type?: string; shape?: string; value?: number | boolean | string; preview?: number[] } | undefined;
    if (consoleOpts.echoValues && reply.text === undefined && value && value.type !== "Nothing") {
      if (value.value !== undefined) {
        say(typeof value.value === "string" ? JSON.stringify(value.value) : String(value.value), "ok");
      } else if (value.preview?.length) {
        const list = value.preview.slice(0, 5).map((n) => String(Number(n.toFixed(3)))).join(", ");
        say(`[${list}${value.preview.length >= 5 ? ", …" : ""}]`, "ok");
      } else {
        say(`${value.type ?? "value"}${value.shape && value.shape !== "—" ? ` · ${value.shape}` : ""}`, "ok");
      }
    }
    const after = await whois();
    if (after.ok && Array.isArray(after.value)) {
      setWorkspace(await withArrays(after.value as WorkspaceVariable[]));
      const assigned = /^\s*([A-Za-z_]\w*)\s*=/.exec(code);
      if (assigned) setSelectedVar(assigned[1]);
    }
  };

  const refreshWatches = async (frameId: number | null, list: readonly WatchEntry[] = watches) => {
    if (list.length === 0 || frameId === null) return;
    const updated = await Promise.all(list.map(async (w) => {
      const reply = await debugEval(frameId, w.expr);
      if (!reply.ok) return { expr: w.expr, error: reply.error ?? "error" };
      const val = reply.value as Record<string, unknown> | undefined;
      return {
        expr: w.expr,
        text: reply.text ?? (val ? formatDebugValue({ name: w.expr, type: String(val.type ?? "Any"), shape: "—", ...val } as DebugLocal) : "nothing"),
        type: typeof val?.type === "string" ? val.type : undefined,
      };
    }));
    setWatches(updated);
  };

  const debugEvalInConsole = async (cmd: string) => {
    if (consoleOpts.echoCommands) say(cmd, "info", true);
    if (activeFrameId === null) return;
    const reply = await debugEval(activeFrameId, cmd);
    for (const ln of (reply.stdout ?? "").split("\n")) if (ln.trim()) say(ln);
    if (!reply.ok) {
      sayError(reply.error);
      return;
    }
    if (reply.text !== undefined && consoleOpts.echoValues) {
      for (const ln of reply.text.split("\n")) if (ln.trim()) say(ln, "ok");
    }
    const localsReply = await debugLocals(activeFrameId);
    if (localsReply.ok) setDebugLocalsList(localsReply.locals ?? []);
    if (watches.length > 0) void refreshWatches(activeFrameId);
  };

  const run = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    if (debugPaused) {
      if (cmd === "clc" || /^clc\s*\(\s*\)$/.test(cmd)) {
        if (consoleOpts.echoCommands) say(cmd, "info", true);
        setLines([]);
        return;
      }
      void debugEvalInConsole(cmd);
      return;
    }
    if (consoleOpts.echoCommands) say(cmd, "info", true);
    const call = /^([A-Za-z_]\w*)\s*\(\s*([^)]*)\s*\)$/.exec(cmd);
    if (call) {
      const arg = call[2].replace(/^["']|["']$/g, "").trim();
      if (call[1] === "clear" || call[1] === "clearvars") {
        if (arg && arg !== "all") clearVar(arg);
        else clearWorkspace();
        return;
      }
      if (call[1] === "clc") { setLines([]); return; }
      if (call[1] === "open_example") {
        const rawArg = call[2].trim();
        if (!rawArg) { openExampleByQuery({ index: 1 }); return; }
        if (/^\d+$/.test(rawArg)) { openExampleByQuery({ index: Number(rawArg) }); return; }
        const lit = /^["']([^"']+)["']$/.exec(rawArg) ?? /^:([A-Za-z_]\w*)$/.exec(rawArg);
        if (lit) { openExampleByQuery({ name: lit[1] }); return; }
      }
    }
    const [head, ...rest] = cmd.split(/\s+/);
    if (head === "clc") { setLines([]); return; }
    if (head === "examples") {
      for (const ex of SHIPPED_EXAMPLES) say(`${String(ex.index).padStart(2)}  ${ex.name.padEnd(28)} ${ex.title}`);
      say('run open_example(1) or open_example("lorenz") to open one', "info");
      return;
    }
    if (head === "open_example") {
      const rawArg = rest.join(" ").trim();
      if (!rawArg) { openExampleByQuery({ index: 1 }); return; }
      if (/^\d+$/.test(rawArg)) { openExampleByQuery({ index: Number(rawArg) }); return; }
      openExampleByQuery({ name: rawArg.replace(/^["':]|["']$/g, "") });
      return;
    }
    if (head === "clear" || head === "clearvars") {
      if (rest[0] && rest[0] !== "all") clearVar(rest[0]);
      else clearWorkspace();
      return;
    }
    if (cmd.startsWith("?")) { setHelpQuery(cmd.slice(1).trim()); return; }
    if ((head === "help" || head === "doc") && (rest.length || head === "doc")) { setHelpQuery(rest.join(" ")); return; }
    if (head === "openvar") { void openVariable(rest[0] ?? selectedVar); return; }
    if (head === "help") {
      say("Julia expressions run in the kernel and print like a REPL; script stdout lands here too.");
      say("help name · doc name · ?name (F1) · examples · open_example(n|\"name\") · openvar name · whos · clear [name] · clc · attach · detach · run · version");
      say("Type \\pi then Tab for π; Arrow Up/Down recall history.");
      return;
    }
    if (head === "whos") {
      for (const r of currentVars) say(`${r.name.padEnd(6)} ${r.shape.padEnd(10)} ${r.type}`);
      for (const [name, fn] of Object.entries(functions)) say(`${name}(${fn.params.join(", ")})  function`);
      return;
    }
    if (head === "attach") { attach(); return; }
    if (head === "detach") {
      link.current?.close();
      setStatus("idle");
      setPbCount(0);
      setPbLoaded(false);
      setPaperboat([]);
      say("paperboat: detached", "warn");
      return;
    }
    if (head === "run") { runScript(); return; }
    if (head === "version") {
      const liveJulia = kernelInfo?.julia ?? JULIA_VERSION;
      const liveImage = formatKernelImage(
        kernelInfo?.image ?? kernelMismatch?.image ?? kernelImageRef(),
        kernelInfo?.image_digest ?? kernelMismatch?.imageDigest ?? KERNEL_DIGEST,
      );
      const liveProto = kernelInfo ? `squero-kernel/${kernelInfo.protocol}` : KERNEL_PROTOCOL;
      say(`julia ${liveJulia} · frontend ${FRONTEND_VERSION} · kernel ${liveImage} · ${liveProto} · ${PAPERBOAT_PROTOCOL}`);
      return;
    }
    void consoleEval(cmd);
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

  /** A card's short type: matrix, vector, or Julia's type name without module or parameters (int64, namedtuple). */
  const typeLabel = (type: string) =>
    type.startsWith("Matrix") ? "matrix" : type.startsWith("Vector") ? "vector" : (type.replace(/\{[\s\S]*$/, "").split(".").pop() ?? type).replace(/^@/, "").toLowerCase();

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

  /** The stored artifacts of one figure version, copied out of the kernel into the history. */
  const fetchArtifacts = async (entry: FigureEntry, formats: readonly FigureFormat[]) => {
    const got: Partial<Record<FigureFormat, Uint8Array>> = {};
    for (const format of formats) {
      if (entry.artifacts[format]) continue;
      const reply = await figureArtifact(entry.figure, entry.version, format, format === "svg" || format === "png");
      if (reply.ok && reply.bytes) got[format] = reply.bytes;
    }
    return got;
  };

  const handleViewStateChange = useCallback((key: string, state: ViewState | null, modified: boolean) => {
    setViewStates((prev) => {
      if (!state || !modified) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      const cur = prev[key];
      if (cur && cur.modified === modified && cur.state === state) return prev;
      return { ...prev, [key]: { state, modified } };
    });
  }, []);

  const saveEntryArtifacts = useCallback((key: string, got: Partial<Record<FigureFormat, Uint8Array>>) => {
    setFigures((prev) => prev.map((one) => (one.key === key ? { ...one, artifacts: { ...one.artifacts, ...got } } : one)));
  }, []);

  /** Update a run's duration on its figures once the run finishes. */
  const updateRunDuration = (runId: string, durationMs: number) => {
    setFigures((prev) => prev.map((one) => (one.run?.id === runId && one.run ? { ...one, run: { ...one.run, durationMs } } : one)));
  };

  /** New history entries for the figures a run (or the optimizer) drew: scene + SVG preview first, then all export formats. */
  const addFigures = async (metas: FigureMeta[], source: string, run?: FigureRun) => {
    for (const meta of metas) if (meta.error) say(`figure ${meta.id}: ${meta.error}`, "warn");
    const fresh = metas.filter((meta) => !meta.error && meta.version).map((meta) => entryFrom(meta, source, Date.now(), run));
    if (fresh.length === 0) return;
    for (const entry of fresh) {
      const [got, scReply] = await Promise.all([
        fetchArtifacts(entry, ["svg"]),
        figureScene(entry.figure, entry.version),
      ]);
      entry.artifacts = got;
      if (got.svg) entry.preview = URL.createObjectURL(new Blob([bufferOf(got.svg)], { type: MIME.svg }));
      if (scReply.ok && scReply.scene) entry.scene = unpackScene(scReply.scene, scReply.bytes);
    }
    setFigures((prev) => addEntries(prev, fresh));
    const shown = fresh[fresh.length - 1].key;
    setActiveFigureId(shown);
    setFigureSel([shown]);
    setFigureAnchor(shown);
    if (run) setSelectedRunId(run.id);
    setFigureFocus(null);
    setChartHidden(false);
    // The rest of the formats, so history exports without the kernel (a reset, a restart).
    for (const entry of fresh) {
      const got = await fetchArtifacts(entry, FIGURE_FORMATS);
      // The thumbnail becomes the PNG: a few KB that always decodes, where the SVG (megabytes for
      // a surface, masks over embedded rasters) can come up blank as a 44 px image.
      const png = got.png ? URL.createObjectURL(new Blob([bufferOf(got.png)], { type: MIME.png })) : undefined;
      setFigures((prev) => prev.map((one) => {
        if (one.key !== entry.key) return one;
        if (png && one.preview) URL.revokeObjectURL(one.preview);
        return { ...one, artifacts: { ...one.artifacts, ...got }, ...(png ? { preview: png } : {}) };
      }));
    }
  };

  const dropPreviews = (gone: FigureEntry[]) => {
    for (const entry of gone) if (entry.preview) URL.revokeObjectURL(entry.preview);
  };

  const removeFigure = (id: string) => {
    const next = figures.filter((f) => f.key !== id);
    dropPreviews(figures.filter((f) => f.key === id));
    setFigures(next);
    setFigureSel((prev) => prev.filter((one) => one !== id));
    setViewStates((prev) => {
      if (!(id in prev)) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    if (activeFigureId === id) setActiveFigureId(next[0]?.key ?? null);
    setFigureAnchor(null);
  };

  const removeSelectedFigures = () => {
    if (figureSel.length === 0) return;
    const gone = new Set(figureSel);
    const next = figures.filter((f) => !gone.has(f.key));
    dropPreviews(figures.filter((f) => gone.has(f.key)));
    setFigures(next);
    setFigureSel([]);
    setViewStates((prev) => {
      const copy = { ...prev };
      let changed = false;
      for (const k of gone) {
        if (k in copy) { delete copy[k]; changed = true; }
      }
      return changed ? copy : prev;
    });
    setFigureAnchor(null);
    if (activeFigureId && gone.has(activeFigureId)) setActiveFigureId(next[0]?.key ?? null);
    say(`closed ${gone.size} figure${gone.size === 1 ? "" : "s"}`, "warn");
  };

  const clearFigures = () => {
    if (figures.length === 0) return;
    dropPreviews(figures);
    setFigures([]);
    setFigureSel([]);
    setViewStates({});
    setFigureAnchor(null);
    setActiveFigureId(null);
    setFigureFocus(null);
    say(`cleared ${figures.length} figure${figures.length === 1 ? "" : "s"}`, "warn");
  };

  const selectFigure = (id: string, additive: boolean, range: boolean) => {
    setChartHidden(false);
    if (range) {
      const from = figureAnchor ?? activeFigureId ?? id;
      const a = figures.findIndex((f) => f.key === from);
      const b = figures.findIndex((f) => f.key === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setFigureSel(figures.slice(lo, hi + 1).map((f) => f.key));
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

  const selectedExportEntries = useMemo(() => {
    const ids = figureSel.length ? figureSel : activeFigureId ? [activeFigureId] : [];
    return ids.map((id) => figures.find((f) => f.key === id)).filter((f): f is FigureEntry => !!f);
  }, [activeFigureId, figureSel, figures]);

  const figureGroups = useMemo(() => groupFiguresByRun(figures), [figures]);
  const activeRunId = useMemo(() => {
    if (selectedRunId && figures.some((f) => f.run?.id === selectedRunId)) return selectedRunId;
    return activeFigureId ? (figures.find((f) => f.key === activeFigureId)?.run?.id ?? null) : null;
  }, [activeFigureId, figures, selectedRunId]);
  const runExportEntries = useMemo(
    () => (activeRunId ? latestRunFigures(figures, activeRunId) : []),
    [figures, activeRunId],
  );

  /** Open the Export preview dialog (defaults to scripted framing & script size). */
  const exportFigures = () => {
    if (selectedExportEntries.length === 0) return;
    setExportEntriesOverride(null);
    setExportOpen(true);
  };

  const exportRunFigures = () => {
    if (runExportEntries.length === 0) return;
    setExportEntriesOverride(runExportEntries);
    setExportOpen(true);
  };

  /** `→ figure` in the editor: show the figure that line drew into. */
  const focusLine = (line: number) => {
    const match = entryForLine(figures, editorSource, line);
    if (!match) { say("run the script to create this figure", "warn"); return; }
    setActiveFigureId(match.key);
    setFigureSel([match.key]);
    setFigureAnchor(match.key);
    setFigureFocus(match.key);
    setChartHidden(false);
    say(`figure → ${entryLabel(match)}`, "ok");
  };

  const showKernel = () => { setKernelSeen(true); setRightTab("kernel"); setRightHidden(false); };

  /** A fresh session: the launcher removes this kernel; the probe starts the next one. */
  const restartKernel = async () => {
    kernel.restart();
    setKernelInfo(null);
    setKernelMismatch(null);
    setKernelProbed(false);
    setWorkspace([]);
    setFunctions({});
    setSelectedVar("");
    say("kernel · restarting, every variable is cleared", "warn");
    const info = applyProbe(await probeKernelHandshake(60000));
    if (info) say(`kernel · restarted · julia ${info.julia}`, "ok");
    else say(kernelUnavailableMessage(""), "warn");
  };

  const clearWorkspace = () => {
    setWorkspace([]);
    setFunctions({});
    setSelectedVar("");
    if (kernelInfo) void resetKernel();
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

  /**
   * The kernel path: Julia evaluates the script; SqueroPlot draws its figures and the kernel stores
   * the changed ones; SqueroBase queues problems and runs, which Paperboat solves and simulates.
   * Nothing here parses the source, draws or solves.
   */
  const runCodeViaKernel = (code: string, mode: "cell" | "line" | "selection" | "file") => tracked(runCodeViaKernelNow(code, mode));
  const runCodeViaKernelNow = async (code: string, mode: "cell" | "line" | "selection" | "file") => {
    const startedAt = performance.now();
    const source = editorSource;
    const runToken = createRunToken(source, mode);
    const count = code.split("\n").filter((line) => line.trim()).length;
    say(mode === "file" ? `run ${source || "script"}` : `run ${mode} · ${count} line${count === 1 ? "" : "s"}`, "info");
    const reply = await evalCode(code, source, workspaceFilesOverlay());
    for (const line of (reply.stdout ?? "").split("\n")) {
      if (line.trim()) say(line);
    }
    // The kernel already applied `clear` between statements; the workspace follows `whos`.
    // Neither `clear` nor `clc` touches the figure history.
    handleKernelEvents(reply.events);
    if (!reply.ok) sayError(reply.error);

    if (reply.figures?.length) {
      step("plotting");
      await addFigures(reply.figures, source, runToken);
    }

    let results: WorkspaceVariable[] = [];
    for (const problem of reply.problems ?? []) {
      step("solving");
      const solved = await solveProblem(problem);
      for (const line of solved.trace ?? []) say(line);
      if (!solved.ok) {
        say(solved.error ?? "optimization failed", "warn");
        continue;
      }
      const values = (solved.x ?? []).map((value) => value.toFixed(4)).join(", ");
      const level = solved.status === "solved" ? "ok" : "warn";
      say(`optimization: ${solved.kind} ${solved.status} · objective ${(solved.objective ?? 0).toFixed(6)} · x = [${values}]`, level);
      if (solved.x?.length) results = [variableFrom("x_opt", solved.x), variableFrom("f_opt", solved.objective ?? 0)];
      if (solved.x?.length === 2 && solved.grid) {
        // A normal SqueroPlot 3D surface with the optimum marked, registered in the history.
        const drawn = await plotOptimum(solved, `${solved.kind ?? "opt"} optimum (${solved.x.map((v) => v.toFixed(3)).join(", ")})`);
        if (drawn.ok && drawn.figure) await addFigures([drawn.figure], source, runToken);
        else say(drawn.error ?? "could not draw the optimum", "warn");
      }
    }

    // Simulation requests go to every attached Paperboat station; the run happens there.
    for (const simReq of reply.runs ?? []) {
      const msg = simReq as Extract<ClientMsg, { type: "graph.run" }>;
      simSourceRef.current = source;
      simTitleRef.current = `Simulation (${baseName(source)})`;
      simRunRef.current = runToken;
      simStartedAtRef.current = performance.now();
      const target = link.current?.runGraph(msg) ?? null;
      say(target ? `simulate → ${target}` : "simulate: no Paperboat station is attached", target ? "ok" : "warn");
    }

    step("reading the workspace");
    const after = await whois();
    if (after.ok && Array.isArray(after.value)) {
      const variables = (await withArrays(after.value as WorkspaceVariable[])).map((one) => ({
        name: one.name, shape: one.shape, type: one.type, value: one.value, preview: one.preview,
      }));
      const solved = new Set(results.map((one) => one.name));
      setWorkspace([...variables.filter((one) => !solved.has(one.name)), ...results]);
    } else if (results.length) {
      setWorkspace((prev) => [...prev.filter((one) => !results.some((next) => next.name === one.name)), ...results]);
    }

    const ms = Math.max(1, Math.round(performance.now() - startedAt));
    updateRunDuration(runToken.id, ms);
    setLastRun({ time: Date.now(), ms, lines: count, mode });
  };

  const runCode = (code: string, mode: "cell" | "line" | "selection" | "file") => {
    if (kernelMismatch) {
      say(kernelMismatch.message, "err");
      return;
    }
    if (kernelInfo) {
      void runCodeViaKernel(code, mode);
      return;
    }
    // The first probe may still be starting Julia; wait for it before giving up.
    void ensureKernelReady().then((info) => {
      if (!info) return;
      void runCodeViaKernel(code, mode);
    });
  };

  const runScript = () => runCode(editorCode, "file");

  debugEventRef.current = (event) => {
    if (event.event === "debug.resumed") {
      setDebugPaused(false);
      setPhase((p) => ({ phase: "debugging", since: p?.since ?? performance.now() }));
      return;
    }
    if (event.event === "debug.stopped") {
      const frames = event.frames ?? [];
      const top = frames[0] ?? null;
      const file = event.file || top?.file || debugSourceRef.current;
      const line = event.line ?? top?.line ?? null;
      const frameId = top?.id ?? null;
      setDebugActive(true);
      setDebugPaused(true);
      setDebugFrames(frames);
      setActiveFrameId(frameId);
      setDebugLocalsList(event.locals ?? []);
      setDebugFile(file);
      setDebugLine(line);
      setPhase((p) => ({ phase: "paused", since: p?.since ?? performance.now() }));
      if (file && file in files) {
        setOpenExampleId(null);
        setSelectedFile(file);
      }
      for (const ln of (event.stdout ?? "").split("\n")) if (ln.trim()) say(ln);
      if (event.figures?.length) void addFigures(event.figures, debugSourceRef.current || file, debugRunRef.current ?? undefined);
      if (frameId !== null && watches.length > 0) void refreshWatches(frameId, watches);
      return;
    }
    if (event.event === "debug.terminated") {
      debugSessionDoneRef.current = true;
      const startedAt = debugStartedAtRef.current;
      debugStartedAtRef.current = null;
      const dbgRun = debugRunRef.current;
      debugRunRef.current = null;
      setDebugActive(false);
      setDebugPaused(false);
      setDebugLastOutcome(event.stopped ? "stopped" : event.ok ? "finished" : "error");
      setPhase(null);
      for (const ln of (event.stdout ?? "").split("\n")) if (ln.trim()) say(ln);
      handleKernelEvents(event.events);
      if (event.stopped) say("debug · stopped", "warn");
      else if (!event.ok && event.error) sayError(event.error);
      void (async () => {
        const source = debugSourceRef.current || editorSource;
        if (event.figures?.length) await addFigures(event.figures, source, dbgRun ?? undefined);
        const after = await whois();
        if (after.ok && Array.isArray(after.value)) {
          const variables = (await withArrays(after.value as WorkspaceVariable[])).map((one) => ({
            name: one.name, shape: one.shape, type: one.type, value: one.value, preview: one.preview,
          }));
          setWorkspace(variables);
        }
        if (startedAt !== null) {
          const ms = Math.max(1, Math.round(performance.now() - startedAt));
          if (dbgRun) updateRunDuration(dbgRun.id, ms);
          const count = (files[source] ?? editorCode).split("\n").filter((l) => l.trim()).length;
          setLastRun({ time: Date.now(), ms, lines: count, mode: "debug" });
        }
      })();
    }
  };

  const syncFileBreakpoints = (file: string, list: readonly BreakpointSpec[]) => {
    if (!kernelInfo || !file) return;
    void setKernelBreakpoints(file, [...list]);
  };

  const toggleBreakpoint = (file: string, line: number) => {
    if (!file || line < 1) return;
    setBreakpoints((prev) => {
      const next = toggleBreakpointList(prev, file, line);
      syncFileBreakpoints(file, next[file] ?? []);
      return next;
    });
  };

  const toggleBpEnabled = (file: string, line: number, enabled: boolean) => {
    setBreakpoints((prev) => {
      const next = setBreakpointEnabled(prev, file, line, enabled);
      syncFileBreakpoints(file, next[file] ?? []);
      return next;
    });
  };

  const editBpCondition = (file: string, line: number, condition: string) => {
    setBreakpoints((prev) => {
      const next = setBreakpointCondition(prev, file, line, condition);
      syncFileBreakpoints(file, next[file] ?? []);
      return next;
    });
  };

  const deleteBp = (file: string, line: number) => {
    setBreakpoints((prev) => {
      const next = removeBreakpoint(prev, file, line);
      syncFileBreakpoints(file, next[file] ?? []);
      return next;
    });
  };

  const jumpToBp = (file: string, _line: number) => {
    if (file in files) {
      setOpenExampleId(null);
      setSelectedFile(file);
      return;
    }
    if (file.startsWith("examples/")) {
      const path = file.slice("examples/".length);
      const ex = SHIPPED_EXAMPLES.find((one) => one.path === path);
      if (ex) setOpenExampleId(ex.id);
    }
  };

  const startDebugging = async () => {
    if (!editorFile || debugActive) return;
    if (kernelMismatch) {
      say(kernelMismatch.message, "err");
      return;
    }
    const startedAt = performance.now();
    const source = editorSource;
    const code = editorCode;
    debugSourceRef.current = source;
    debugStartedAtRef.current = startedAt;
    debugSessionDoneRef.current = false;
    debugRunRef.current = createRunToken(source, "debug");
    setDebugFile(source);
    setDebugLine(null);
    setDebugFrames([]);
    setActiveFrameId(null);
    setDebugLocalsList([]);
    setDebugLastOutcome(null);
    setWatches((prev) => prev.map((w) => ({ expr: w.expr })));
    setRightHidden(false);
    setRightTab("debug");
    setPhase({ phase: "debugging", since: startedAt });
    const reply = await busy((async () => {
      const info = await ensureKernelReady();
      if (!info) return null;
      say(`debug ${source || "script"}`, "info");
      await Promise.all(
        Object.entries(breakpoints)
          .filter(([f]) => f !== source)
          .map(([f, list]) => setKernelBreakpoints(f, list)),
      );
      const fileBps = breakpoints[source] ?? [];
      return debugStart(source, code, fileBps, fileBps.length === 0, workspaceFilesOverlay());
    })());
    if (!reply) {
      debugStartedAtRef.current = null;
      debugRunRef.current = null;
      setPhase(null);
      return;
    }
    if (!reply.ok) {
      debugStartedAtRef.current = null;
      setPhase(null);
      sayError(reply.error);
      return;
    }
    if (!debugSessionDoneRef.current) setDebugActive(true);
  };

  const stopDebugging = () => {
    if (!debugActive) return;
    void debugStop();
  };

  const selectDebugFrame = async (frameId: number) => {
    setActiveFrameId(frameId);
    const frame = debugFrames.find((f) => f.id === frameId);
    if (frame) {
      if (frame.file && frame.file in files) {
        setOpenExampleId(null);
        setSelectedFile(frame.file);
      }
      setDebugFile(frame.file);
      setDebugLine(frame.line);
    }
    if (!debugActive) return;
    const reply = await debugLocals(frameId);
    if (reply.ok) setDebugLocalsList(reply.locals ?? []);
    if (watches.length > 0) void refreshWatches(frameId);
  };

  const addWatch = (expr: string) => {
    const trimmed = expr.trim();
    if (!trimmed) return;
    const next = watches.some((w) => w.expr === trimmed) ? watches : [...watches, { expr: trimmed }];
    setWatches(next);
    if (debugPaused && activeFrameId !== null) void refreshWatches(activeFrameId, next);
  };

  const removeWatch = (expr: string) => {
    setWatches((prev) => prev.filter((w) => w.expr !== expr));
  };

  const allBreakpoints = useMemo(() => flattenBreakpoints(breakpoints), [breakpoints]);
  const activeDebugFrame = useMemo(
    () => debugFrames.find((f) => f.id === activeFrameId) ?? debugFrames[0] ?? null,
    [debugFrames, activeFrameId],
  );
  const scriptDebugControls: ScriptDebugControls = {
    active: debugActive,
    paused: debugPaused,
    line: debugFile === editorSource ? debugLine : null,
    fnName: activeDebugFrame?.name,
    onContinue: () => void debugContinue(),
    onStepOver: () => void debugStep("over"),
    onStepInto: () => void debugStep("into"),
    onStepOut: () => void debugStep("out"),
    onPause: () => void debugPause(),
    onStop: stopDebugging,
  };

  const copyExampleToWorkspace = async (example: ShippedExample) => {
    let target = example.name;
    const stem = example.name.replace(/\.jl$/i, "");
    let i = 1;
    while (target in files) {
      target = i === 1 ? `${stem}-copy.jl` : `${stem}-copy-${i}.jl`;
      i++;
    }
    setFiles((prev) => ({ ...prev, [target]: example.content }));
    setOpenExampleId(null);
    setSelectedFile(target);
    if (storage) {
      try {
        await storage.write(target, example.content);
        say(`copied ${example.name} → ${target}`, "ok");
      } catch (error) {
        setDirty((prev) => new Set(prev).add(target));
        say(`disk: ${error instanceof Error ? error.message : String(error)}`, "warn");
      }
    } else {
      setDirty((prev) => new Set(prev).add(target));
      say(`copied ${example.name} → ${target} (open a folder to save)`, "ok");
    }
  };

  const applyServerTree = (tree: ServerWorkspace, restored = true) => {
    setDir(null);
    setServerRoot(tree.root);
    setReadOnly(false);
    setWorkspaceRoot(tree.root);
    setFiles(tree.files);
    setFolders(tree.folders);
    setSelectedFile(Object.keys(tree.files).sort()[0] ?? "");
    setDirty(new Set());
    say(`${restored ? "synced" : "opened"} ${tree.root} · ${Object.keys(tree.files).length} file${Object.keys(tree.files).length === 1 ? "" : "s"}`, "ok");
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
    say(`${restored ? "restored" : "opened"} ${handle.name} · ${Object.keys(tree.files).length} file${Object.keys(tree.files).length === 1 ? "" : "s"}`, "ok");
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
    if (openExample) {
      say("shipped examples are read-only; use Copy to workspace to edit", "warn");
      return;
    }
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

  /** A number, vector or matrix into the kernel's session, shaped as it is here. */
  const putVariable = (name: string, value: ImportValue) => {
    if (typeof value === "number") return setArray(name, 1, 1, [value]);
    if (!Array.isArray(value[0])) return setArray(name, value.length, 1, value as number[], true);
    const m = value as number[][];
    const rows = m.length, cols = m[0]?.length ?? 0;
    const data = new Float64Array(rows * cols);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) data[c * rows + r] = m[r][c] ?? 0;
    return setArray(name, rows, cols, data, false);
  };

  /** Variables in, from an import or the editor: into the kernel when there is one, the workspace either way. */
  const putVariables = async (vars: { name: string; value: ImportValue }[]) => {
    if (kernelInfo) {
      for (const v of vars) {
        const reply = await putVariable(v.name, v.value);
        if (!reply.ok) { say(`${v.name}: ${reply.error ?? "the kernel refused it"}`, "err"); return false; }
      }
    }
    const next = vars.map((v) => variableFrom(v.name, v.value));
    setWorkspace((prev) => [...prev.filter((one) => !next.some((n) => n.name === one.name)), ...next]);
    return true;
  };

  const readImport = async (file: File) => {
    try {
      const data = await importFile(file.name, new Uint8Array(await file.arrayBuffer()));
      // Julia's own names (time, angle, sum…) stay functions: a column by that name gets a `_`.
      const names = kernelInfo ? await docNames() : null;
      const reserved = new Set(Array.isArray(names?.value) ? (names.value as { name: string; module: string }[]).filter((n) => n.module !== "workspace").map((n) => n.name) : []);
      setImporting({ file: file.name, data, reserved });
    } catch (error) {
      say(`import ${file.name}: ${(error as Error).message}`, "err");
    }
  };

  const applyImport = async (vars: { name: string; value: ImportValue }[]) => {
    const file = importing?.file ?? "file";
    setImporting(null);
    if (await putVariables(vars)) {
      say(`imported ${file} → ${vars.map((v) => v.name).join(", ")}`, "ok");
      setSelectedVar(vars[0]?.name ?? "");
      setRightTab("workspace");
    }
  };

  /** Open a numeric variable in the editor, with its whole value from the kernel. */
  const openVariable = async (name: string) => {
    const v = workspace.find((one) => one.name === name);
    if (!name || !v) { say(name ? `${name} is not in the workspace` : "select a variable first", "warn"); return; }
    let value: ImportValue | undefined = typeof v.value === "number" ? v.value : undefined;
    if (value === undefined && (v.type.startsWith("Vector") || v.type.startsWith("Matrix"))) {
      if (kernelInfo) {
        const reply = await kernel.request({ op: "get", name });
        const { array, data } = reply;
        if (reply.ok && array && data) {
          value = v.type.startsWith("Vector") ? Array.from(data)
            : Array.from({ length: array.rows }, (_, r) => Array.from({ length: array.cols }, (_, c) => data[c * array.rows + r]));
        }
      } else if (Array.isArray(v.value)) value = v.value as number[] | number[][];
    }
    if (value === undefined) { say(`${name} is ${v.type}: the editor opens numbers, vectors and matrices`, "warn"); return; }
    setSelectedVar(name);
    setEditing({ name, type: v.type, value });
  };

  const exportWorkspace = () => {
    const name = editorFile.replace(/\.jl$/, "") || "workspace";
    const ok = downloadMat(workspace, `${name}.mat`);
    say(ok ? `exported ${name}.mat · ${workspace.length} variables` : "workspace is empty", ok ? "ok" : "warn");
  };

  useEffect(() => {
    if (!currentVars.some((v) => v.name === selectedVar)) setSelectedVar(currentVars[0]?.name ?? "");
  }, [currentVars, selectedVar]);

  const activeFigure = figures.find((f) => f.key === activeFigureId) ?? figures[0] ?? null;
  const shownVars = rows.filter((r) => r.source === "mx" && `${r.name} ${r.shape} ${r.type}`.toLowerCase().includes(varQuery.toLowerCase()));

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
      // Ctrl+C stops a run, as in MATLAB, unless there is text to copy.
      else if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "c" && runningNow.current && !window.getSelection()?.toString()) { e.preventDefault(); cancelRun(); }
      else if (debugActive) {
        if (e.key === "F5" && e.shiftKey) { e.preventDefault(); stopDebugging(); }
        else if (e.key === "F5" && debugPaused) { e.preventDefault(); void debugContinue(); }
        else if (e.key === "F10" && debugPaused) { e.preventDefault(); void debugStep("over"); }
        else if (e.key === "F11" && e.shiftKey && debugPaused) { e.preventDefault(); void debugStep("out"); }
        else if (e.key === "F11" && !e.shiftKey && debugPaused) { e.preventDefault(); void debugStep("into"); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dir, selectedFile, files, openExampleId, debugActive, debugPaused]);

  const isBusy = running > 0 || (debugActive && !debugPaused) || simRunning;
  const stopAction = debugActive ? stopDebugging : kernelInfo ? cancelRun : undefined;

  const pausedAnswerLocals = useMemo<AnswerVariable[] | undefined>(() => {
    if (!debugPaused || debugLocalsList.length === 0) return undefined;
    return debugLocalsList.map((l) => ({
      name: l.name,
      type: l.type,
      shape: l.shape,
      preview: Array.isArray(l.preview) ? l.preview.map(Number) : undefined,
      value: typeof l.value === "number" || typeof l.value === "boolean" || typeof l.value === "string" || Array.isArray(l.value)
        ? (l.value as AnswerVariable["value"])
        : undefined,
    }));
  }, [debugPaused, debugLocalsList]);

  const simModel = useMemo(() => detectSimModel(workspace), [workspace]);
  const simWhyNot = simRunning
    ? "A simulation run is already in progress"
    : pbCount === 0
    ? "Attach a Paperboat station"
    : !simModel
    ? "Define A, B, C, D (or f) in the workspace"
    : simModel.kind === "state_space" && pbCaps.hasGraph && !pbCaps.hasStateSpace
    ? "Attached station lacks state_space block"
    : simModel.kind === "rhs" && pbCaps.hasGraph && !pbCaps.hasRhs
    ? "Attached station lacks rhs block"
    : undefined;

  const runPaperboatSimulation = () => {
    if (!simModel || simWhyNot) return;
    const req = simModel.kind === "state_space"
      ? stateSpaceRunRequest({ model: simModel.model, solver: simSolver, step: simDt, duration: simDuration })
      : rhsRunRequest({ f: simModel.f, x0: simModel.x0, solver: simSolver, step: simDt, duration: simDuration });
    const source = editorSource || "simulation";
    simSourceRef.current = source;
    simTitleRef.current = simModel.kind === "state_space" ? "State-space simulation" : "ODE simulation";
    simRunRef.current = createRunToken(source, "simulate");
    simStartedAtRef.current = performance.now();
    const target = link.current?.runGraph(req) ?? null;
    if (target) {
      setSimRunning(true);
      setSimProgress(0);
      setSimStatusText(undefined);
      say(`simulate ${simModel.label} (${simSolver}, dt=${simDt}, T=${simDuration}) → ${target}`, "info");
    } else {
      say("simulate: no Paperboat station is attached", "warn");
    }
  };

  const cancelPaperboatSimulation = () => {
    const n = link.current?.cancelRun() ?? 0;
    if (n) say("paperboat: cancelling run", "warn");
  };

  const commands: Command[] = [
    { id: "new-script", label: "New script…", menu: "file", group: "new", run: () => filePanel.current?.newFile() },
    { id: "new-folder", label: "New folder…", menu: "file", group: "new", run: () => filePanel.current?.newFolder() },
    { id: "open-folder", label: "Open workspace folder…", menu: "file", group: "workspace", run: () => void openFolder() },
    { id: "save", label: "Save", menu: "file", group: "workspace", shortcut: "Ctrl+S", run: () => void saveCurrent(), enabled: !openExample && dirty.has(selectedFile) && dir !== null, why: openExample ? "example is read-only" : dir ? "no unsaved changes" : "open a folder first" },
    { id: "import", label: "Import data…", menu: "file", group: "workspace", run: () => importInput.current?.click() },
    { id: "export", label: "Export workspace (.mat)…", menu: "file", group: "workspace", run: exportWorkspace, enabled: workspace.length > 0, why: "the workspace is empty" },
    { id: "attach", label: "Find Paperboat stations", menu: "file", group: "connect", run: attach },
    { id: "find", label: "Find variables…", menu: "edit", group: "find", run: () => { setRightTab("workspace"); requestAnimationFrame(() => searchRef.current?.focus()); } },
    { id: "open-variable", label: "Open variable", menu: "edit", group: "find", run: () => void openVariable(selectedVar), enabled: !!selectedVar, why: "select a variable first" },
    { id: "clear-workspace", label: "Clear workspace", menu: "edit", group: "console", run: clearWorkspace },
    { id: "clear-figures", label: "Clear figures", menu: "edit", group: "figures", run: clearFigures, enabled: figures.length > 0, why: "no figures" },
    { id: "clear-console", label: "Clear console", menu: "edit", group: "console", run: () => setLines([]) },
    { id: "chart", label: "Chart", menu: "view", group: "panels", checked: !chartHidden, run: () => setChartHidden((v) => !v) },
    { id: "files-panel", label: "Files panel", menu: "view", group: "panels", checked: !filesHidden, run: () => setFilesHidden((v) => !v) },
    { id: "workspace-panel", label: "Workspace panel", menu: "view", group: "panels", checked: !rightHidden, run: () => setRightHidden((v) => !v) },
    { id: "workspace-tab", label: "Workspace tab", menu: "view", group: "panels", checked: rightTab === "workspace", run: () => setRightTab("workspace") },
    { id: "debug-tab", label: "Debug tab", menu: "view", group: "panels", checked: rightTab === "debug", run: () => setRightTab("debug") },
    { id: "figures-tab", label: "Figures", menu: "view", group: "panels", checked: rightTab === "figures", run: () => setRightTab("figures") },
    { id: "console", label: "Console", menu: "view", group: "panels", checked: !consoleHidden, run: () => setConsoleHidden((v) => !v) },
    { id: "kernel-panel", label: "Kernel and packages", menu: "view", group: "panels", checked: rightTab === "kernel", run: showKernel },
    { id: "kernel-restart", label: "Restart kernel", menu: "run", group: "kernel", run: () => void restartKernel() },
    { id: "run", label: "Run script", menu: "run", group: "run", run: runScript },
    { id: "debug-start", label: debugActive ? "Stop debugging" : "Start debugging", menu: "run", group: "debug", run: () => { if (debugActive) stopDebugging(); else void startDebugging(); } },
    { id: "cancel", label: "Cancel run", menu: "run", group: "run", shortcut: "Ctrl+C", run: debugActive ? stopDebugging : cancelRun, enabled: isBusy, why: "nothing is running" },
    helpCommand(() => setHelpQuery(wordAtCaret())),
    { id: "about", label: "About Squero Studio", menu: "view", group: "about", run: () => setAboutOpen(true) },
  ];
  useShortcuts(commands);

  return (
    <div className={`app split${chartHidden ? " chart-hidden" : ""}${consoleHidden ? " console-hidden" : ""}${filesHidden ? " files-hidden" : ""}${rightHidden ? " right-hidden" : ""}`} style={{ "--stage-w": `${stageW}px`, "--console-h": `${consoleH}px` } as CSSProperties}>
      <AppBar
        className="topbar"
        brand={<SqueroWordmark product="MX" name="MX" running={isBusy} />}
        commands={commands}
        about={{ title: "About Squero Studio", shown: aboutOpen, onOpen: () => setAboutOpen(true) }}
        help={{ shown: helpQuery !== null, onOpen: () => setHelpQuery("") }}
        project={{ name: editorFile, dirty: !openExample && dirty.has(selectedFile), what: openExample ? "example" : "file", onRename: openExample ? undefined : (name) => filePanel.current?.rename(selectedFile, baseName(name)) }}
      >
        <BarEnd
          panel={{ open: !chartHidden, label: "Figures pane", onToggle: () => setChartHidden((v) => !v) }}
          status={<>
            <StatusPill
              label={status === "attached" ? `paperboat · ${pbCount} attached` : status === "connecting" ? "paperboat · connecting" : "paperboat · not attached"}
              labels={[`paperboat · ${pbCount} attached`, "paperboat · connecting", "paperboat · not attached"]}
              tone={status === "attached" ? "ok" : status === "failed" ? "bad" : "busy"}
              title="Paperboat stations found by the launcher"
            />
            <StatusPill
              label={kernelInfo ? `julia ${kernelInfo.julia} · kernel` : kernelMismatch ? "julia · mismatch" : kernelProbed ? "julia · unavailable" : "julia · starting"}
              labels={[`julia ${kernelInfo?.julia ?? JULIA_VERSION} · kernel`, "julia · mismatch", "julia · unavailable", "julia · starting"]}
              tone={kernelInfo ? "ok" : (kernelMismatch || kernelProbed) ? "bad" : "busy"}
              title={kernelMismatch ? kernelMismatch.message : "Kernel, Julia versions and packages"}
              onClick={showKernel}
            />
          </>}
          theme={themeChoice}
          onTheme={setThemeChoice}
        />
      </AppBar>

      <FilePanel
        ref={filePanel}
        root={workspaceRoot}
        files={files}
        folders={folders}
        gitMarks={gitMarks}
        active={openExample ? "" : selectedFile}
        onOpen={(path) => { setOpenExampleId(null); setSelectedFile(path); }}
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
        running={isBusy}
        runStatus={phase && <RunStatus phase={phase.phase} since={phase.since} onCancel={stopAction} />}
        onCancel={stopAction}
        file={editorFile}
        code={editorCode}
        readOnly={editorReadOnly}
        onChange={(code) => {
          if (openExample) return;
          setFiles((prev) => ({ ...prev, [selectedFile]: code }));
          setDirty((prev) => new Set(prev).add(selectedFile));
        }}
        onRun={runScript}
        dirty={!openExample && dirty.has(selectedFile)}
        onSave={() => void saveCurrent()}
        onCopyToWorkspace={openExample ? () => void copyExampleToWorkspace(openExample) : undefined}
        settings={editor}
        onSettings={setEditor}
        configFile={configFile}
        appTheme={appTheme}
        variables={workspace}
        debugLocals={pausedAnswerLocals}
        functions={functions}
        onFigure={focusLine}
        onRunSelection={runCode}
        lastRun={lastRun}
        base={openExample ? null : (git?.head[selectedFile] ?? null)}
        breakpoints={breakpoints[editorSource] ?? []}
        onToggleBreakpoint={(line) => toggleBreakpoint(editorSource, line)}
        debug={scriptDebugControls}
      />

      <div
        className="splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the chart"
        title="Drag to resize · double-click to reset"
        onPointerDown={startResize}
        onDoubleClick={() => setStageW(defaultStageW())}
      />

      <main className="stage">
        <div className="tabs">
          <b>{activeFigure ? entryLabel(activeFigure) : "figures"}</b>
          <span className="tag">
            {activeFigure
              ? `${baseName(activeFigure.source)} · ${timeOf(activeFigure.time)} · ${activeFigure.width}×${activeFigure.height} · ${activeFigure.plots} plot${activeFigure.plots === 1 ? "" : "s"}`
              : "run a script or open a figure"}
          </span>
          {activeFigure && viewStates[activeFigure.key]?.modified ? (
            <>
              <span className="tag stage-mod">modified</span>
              <button
                type="button"
                className="key small stage-btn"
                onClick={() => setResetSeq((n) => n + 1)}
                title="Reset interactive stage back to scripted view"
              >
                Reset view
              </button>
            </>
          ) : null}
          <span className="sp" />
          {activeFigure ? (
            <button
              type="button"
              className="key small stage-btn"
              onClick={exportFigures}
              title="Export figure with preview (SVG, PDF, EPS, PNG, HTML)"
            >
              Export…
            </button>
          ) : null}
          <button
            className="key small stage-hide"
            onClick={() => (activeFigure ? removeFigure(activeFigure.key) : setChartHidden(true))}
            title={activeFigure ? "Close figure" : "Hide chart"}
            aria-label={activeFigure ? "Close figure" : "Hide chart"}
          >
            ×
          </button>
        </div>
        <div className={`stage-body${activeFigure ? "" : " empty"}`}>
          {activeFigure ? (
            <div className={`figure-stage-wrap${figureFocus === activeFigure.key ? " focus" : ""}`}>
              <FigureView entry={activeFigure} resetSeq={resetSeq} onViewStateChange={handleViewStateChange} />
            </div>
          ) : (
            <div className="stage-empty">
              <p>No figure yet.</p>
              <span>Run a script that makes a <span className="mono">Figure</span> (SqueroPlot), or define <span className="mono">A, B, C, D</span> (or <span className="mono">f</span>) to simulate them in Paperboat.</span>
            </div>
          )}
        </div>
        {/* Below the figure, never over it, and only when there is a model to simulate. */}
        {(simModel || simRunning) && (
          <SimRunDock
            canRun={!simWhyNot}
            whyNot={simWhyNot}
            running={simRunning}
            progress={simProgress}
            statusText={simStatusText}
            solvers={pbCaps.solvers}
            solver={simSolver}
            step={simDt}
            duration={simDuration}
            modelLabel={simModel?.label ?? null}
            onSolver={setSimSolver}
            onStep={setSimDt}
            onDuration={setSimDuration}
            onRun={runPaperboatSimulation}
            onCancel={cancelPaperboatSimulation}
          />
        )}
      </main>

      <aside className="panel rightpane">
        <div className="head">
          <div className="rtabs" role="tablist" aria-label="Workspace views">
            <GlideBrackets />
            <button role="tab" aria-selected={rightTab === "workspace"} className={`opt${rightTab === "workspace" ? " on" : ""}`} onClick={() => setRightTab("workspace")}>workspace</button>
            <button role="tab" aria-selected={rightTab === "debug"} className={`opt${rightTab === "debug" ? " on" : ""}`} onClick={() => setRightTab("debug")}>debug</button>
            <button role="tab" aria-selected={rightTab === "figures"} className={`opt${rightTab === "figures" ? " on" : ""}`} onClick={() => setRightTab("figures")}>figures</button>
            <button role="tab" aria-selected={rightTab === "kernel"} className={`opt${rightTab === "kernel" ? " on" : ""}`} onClick={showKernel}>kernel</button>
          </div>
          <span className="sp" />
          <button type="button" className="panel-toggle" onClick={() => setRightHidden(true)} title="Hide workspace" aria-label="Hide workspace" aria-expanded={!rightHidden}>
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3l4 4-4 4" /></svg>
          </button>
        </div>

        {rightTab === "workspace" ? (
          <div
            className="tabbody"
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
            onDrop={(e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); void readImport(f); } }}
          >
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
                  title="Double-click to edit"
                  onClick={() => setSelectedVar(v.name)}
                  onDoubleClick={() => void openVariable(v.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void openVariable(v.name); }
                    else if (e.key === " ") { e.preventDefault(); setSelectedVar(v.name); }
                  }}
                >
                  <TypeIcon type={v.type} />
                  <div className="vmeta">
                    <div className="nm">{v.name}</div>
                    <div className="sh">{typeLabel(v.type)} · {v.shape}</div>
                  </div>
                  <span className={`vval${v.shape === "1" ? " scalar" : ""}`} title={valueOf(v)}>{valueOf(v)}</span>
                </div>
              ))}
              {currentVars.length === 0 && (
                <div className="ws-empty">
                  <p>No variables yet.</p>
                  <button className="key small" onClick={runScript}>▶ Run {editorFile}</button>
                  <button className="key small" onClick={() => importInput.current?.click()}>Import data…</button>
                  <span className="hint">or drop a {IMPORT_EXTENSIONS.slice(0, 3).join(" ")} {IMPORT_EXTENSIONS.slice(3).join(" ")} file here</span>
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
                      if (latexTab(e, setScratch)) return;
                      if (e.key === "Enter") { e.preventDefault(); evalScratch(); }
                      else if (e.key === "Escape") { setScratch(""); setScratchOut(null); }
                    }}
                    placeholder="x * 2"
                    title="\pi then Tab inserts π"
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
        ) : rightTab === "debug" ? (
          <DebugPanel
            active={debugActive}
            paused={debugPaused}
            lastOutcome={debugLastOutcome}
            file={debugFile || editorSource}
            line={debugLine}
            canStart={Boolean(editorFile)}
            frames={debugFrames}
            activeFrameId={activeFrameId}
            locals={debugLocalsList}
            watches={watches}
            breakpoints={allBreakpoints}
            onStart={() => void startDebugging()}
            onStop={stopDebugging}
            onSelectFrame={(id) => void selectDebugFrame(id)}
            onAddWatch={addWatch}
            onRemoveWatch={removeWatch}
            onToggleBpEnabled={toggleBpEnabled}
            onEditBpCondition={editBpCondition}
            onRemoveBp={deleteBp}
            onJumpToBp={jumpToBp}
          />
        ) : rightTab === "figures" ? (
          <div
            className="tabbody figtab"
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelectedFigures(); }
              else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setFigureSel(figures.map((f) => f.key)); }
              else if (e.key === "Escape") { setFigureSel(activeFigureId ? [activeFigureId] : []); }
            }}
          >
            <div className="figtools">
              <button className="key small" onClick={exportFigures} disabled={selectedExportEntries.length === 0}>
                Export…
              </button>
              <button
                className="key small"
                onClick={exportRunFigures}
                disabled={runExportEntries.length === 0}
                title="Export the latest version of every figure in the selected run"
              >
                Export run…
              </button>
              <button className="key small" onClick={removeSelectedFigures} disabled={figureSel.length === 0} title="Close the selected figures (Delete)">
                Delete
              </button>
              <span className="sp" />
              <span className="tag">{figureSel.length ? `${figureSel.length} selected` : "no selection"}</span>
            </div>
            <div className="figlist" role="listbox" aria-multiselectable="true" aria-label="Figures">
              {figureGroups.map((group) => {
                const isSelectedRun = group.id === activeRunId;
                // A whole-file run is the usual case: only another kind (cell, line, debug…) says so.
                const modeTag = group.run.mode === "file" ? "" : `${group.run.mode} · `;
                const ms = group.run.durationMs;
                const dur = ms === undefined ? "" : ` · ${ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}`;
                const count = group.entries.length;
                return (
                  <div className="figrun-group" key={group.id}>
                    <button
                      type="button"
                      className={`figrun-head${isSelectedRun ? " on" : ""}`}
                      onClick={() => setSelectedRunId(group.id)}
                      title={`Select run (${group.run.source})`}
                    >
                      <span className="figrun-name">{modeTag}{baseName(group.run.source)}</span>
                      <span className="figrun-meta">{timeOf(group.run.started)}{dur}</span>
                      <span className="figrun-count">{count} {count === 1 ? "figure" : "figures"}</span>
                    </button>
                    {group.entries.map((f) => (
                      <div
                        className={`figrow${f.key === activeFigureId ? " on" : ""}${figureSel.includes(f.key) ? " sel" : ""}`}
                        key={f.key}
                        role="option"
                        aria-selected={figureSel.includes(f.key)}
                        tabIndex={0}
                        title={`${f.source} · ${f.figure}@${f.version}`}
                        onClick={(e) => { setSelectedRunId(group.id); selectFigure(f.key, e.metaKey || e.ctrlKey, e.shiftKey); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedRunId(group.id); selectFigure(f.key, e.metaKey || e.ctrlKey, e.shiftKey); } }}
                      >
                        {f.preview ? <img className="figthumb" src={f.preview} alt="" /> : <span className="figmark">plot</span>}
                        <div className="figmeta">
                          <b>{entryLabel(f)}</b>
                          <span>{baseName(f.source)} · {timeOf(f.time)} · {f.plots} plot{f.plots === 1 ? "" : "s"}</span>
                        </div>
                        <button
                          className="figx"
                          type="button"
                          aria-label={`Close ${entryLabel(f)}`}
                          title="Close figure"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFigure(f.key); }}
                        >
                          <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4 4l6 6M10 4l-6 6" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {figures.length === 0 && <p className="hint">Run a script that draws with SqueroPlot; each figure that changed adds an entry here.</p>}
            </div>
            {figures.length > 0 && <p className="hint">Ctrl/⌘ click adds · Shift selects a range · Delete closes · exports the selection, or the shown figure.</p>}
          </div>
        ) : null}
        {kernelSeen && (
          <div className="kernel-host" hidden={rightTab !== "kernel"}>
            <KernelPanel
              kernel={kernelInfo}
              mismatch={kernelMismatch}
              state={kernelMismatch ? "mismatch" : !kernelInfo ? (kernelProbed ? "unavailable" : "starting") : running > 0 ? "running" : "ready"}
              onRestart={() => void restartKernel()}
              onInterrupt={kernelInfo ? cancelRun : undefined}
              onSay={say}
            />
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
          <span className="on">console</span><span>repl</span><span className="sp" />
          <button
            ref={consoleGear}
            type="button"
            className={`key small settings-key ${consoleSettingsOpen ? "on" : ""}`}
            onClick={() => setConsoleSettingsOpen((v) => !v)}
            title="Console settings"
            aria-label="Console settings"
            aria-expanded={consoleSettingsOpen}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2.5 5.25h2.1M6.8 5.25h6.7M2.5 10.75h4M9.8 10.75h3.7" />
              <circle cx="5.6" cy="5.25" r="1.5" />
              <circle cx="8.1" cy="10.75" r="1.5" />
            </svg>
          </button>
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
        {consoleSettingsOpen && (
          <div ref={consoleSettingsRef} className="editor-settings console-settings" role="dialog" aria-label="Console settings" data-own-keys>
            <div className="es-head"><b>console</b><span className="sp" /><button className="plain tag" onClick={() => setConsoleSettingsOpen(false)}>close</button></div>
            <label className="es-check"><input type="checkbox" checked={consoleOpts.echoCommands} onChange={(e) => setConsoleOpts({ ...consoleOpts, echoCommands: e.target.checked })} /> echo typed commands</label>
            <label className="es-check"><input type="checkbox" checked={consoleOpts.echoValues} onChange={(e) => setConsoleOpts({ ...consoleOpts, echoValues: e.target.checked })} /> echo results <span className="tag">like the REPL</span></label>
            <label className="es-check"><input type="checkbox" checked={consoleOpts.follow} onChange={(e) => setConsoleOpts({ ...consoleOpts, follow: e.target.checked })} /> scroll to newest</label>
            <label className="es-row"><span>size</span>
              <select value={consoleOpts.fontSize} onChange={(e) => setConsoleOpts({ ...consoleOpts, fontSize: Number(e.target.value) })}>
                {[10, 11, 12, 13, 14].map((n) => <option key={n} value={n}>{n} px</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="lines" aria-hidden={consoleHidden} style={{ fontSize: consoleOpts.fontSize }}>
          {lines.map((l, i) => (
            <div key={i} className={l.level}>{l.cmd ? <span className="prompt">julia&gt; </span> : null}{l.text}</div>
          ))}
          <div ref={consoleEnd} />
        </div>
        <form className="cin" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-hidden={consoleHidden}>
          <span className={`prompt${debugPaused ? " dbg" : ""}`}>{debugPaused ? `debug (${activeDebugFrame?.name || "top-level"})>` : "julia>"}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (latexTab(e, setInput)) return;
              if (e.key === "ArrowUp") { e.preventDefault(); recall(-1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); recall(1); }
            }}
            placeholder="type help · \pi then Tab"
            title="\pi then Tab inserts π"
            autoComplete="off"
            spellCheck={false}
            aria-label="console command"
          />
        </form>
      </section>

      {aboutOpen && <AboutModal status={status} kernel={kernelInfo} mismatch={kernelMismatch} onClose={() => setAboutOpen(false)} />}
      {helpQuery !== null && <HelpWindow app="Squero Studio MX" provider={helpProvider} commands={commands} query={helpQuery} onClose={() => setHelpQuery(null)} />}
      {importing && (
        <ImportDialog
          file={importing.file}
          data={importing.data}
          reserved={importing.reserved}
          taken={new Set(workspace.map((v) => v.name))}
          onImport={(vars) => void applyImport(vars)}
          onClose={() => setImporting(null)}
        />
      )}
      {editing && (
        <VariableEditor
          name={editing.name}
          type={editing.type}
          value={editing.value}
          onChange={(value) => { setEditing({ ...editing, value }); void putVariables([{ name: editing.name, value }]); }}
          onClose={() => setEditing(null)}
        />
      )}
      <input
        ref={importInput}
        type="file"
        hidden
        accept={IMPORT_EXTENSIONS.join(",")}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readImport(f); }}
      />
      {exportOpen && (exportEntriesOverride ?? selectedExportEntries).length > 0 && (
        <ExportModal
          entries={exportEntriesOverride ?? selectedExportEntries}
          initialFormat="svg"
          viewStates={viewStates}
          onSaveArtifacts={saveEntryArtifacts}
          onSay={say}
          onClose={() => { setExportOpen(false); setExportEntriesOverride(null); }}
        />
      )}
    </div>
  );
}
