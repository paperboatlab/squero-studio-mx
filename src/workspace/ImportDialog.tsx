// Import data: what a file holds, sheet by sheet, before it lands in the workspace. A sheet with
// a header can come in as one matrix or as a vector per column, as MATLAB's import tool offers.
import { useMemo, useState } from "react";
import { Modal } from "@paperboat/shared/components";
import { identifier, sheetVariables, type ImportValue, type Imported } from "./importData.ts";

type Choice = { on: boolean; name: string; as: "matrix" | "columns" };

const PREVIEW_ROWS = 6;
const cell = (n: number | undefined) => (n === undefined ? "" : Number.isInteger(n) ? String(n) : Number.isNaN(n) ? "NaN" : String(Number(n.toPrecision(6))));

export function ImportDialog({ file, data, taken, reserved, onImport, onClose }: {
  file: string;
  data: Imported;
  /** Names already in the workspace: importing over one replaces it, so it says so. */
  taken: ReadonlySet<string>;
  /** Julia's own names, which an imported variable never takes. */
  reserved?: ReadonlySet<string>;
  onImport: (variables: { name: string; value: ImportValue }[]) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Choice[]>(() =>
    data.sheets.map((s) => ({ on: true, name: identifier(s.name), as: s.headers && s.rows.length > 1 ? "columns" : "matrix" })));
  const set = (i: number, patch: Partial<Choice>) => setChoices((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const variables = useMemo(
    () => data.sheets.flatMap((s, i) => (choices[i].on ? sheetVariables(s, choices[i].as, identifier(choices[i].name), reserved) : [])),
    [choices, data.sheets, reserved],
  );
  const replacing = variables.filter((v) => taken.has(v.name)).map((v) => v.name);

  return (
    <Modal title="Import data" tags={[file]} className="modal-window import-window" onClose={onClose}>
      <div className="import-body">
        {data.sheets.length === 0 && <p className="hint">No numbers to import in this file.</p>}
        {data.sheets.map((s, i) => {
          const c = choices[i];
          const width = s.rows[0]?.length ?? 0;
          return (
            <section key={i} className={`import-sheet${c.on ? "" : " off"}`}>
              <header>
                <label className="import-check">
                  <input type="checkbox" checked={c.on} onChange={(e) => set(i, { on: e.target.checked })} />
                  <span className="tag">{s.rows.length} × {width}</span>
                </label>
                {s.headers ? (
                  <span className="import-as" role="radiogroup" aria-label="Import as">
                    <label><input type="radio" checked={c.as === "columns"} onChange={() => set(i, { as: "columns" })} /> a vector per column</label>
                    <label><input type="radio" checked={c.as === "matrix"} onChange={() => set(i, { as: "matrix" })} /> one matrix</label>
                  </span>
                ) : null}
                {(c.as === "matrix" || !s.headers) && (
                  <input className="import-name" value={c.name} aria-label="Variable name" spellCheck={false} onChange={(e) => set(i, { name: e.target.value })} />
                )}
              </header>
              <div className="import-grid">
                <table>
                  {s.headers && (
                    <thead>
                      <tr>{s.headers.map((h, j) => <th key={j} title={c.as === "columns" ? `→ ${identifier(h)}` : undefined}>{h}</th>)}</tr>
                    </thead>
                  )}
                  <tbody>
                    {s.rows.slice(0, PREVIEW_ROWS).map((row, r) => <tr key={r}>{row.map((n, j) => <td key={j}>{cell(n)}</td>)}</tr>)}
                    {s.rows.length > PREVIEW_ROWS && <tr><td colSpan={width} className="more">… {s.rows.length - PREVIEW_ROWS} more rows</td></tr>}
                  </tbody>
                </table>
              </div>
              {s.notes.length > 0 && <p className="hint">{s.notes.join(" · ")}</p>}
            </section>
          );
        })}
        {data.notes.length > 0 && <p className="hint">{data.notes.join(" · ")}</p>}
      </div>
      <footer className="modal-actions">
        <span className="import-summary">
          {variables.length ? `→ ${variables.map((v) => v.name).join(", ")}` : "nothing selected"}
          {replacing.length > 0 && <b> · replaces {replacing.join(", ")}</b>}
        </span>
        <button type="button" className="key small" onClick={onClose}>Cancel</button>
        <button type="button" className="key small primary" disabled={!variables.length} onClick={() => onImport(variables)}>
          Import {variables.length || ""}
        </button>
      </footer>
    </Modal>
  );
}
