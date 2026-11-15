// The variable editor: a workspace array as a grid, as MATLAB's Variables window. Arrows move,
// typing or Enter edits, Enter and Tab commit and move on, a pasted block (from a spreadsheet)
// lands at the cell and grows the array. Every commit goes back to the workspace at once.
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Modal, useDismiss } from "@paperboat/shared/components";
import { cellNumber, type ImportValue } from "./importData.ts";

const SHOWN_ROWS = 500;
const SHOWN_COLS = 60;
const fmt = (n: number) => (Number.isNaN(n) ? "NaN" : Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(8))));

/** The grid a value is shown as: a scalar 1 × 1, a vector one column (Julia's vectors are columns). */
export function gridOf(value: ImportValue): number[][] {
  if (typeof value === "number") return [[value]];
  if (Array.isArray(value[0])) return (value as number[][]).map((r) => [...r]);
  return (value as number[]).map((v) => [v]);
}

/** Back to the value's own kind while the shape allows it. */
export function valueOfGrid(grid: number[][], kind: "scalar" | "vector" | "matrix"): ImportValue {
  const cols = grid[0]?.length ?? 0;
  if (kind === "scalar" && grid.length === 1 && cols === 1) return grid[0][0];
  if (kind !== "matrix" && cols === 1) return grid.map((r) => r[0]);
  return grid;
}

export function VariableEditor({ name, type, value, onChange, onClose }: {
  name: string;
  type: string;
  value: ImportValue;
  onChange: (value: ImportValue) => void;
  onClose: () => void;
}) {
  const kind = typeof value === "number" ? "scalar" : Array.isArray(value[0]) ? "matrix" : "vector";
  const [grid, setGrid] = useState(() => gridOf(value));
  const [at, setAt] = useState<[number, number]>([0, 0]);
  const [draft, setDraft] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLInputElement>(null);
  // Escape while editing drops the edit, not the window: the cell is the topmost layer then.
  const dropped = useRef(false);
  useDismiss(editor, (why) => { if (why === "escape") { dropped.current = true; setDraft(null); } }, { enabled: draft !== null, outside: false });
  const rows = grid.length, cols = grid[0]?.length ?? 0;

  useEffect(() => { setGrid(gridOf(value)); }, [value]);
  useEffect(() => {
    box.current?.querySelector(".ve-grid td.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (draft === null) box.current?.querySelector<HTMLElement>(".ve-grid")?.focus();
    else dropped.current = false;
  }, [at, draft]);

  const emit = (next: number[][]) => {
    setGrid(next);
    onChange(valueOfGrid(next, kind));
  };
  const move = (dr: number, dc: number) => setAt(([r, c]) => [Math.max(0, Math.min(rows - 1, r + dr)), Math.max(0, Math.min(cols - 1, c + dc))]);
  const commit = (dr: number, dc: number) => {
    if (draft === null) return;
    const n = cellNumber(draft);
    if (n === null) return; // not a number: keep editing
    const next = grid.map((r) => [...r]);
    next[at[0]][at[1]] = n;
    setDraft(null);
    emit(next);
    move(dr, dc);
  };
  /** Put a block at [r, c], growing the array with zeros where it reaches past the edge. */
  const place = (block: number[][], r0: number, c0: number) => {
    const h = Math.max(rows, r0 + block.length), w = Math.max(cols, c0 + Math.max(...block.map((b) => b.length)));
    const next = Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => grid[r]?.[c] ?? 0));
    block.forEach((line, i) => line.forEach((n, j) => { next[r0 + i][c0 + j] = n; }));
    emit(next);
  };
  const addRow = () => emit([...grid, Array(Math.max(cols, 1)).fill(0)]);
  const addCol = () => emit(grid.length ? grid.map((r) => [...r, 0]) : [[0]]);
  const dropRow = () => { if (rows > 1) { emit(grid.filter((_, r) => r !== at[0])); setAt([Math.min(at[0], rows - 2), at[1]]); } };
  const dropCol = () => { if (cols > 1) { emit(grid.map((r) => r.filter((_, c) => c !== at[1]))); setAt([at[0], Math.min(at[1], cols - 2)]); } };

  const onGridKey = (e: KeyboardEvent) => {
    if (draft !== null) return;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); move(...arrows[e.key]); }
    else if (e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setDraft(fmt(grid[at[0]][at[1]])); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); const next = grid.map((r) => [...r]); next[at[0]][at[1]] = 0; emit(next); }
    else if (/^[-+.\d]$/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setDraft(e.key); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") void navigator.clipboard?.writeText(fmt(grid[at[0]][at[1]]));
  };
  const onPaste = (e: ClipboardEvent) => {
    if (draft !== null) return;
    const text = e.clipboardData.getData("text/plain");
    const lines = text.replace(/\r?\n$/, "").split(/\r?\n/).map((l) => l.split(/\t|,|;|\s+/).filter((x) => x !== "").map((x) => cellNumber(x) ?? NaN));
    if (!lines.length || !lines[0].length) return;
    e.preventDefault();
    place(lines, at[0], at[1]);
  };

  const shownRows = Math.min(rows, SHOWN_ROWS), shownCols = Math.min(cols, SHOWN_COLS);
  return (
    <Modal title={name} tags={[type, `${rows} × ${cols}`]} className="modal-window ve-window" onClose={onClose}>
      <div className="ve-tools">
        <button type="button" className="key small" onClick={addRow}>+ row</button>
        <button type="button" className="key small" onClick={addCol}>+ column</button>
        <button type="button" className="key small" onClick={dropRow} disabled={rows < 2} title="Delete the selected row">− row</button>
        <button type="button" className="key small" onClick={dropCol} disabled={cols < 2} title="Delete the selected column">− column</button>
        <span className="sp" />
        <span className="tag">{name}[{at[0] + 1}{cols > 1 || kind === "matrix" ? `, ${at[1] + 1}` : ""}]</span>
      </div>
      <div className="ve-scroll" ref={box}>
        <table className="ve-grid" tabIndex={0} onKeyDown={onGridKey} onPaste={onPaste} aria-label={`${name}, ${rows} by ${cols}`}>
          <thead>
            <tr><th />{Array.from({ length: shownCols }, (_, c) => <th key={c} className={c === at[1] ? "on" : ""}>{c + 1}</th>)}</tr>
          </thead>
          <tbody>
            {grid.slice(0, shownRows).map((row, r) => (
              <tr key={r}>
                <th className={r === at[0] ? "on" : ""}>{r + 1}</th>
                {row.slice(0, shownCols).map((n, c) => {
                  const on = r === at[0] && c === at[1];
                  return (
                    <td key={c} className={on ? "on" : ""} onClick={() => { if (draft !== null) commit(0, 0); setAt([r, c]); }} onDoubleClick={() => { setAt([r, c]); setDraft(fmt(n)); }}>
                      {on && draft !== null ? (
                        <input
                          autoFocus
                          ref={editor}
                          value={draft}
                          spellCheck={false}
                          aria-label={`${name}[${r + 1}, ${c + 1}]`}
                          className={cellNumber(draft) === null ? "bad" : ""}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => { if (!dropped.current) commit(0, 0); dropped.current = false; }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") { e.preventDefault(); commit(1, 0); }
                            else if (e.key === "Tab") { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); }
                          }}
                        />
                      ) : fmt(n)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rows > shownRows || cols > shownCols) && <p className="hint ve-more">Showing the first {shownRows} × {shownCols}; index the rest in the console.</p>}
    </Modal>
  );
}
