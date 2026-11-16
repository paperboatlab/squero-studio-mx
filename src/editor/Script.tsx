// The script panel: document header, editable CodeMirror body, run strip and editor settings.
import { useState, type ReactNode } from "react";
import { EditorSettingsKey, type ConfigFile, type EditorSettings } from "@paperboat/shared/editor";
import { CodeEditor } from "./CodeEditor.tsx";
import type { FunctionTable } from "../kernel/localEval.ts";
import type { BreakpointSpec } from "../kernel/protocol.ts";
import type { AnswerVariable } from "./answers.ts";

export type ScriptDebugControls = {
  active: boolean;
  paused: boolean;
  line: number | null;
  fnName?: string | null;
  onContinue: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
  onPause: () => void;
  onStop: () => void;
};

export function Script({
  running, runStatus, file, code, onChange, onRun, onCancel, dirty, onSave, settings, onSettings, configFile, appTheme, variables, debugLocals, functions, onFigure, onRunSelection, lastRun, base, readOnly, onCopyToWorkspace, breakpoints, onToggleBreakpoint, debug,
}: {
  /** The kernel is compiling or running something. */
  running?: boolean;
  /** What the run is doing (the shared RunStatus), in place of the last run's line. */
  runStatus?: ReactNode;
  file: string;
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  /** While running, the Run key is Cancel. */
  onCancel?: () => void;
  dirty: boolean;
  onSave: () => void;
  settings: EditorSettings;
  onSettings: (settings: EditorSettings) => void;
  configFile?: ConfigFile;
  appTheme: "light" | "dark";
  variables: readonly AnswerVariable[];
  debugLocals?: readonly AnswerVariable[];
  functions?: FunctionTable;
  /** `→ figure`: show the figure this line (1-based) drew into. */
  onFigure?: (line: number) => void;
  onRunSelection?: (code: string, mode: "cell" | "line" | "selection") => void;
  lastRun?: { time: number; ms: number; lines: number; mode: string } | null;
  /** HEAD's copy of the file, for the git gutter. */
  base?: string | null;
  readOnly?: boolean;
  onCopyToWorkspace?: () => void;
  breakpoints?: readonly BreakpointSpec[];
  onToggleBreakpoint?: (line: number) => void;
  debug?: ScriptDebugControls;
}) {
  const [pos, setPos] = useState({ line: 1, col: 1, selected: 0 });
  const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const modeLabel = (mode: string) => (mode === "file" ? "script" : mode);

  return (
    <section className="panel editor">
      <div className="head">
        <b>{file}{dirty ? " •" : ""}</b>
        {readOnly && <span className="tag" title="Shipped tutorial example (read-only)">read-only</span>}
        <span className="sp" />
        {onCopyToWorkspace && (
          <button type="button" className="key small" onClick={onCopyToWorkspace} title="Copy into your writable workspace to edit">Copy to workspace</button>
        )}
        {!readOnly && <button className="key small" onClick={onSave} disabled={!dirty} title="Save (Ctrl+S)">Save</button>}
        {running && onCancel
          ? <button className="key small" onClick={onCancel} title="Stop the run (Ctrl+C)">Cancel</button>
          : <button className="key small" onClick={onRun} disabled={running} aria-busy={running}>{running ? "Running" : "Run"}</button>}
        <EditorSettingsKey settings={settings} onSettings={onSettings} lintNote="% comments" file={configFile} />
      </div>


      <div className="code">
        <CodeEditor key={file} value={code} file={file} onChange={onChange} settings={settings} appTheme={appTheme} variables={variables} debugLocals={debugLocals} functions={functions} onFigure={onFigure} onRunSelection={onRunSelection} onPos={setPos} base={base} readOnly={readOnly} breakpoints={breakpoints} pausedLine={debug?.paused ? debug.line : null} onToggleBreakpoint={onToggleBreakpoint} />
      </div>
      {!file && <div className="editor-empty">Open the workspace folder, or create a script with +.</div>}
      {debug?.active && (
        <div className="dock debug-dock" role="group" aria-label="Debugger controls">
          {debug.paused ? (
            <>
              <button type="button" className="key small primary" onClick={debug.onContinue} title="Continue (F5)">
                <span className="dbg-ico" aria-hidden="true">▶</span> Continue
              </button>
              <button type="button" className="key small" onClick={debug.onStepOver} title="Step Over (F10)">
                <span className="dbg-ico" aria-hidden="true">↷</span> Over
              </button>
              <button type="button" className="key small" onClick={debug.onStepInto} title="Step Into (F11)">
                <span className="dbg-ico" aria-hidden="true">↘</span> Into
              </button>
              <button type="button" className="key small" onClick={debug.onStepOut} title="Step Out (Shift+F11)">
                <span className="dbg-ico" aria-hidden="true">↗</span> Out
              </button>
            </>
          ) : (
            <button type="button" className="key small" onClick={debug.onPause} title="Pause execution">
              <span className="dbg-ico" aria-hidden="true">⏸</span> Pause
            </button>
          )}
          <button type="button" className="key small dbg-stop" onClick={debug.onStop} title="Stop debugging (Shift+F5)">
            <span className="dbg-ico" aria-hidden="true">■</span> Stop
          </button>
          <span className="dbg-sep" aria-hidden="true" />
          <span className="dbg-stat" role="status">
            <i className={`dbg-dot${debug.paused ? " paused" : ""}`} aria-hidden="true" />
            {debug.paused && debug.line !== null ? `ln ${debug.line}` : "running"}
          </span>
        </div>
      )}
      <div className="runstrip">
        <span className="pos">Ln {pos.line}, Col {pos.col}</span>
        {pos.selected > 0 && <span className="sel">{pos.selected} selected</span>}
        <span className="sp" />
        {debug?.paused ? (
          <span className="runstat dbg-runstat" role="status">paused · {debug.fnName || "top-level"}</span>
        ) : running && runStatus ? runStatus : (
        <>
        {running && <span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
        <span className="runstat" role="status">
          {running
            ? "compiling and running…"
            : lastRun
            ? `run ${modeLabel(lastRun.mode)} · ${clock(lastRun.time)} · ${lastRun.lines} line${lastRun.lines === 1 ? "" : "s"} · ${lastRun.ms} ms`
            : "not run yet"}
        </span>
        </>
        )}
        {!running && <span title="Ctrl/Cmd+Enter: run cell · Shift+Enter: run line">⌘↵ cell · ⇧↵ line</span>}
      </div>
    </section>
  );
}
