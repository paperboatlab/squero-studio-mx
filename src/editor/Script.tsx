// The script panel: document header, editable CodeMirror body, run strip and editor settings.
import { useState } from "react";
import { EditorSettingsKey, type ConfigFile, type EditorSettings } from "@paperboat/shared/editor";
import { CodeEditor } from "./CodeEditor.tsx";
import type { FunctionTable } from "../kernel/localEval.ts";
import type { AnswerVariable } from "./answers.ts";

export function Script({
  running, file, code, onChange, onRun, dirty, onSave, settings, onSettings, configFile, appTheme, variables, functions, onFigure, onRunSelection, lastRun, base,
}: {
  /** The kernel is compiling or running something. */
  running?: boolean;
  file: string;
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  dirty: boolean;
  onSave: () => void;
  settings: EditorSettings;
  onSettings: (settings: EditorSettings) => void;
  configFile?: ConfigFile;
  appTheme: "light" | "dark";
  variables: readonly AnswerVariable[];
  functions?: FunctionTable;
  /** `→ figure`: show the figure this line (1-based) drew into. */
  onFigure?: (line: number) => void;
  onRunSelection?: (code: string, mode: "cell" | "line" | "selection") => void;
  lastRun?: { time: number; ms: number; lines: number; mode: string } | null;
  /** HEAD's copy of the file, for the git gutter. */
  base?: string | null;
}) {
  const [pos, setPos] = useState({ line: 1, col: 1, selected: 0 });
  const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const modeLabel = (mode: string) => (mode === "file" ? "script" : mode);

  return (
    <section className="panel editor">
      <div className="head">
        <b>{file}{dirty ? " •" : ""}</b>
        <span className="sp" />
        <button className="key small" onClick={onSave} disabled={!dirty} title="Save (Ctrl+S)">Save</button>
        <button className="key small" onClick={onRun} disabled={running} aria-busy={running}>{running ? "Running" : "Run"}</button>
        <EditorSettingsKey settings={settings} onSettings={onSettings} lintNote="% comments" file={configFile} />
      </div>


      <div className="code">
        <CodeEditor key={file} value={code} file={file} onChange={onChange} settings={settings} appTheme={appTheme} variables={variables} functions={functions} onFigure={onFigure} onRunSelection={onRunSelection} onPos={setPos} base={base} />
      </div>
      {!file && <div className="editor-empty">Open the workspace folder, or create a script with +.</div>}
      <div className="runstrip">
        <span className="pos">Ln {pos.line}, Col {pos.col}</span>
        {pos.selected > 0 && <span className="sel">{pos.selected} selected</span>}
        <span className="sp" />
        {running && <span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
        <span className="runstat" role="status">
          {running
            ? "compiling and running…"
            : lastRun
            ? `run ${modeLabel(lastRun.mode)} · ${clock(lastRun.time)} · ${lastRun.lines} line${lastRun.lines === 1 ? "" : "s"} · ${lastRun.ms} ms`
            : "not run yet"}
        </span>
        <span title="Ctrl/Cmd+Enter: run cell · Shift+Enter: run line">⌘↵ cell · ⇧↵ line</span>
      </div>
    </section>
  );
}
