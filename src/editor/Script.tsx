// The script panel: document header, editable CodeMirror body, run strip and editor settings.
import { useState } from "react";
import { CodeEditor, type EditorSettings } from "./CodeEditor.tsx";

export function Script({
  file, code, onChange, onRun, dirty, onSave, settings, onSettings, variables, onChart, onRunSelection,
}: {
  file: string;
  code: string;
  onChange: (code: string) => void;
  onRun: () => void;
  dirty: boolean;
  onSave: () => void;
  settings: EditorSettings;
  onSettings: (settings: EditorSettings) => void;
  variables: readonly { name: string; type: string }[];
  onChart?: (kind: "3d" | "2d", line: string) => void;
  onRunSelection?: (code: string, mode: "cell" | "line" | "selection") => void;
}) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => onSettings({ ...settings, [key]: value });

  return (
    <section className="panel editor">
      <div className="head">
        <b>{file}{dirty ? " •" : ""}</b>
        <span className="tag">Ln 1, Col 1</span>
        <span className="sp" />
        <button className="key small" onClick={onSave} disabled={!dirty} title="Save (Ctrl+S)">Save</button>
        <button className="key small" onClick={onRun}>Run</button>
        <button className="key small" onClick={onRun} title="Run">▶</button>
        <button className={`key small settings-key ${open ? "on" : ""}`} onClick={() => setOpen((v) => !v)} title="Editor settings" aria-expanded={open}>⚙</button>
      </div>

      {open && (
        <div className="editor-settings" role="dialog" aria-label="Editor settings">
          <div className="es-head"><b>editor</b><span className="sp" /><button className="plain tag" onClick={() => setOpen(false)}>close</button></div>
          <div className="es-row"><span>theme</span><span className="seg">
            <button className={settings.theme === "dark" ? "on" : ""} onClick={() => set("theme", "dark")}>dark</button>
            <button className={settings.theme === "light" ? "on" : ""} onClick={() => set("theme", "light")}>light</button>
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
        <CodeEditor key={file} value={code} file={file} onChange={onChange} settings={settings} variables={variables} onChart={onChart} onRunSelection={onRunSelection} />
      </div>
      <div className="runstrip">
        <span>run-07</span>
        <span className="track"><span className="f" /><span className="k" /></span>
        <span>2.40 s</span>
        <span>step 120 / 500</span>
        <span style={{ marginLeft: "auto" }} title="Ctrl/Cmd+Enter: run cell · Shift+Enter: run line">⌘↵ cell · ⇧↵ line</span>
      </div>
    </section>
  );
}
