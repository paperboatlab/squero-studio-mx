// The script panel: document header, editable CodeMirror body, run strip and editor settings.
import { useRef, useState } from "react";
import { useDismiss, useFocusReturn } from "@paperboat/shared/components";
import { CodeEditor, type EditorSettings } from "./CodeEditor.tsx";
import type { FunctionTable } from "../kernel/localEval.ts";
import type { AnswerVariable } from "./answers.ts";

export function Script({
  file, code, onChange, onRun, dirty, onSave, settings, onSettings, appTheme, variables, functions, onFigure, onRunSelection, lastRun,
}: {
  file: string;
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  dirty: boolean;
  onSave: () => void;
  settings: EditorSettings;
  onSettings: (settings: EditorSettings) => void;
  appTheme: "light" | "dark";
  variables: readonly AnswerVariable[];
  functions?: FunctionTable;
  /** `→ figure`: show the figure this line (1-based) drew into. */
  onFigure?: (line: number) => void;
  onRunSelection?: (code: string, mode: "cell" | "line" | "selection") => void;
  lastRun?: { time: number; ms: number; lines: number; mode: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ line: 1, col: 1, selected: 0 });
  const settingsRef = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);
  // The same dismissal rule as the menus: a press outside or Escape closes; focus goes back.
  useDismiss(settingsRef, () => setOpen(false), { enabled: open, triggerRef: gear });
  useFocusReturn(open ? settingsRef : undefined);
  const set = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => onSettings({ ...settings, [key]: value });
  const clock = (time: number) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const modeLabel = (mode: string) => (mode === "file" ? "script" : mode);

  return (
    <section className="panel editor">
      <div className="head">
        <b>{file}{dirty ? " •" : ""}</b>
        <span className="sp" />
        <button className="key small" onClick={onSave} disabled={!dirty} title="Save (Ctrl+S)">Save</button>
        <button className="key small" onClick={onRun}>Run</button>
        <button ref={gear} className={`key small settings-key ${open ? "on" : ""}`} onClick={() => setOpen((v) => !v)} title="Editor settings" aria-label="Editor settings" aria-expanded={open}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 5.25h2.1M6.8 5.25h6.7M2.5 10.75h4M9.8 10.75h3.7" />
            <circle cx="5.6" cy="5.25" r="1.5" />
            <circle cx="8.1" cy="10.75" r="1.5" />
          </svg>
        </button>
      </div>

      {open && (
        <div ref={settingsRef} className="editor-settings" role="dialog" aria-label="Editor settings" data-own-keys>
          <div className="es-head"><b>editor</b><span className="sp" /><button className="plain tag" onClick={() => setOpen(false)}>close</button></div>
          <div className="es-row"><span>theme</span><span className="seg">
            <button className={settings.theme === "ui" ? "on" : ""} onClick={() => set("theme", "ui")} title="Follow the main UI theme">ui</button>
            <button className={settings.theme === "light" ? "on" : ""} onClick={() => set("theme", "light")}>light</button>
            <button className={settings.theme === "dark" ? "on" : ""} onClick={() => set("theme", "dark")}>dark</button>
          </span></div>
          <label className="es-row"><span>font</span>
            <select value={settings.font} onChange={(e) => set("font", e.target.value as EditorSettings["font"])}>
              <option value="geist">Geist Mono</option>
              <option value="system">System mono</option>
              <option value="serif">Serif</option>
            </select>
          </label>
          <label className="es-row"><span>size</span>
            <select value={settings.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))}>
              {[11, 12, 13, 14, 15, 16].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
          </label>
          <label className="es-row"><span>line height</span>
            <select value={settings.lineHeight} onChange={(e) => set("lineHeight", Number(e.target.value))}>
              {[20, 22, 24, 26, 28].map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
          </label>
          <label className="es-row"><span>tab</span>
            <select value={settings.tabSize} onChange={(e) => set("tabSize", Number(e.target.value))}>
              {[2, 4, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="es-check"><input type="checkbox" checked={settings.wrap} onChange={(e) => set("wrap", e.target.checked)} /> wrap lines</label>
          <label className="es-check"><input type="checkbox" checked={settings.autocomplete} onChange={(e) => set("autocomplete", e.target.checked)} /> autocomplete</label>
          <label className="es-check"><input type="checkbox" checked={settings.brackets} onChange={(e) => set("brackets", e.target.checked)} /> close brackets</label>
          <label className="es-check"><input type="checkbox" checked={settings.lint} onChange={(e) => set("lint", e.target.checked)} /> lint <span className="tag">% comments</span></label>
        </div>
      )}

      <div className="code">
        <CodeEditor key={file} value={code} file={file} onChange={onChange} settings={settings} appTheme={appTheme} variables={variables} functions={functions} onFigure={onFigure} onRunSelection={onRunSelection} onPos={setPos} />
      </div>
      {!file && <div className="editor-empty">Open the workspace folder, or create a script with +.</div>}
      <div className="runstrip">
        <span className="pos">Ln {pos.line}, Col {pos.col}</span>
        {pos.selected > 0 && <span className="sel">{pos.selected} selected</span>}
        <span className="sp" />
        <span className="runstat">
          {lastRun
            ? `run ${modeLabel(lastRun.mode)} · ${clock(lastRun.time)} · ${lastRun.lines} line${lastRun.lines === 1 ? "" : "s"} · ${lastRun.ms} ms`
            : "not run yet"}
        </span>
        <span title="Ctrl/Cmd+Enter: run cell · Shift+Enter: run line">⌘↵ cell · ⇧↵ line</span>
      </div>
    </section>
  );
}
