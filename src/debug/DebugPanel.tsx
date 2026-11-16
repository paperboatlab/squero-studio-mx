// Right-pane `[ debug ]` tab: start/stop session, Call Stack, Locals, Watch expressions, and Breakpoints.
import { useState } from "react";
import type { DebugFrame, DebugLocal } from "../kernel/protocol.ts";
import { TypeIcon } from "../workspace/TypeIcon.tsx";
import { formatDebugValue, type FileBreakpoint, type WatchEntry } from "./state.ts";

const shortType = (type: string) =>
  type.startsWith("Matrix") ? "matrix"
    : type.startsWith("Vector") ? "vector"
    : (type.replace(/\{[\s\S]*$/, "").split(".").pop() ?? type).replace(/^@/, "").toLowerCase();

export function DebugPanel({
  active,
  paused,
  lastOutcome,
  file,
  line,
  canStart,
  frames,
  activeFrameId,
  locals,
  watches,
  breakpoints,
  onStart,
  onStop,
  onSelectFrame,
  onAddWatch,
  onRemoveWatch,
  onToggleBpEnabled,
  onEditBpCondition,
  onRemoveBp,
  onJumpToBp,
}: {
  active: boolean;
  paused: boolean;
  lastOutcome?: "finished" | "stopped" | "error" | null;
  file: string;
  line: number | null;
  canStart: boolean;
  frames: readonly DebugFrame[];
  activeFrameId: number | null;
  locals: readonly DebugLocal[];
  watches: readonly WatchEntry[];
  breakpoints: readonly FileBreakpoint[];
  onStart: () => void;
  onStop: () => void;
  onSelectFrame: (frameId: number) => void;
  onAddWatch: (expr: string) => void;
  onRemoveWatch: (expr: string) => void;
  onToggleBpEnabled: (file: string, line: number, enabled: boolean) => void;
  onEditBpCondition: (file: string, line: number, condition: string) => void;
  onRemoveBp: (file: string, line: number) => void;
  onJumpToBp: (file: string, line: number) => void;
}) {
  const [watchDraft, setWatchDraft] = useState("");
  const [editingCond, setEditingCond] = useState<{ key: string; text: string } | null>(null);

  const submitWatch = () => {
    const expr = watchDraft.trim();
    if (!expr) return;
    onAddWatch(expr);
    setWatchDraft("");
  };

  return (
    <div className="tabbody dbg-panel">
      <div className="dbg-session">
        {active ? (
          <button type="button" className="key small dbg-stop" onClick={onStop} title="Stop debugging (Shift+F5)">
            <span className="dbg-ico" aria-hidden="true">■</span> Stop debugging
          </button>
        ) : (
          <button
            type="button"
            className="key small primary"
            onClick={onStart}
            disabled={!canStart}
            title={canStart ? "Start debugging the active script" : "Open a script first"}
          >
            <span className="dbg-ico" aria-hidden="true">▶</span> Start debugging
          </button>
        )}
        <span className={`dbg-session-stat${paused ? " paused" : lastOutcome === "error" ? " err" : ""}`}>
          {active
            ? (paused && line !== null ? `paused · ${file}:${line}` : "running…")
            : lastOutcome
            ? (file && line !== null ? `${lastOutcome} · ${file}:${line}` : file ? `${lastOutcome} · ${file}` : lastOutcome)
            : "idle"}
        </span>
      </div>

      {(active || frames.length > 0 || locals.length > 0) && (
        <>
          <section className="dbg-sec">
            <h4>Call stack</h4>
            <div className="dbg-stack" role="list">
              {frames.map((f, idx) => {
                const selected = f.id === activeFrameId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="listitem"
                    className={`dbg-frame${selected ? " on" : ""}`}
                    onClick={() => onSelectFrame(f.id)}
                  >
                    <span className="dbg-idx">#{idx + 1}</span>
                    <span className="dbg-fn">{f.name}</span>
                    <span className="dbg-loc">{f.file}:{f.line}</span>
                  </button>
                );
              })}
              {frames.length === 0 && <div className="dbg-empty">{active ? "running…" : "session ended"}</div>}
            </div>
          </section>

          <section className="dbg-sec">
            <h4>Locals</h4>
            <div className="vars">
              {locals.map((v) => (
                <div className="varc" key={v.name} title={v.text || `${v.name}: ${v.type}`}>
                  <TypeIcon type={v.type} />
                  <div className="vmeta">
                    <div className="nm">{v.name}</div>
                    <div className="sh">{shortType(v.type)}{v.shape ? ` · ${v.shape}` : ""}</div>
                  </div>
                  <span className={`vval${v.shape === "1" ? " scalar" : ""}`}>{formatDebugValue(v)}</span>
                </div>
              ))}
              {locals.length === 0 && (
                <div className="dbg-empty">
                  {active ? (paused ? "no locals in frame" : "pause to inspect locals") : "no locals captured"}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <section className="dbg-sec">
        <h4>Watch</h4>
        <div className="scratch dbg-watch-in">
          <div className="box">
            <input
              value={watchDraft}
              onChange={(e) => setWatchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitWatch(); }
                else if (e.key === "Escape") setWatchDraft("");
              }}
              placeholder="watch expression…"
              aria-label="Watch expression"
              spellCheck={false}
            />
            <button type="button" className="scratch-run" onClick={submitWatch} title="Add watch (Enter)" aria-label="Add watch">+</button>
          </div>
        </div>
        {watches.length > 0 && (
          <div className="dbg-watches">
            {watches.map((w) => (
              <div key={w.expr} className={`dbg-watch${w.error ? " err" : ""}`}>
                <span className="dbg-wexpr" title={w.expr}>{w.expr}</span>
                <span className="dbg-wval" title={w.error || w.text || ""}>
                  {w.error ? w.error : w.text ? `= ${w.text}` : active ? "…" : "—"}
                </span>
                <button type="button" className="dbg-x" onClick={() => onRemoveWatch(w.expr)} aria-label={`Remove watch ${w.expr}`} title="Remove watch">×</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dbg-sec">
        <h4>Breakpoints</h4>
        <div className="dbg-bps">
          {breakpoints.map((bp) => {
            const key = `${bp.file}:${bp.line}`;
            const isEditing = editingCond?.key === key;
            return (
              <div key={key} className="dbg-bp-row">
                <input
                  type="checkbox"
                  checked={bp.enabled}
                  onChange={(e) => onToggleBpEnabled(bp.file, bp.line, e.target.checked)}
                  aria-label={`Toggle breakpoint ${key}`}
                />
                <button type="button" className="dbg-bp-loc" onClick={() => onJumpToBp(bp.file, bp.line)} title="Jump to breakpoint">
                  {key}
                </button>
                {isEditing ? (
                  <input
                    className="dbg-bp-cond-in"
                    value={editingCond.text}
                    autoFocus
                    placeholder="condition (e.g. k == 4)"
                    onChange={(e) => setEditingCond({ key, text: e.target.value })}
                    onBlur={() => { onEditBpCondition(bp.file, bp.line, editingCond.text); setEditingCond(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { onEditBpCondition(bp.file, bp.line, editingCond.text); setEditingCond(null); }
                      else if (e.key === "Escape") setEditingCond(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={`dbg-bp-cond${bp.condition ? " set" : ""}`}
                    onClick={() => setEditingCond({ key, text: bp.condition ?? "" })}
                    title="Set breakpoint condition"
                  >
                    {bp.condition ? `(${bp.condition})` : "cond"}
                  </button>
                )}
                <button type="button" className="dbg-x" onClick={() => onRemoveBp(bp.file, bp.line)} aria-label={`Remove breakpoint ${key}`} title="Remove breakpoint">×</button>
              </div>
            );
          })}
          {breakpoints.length === 0 && <div className="dbg-empty">Click the editor gutter to add a breakpoint.</div>}
        </div>
      </section>
    </div>
  );
}
