// The script panel: document header, editable CodeMirror body, run strip.
import { CodeEditor } from "./CodeEditor.tsx";

export function Script({ file, code, onChange }: { file: string; code: string; onChange: (code: string) => void }) {
  return (
    <section className="panel editor">
      <div className="head">
        <b>{file}</b>
        <span className="tag">Ln 1, Col 1</span>
        <span className="sp" />
        <span className="tag">changed 0</span>
        <button className="key small">Run cell</button>
        <button className="key small">▶</button>
      </div>
      <div className="code">
        <CodeEditor key={file} value={code} file={file} onChange={onChange} />
      </div>
      <div className="runstrip">
        <span>run-07</span>
        <span className="track"><span className="f" /><span className="k" /></span>
        <span>2.40 s</span>
        <span>step 120 / 500</span>
        <span style={{ marginLeft: "auto" }}>← → step</span>
      </div>
    </section>
  );
}
