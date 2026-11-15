// CodeMirror 6 debugger extension: clickable breakpoint gutter (enabled, disabled, conditional)
// and paused execution line highlight + gutter arrow.
import { Prec, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, type DecorationSet } from "@codemirror/view";
import type { BreakpointSpec } from "../kernel/protocol.ts";

export const setBreakpointsEffect = StateEffect.define<readonly BreakpointSpec[]>();
export const setPausedLineEffect = StateEffect.define<number | null>();

export const bpField = StateField.define<readonly BreakpointSpec[]>({
  create: () => [],
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setBreakpointsEffect)) return e.value;
    return value;
  },
});

export const pausedLineField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setPausedLineEffect)) return e.value;
    return value;
  },
});

const pausedLineDeco = Decoration.line({ class: "cm-debug-paused-line" });

const pausedHighlight = EditorView.decorations.compute([pausedLineField], (state): DecorationSet => {
  const ln = state.field(pausedLineField);
  if (ln === null || ln < 1 || ln > state.doc.lines) return Decoration.none;
  const line = state.doc.line(ln);
  return Decoration.set([pausedLineDeco.range(line.from)]);
});

class DebugGutterMarker extends GutterMarker {
  readonly bp: BreakpointSpec | null;
  readonly paused: boolean;

  constructor(bp: BreakpointSpec | null, paused: boolean) {
    super();
    this.bp = bp;
    this.paused = paused;
  }

  eq(other: DebugGutterMarker): boolean {
    return this.paused === other.paused
      && Boolean(this.bp) === Boolean(other.bp)
      && this.bp?.enabled === other.bp?.enabled
      && (this.bp?.condition ?? "") === (other.bp?.condition ?? "");
  }

  toDOM() {
    const cell = document.createElement("span");
    cell.className = "cm-bp-cell";
    if (this.bp) {
      const dot = document.createElement("span");
      const cond = !!this.bp.condition?.trim();
      dot.className = `cm-bp-dot${this.bp.enabled ? "" : " disabled"}${cond ? " cond" : ""}`;
      dot.title = cond
        ? `Breakpoint (${this.bp.enabled ? "enabled" : "disabled"} · ${this.bp.condition})`
        : `Breakpoint (${this.bp.enabled ? "enabled" : "disabled"})`;
      cell.append(dot);
    }
    if (this.paused) {
      const arrow = document.createElement("span");
      arrow.className = "cm-bp-arrow";
      arrow.title = "Paused here";
      arrow.textContent = "▶";
      cell.append(arrow);
    }
    return cell;
  }
}

export function debugExtension(onToggle: () => ((line: number) => void) | undefined): Extension {
  return [
    bpField,
    pausedLineField,
    pausedHighlight,
    Prec.high(gutter({
      class: "cm-bp-gutter",
      renderEmptyElements: true,
      lineMarker(view, line) {
        const lineNum = view.state.doc.lineAt(line.from).number;
        const bps = view.state.field(bpField);
        const paused = view.state.field(pausedLineField) === lineNum;
        const bp = bps.find((b) => b.line === lineNum) ?? null;
        if (!bp && !paused) return null;
        return new DebugGutterMarker(bp, paused);
      },
      lineMarkerChange(update) {
        return update.state.field(bpField) !== update.startState.field(bpField)
          || update.state.field(pausedLineField) !== update.startState.field(pausedLineField);
      },
      initialSpacer: () => new DebugGutterMarker({ line: 1, enabled: true }, false),
    })),
    ViewPlugin.fromClass(class {
      private readonly view: EditorView;
      private readonly onMouseDown: (event: MouseEvent) => void;

      constructor(view: EditorView) {
        this.view = view;
        this.onMouseDown = (event: MouseEvent) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement | null;
          if (!target) return;
          const gutterEl = target.closest(".cm-gutter");
          if (!gutterEl || gutterEl.classList.contains("cm-answer-gutter")) return;
          if (!this.view.dom.contains(gutterEl)) return;
          const elem = target.closest(".cm-gutterElement");
          if (!elem || !gutterEl.contains(elem)) return;
          const rect = elem.getBoundingClientRect();
          const y = (rect.top + rect.bottom) / 2;
          const block = this.view.lineBlockAtHeight(y - this.view.documentTop);
          const lineNum = this.view.state.doc.lineAt(block.from).number;
          onToggle()?.(lineNum);
          event.preventDefault();
        };
        this.view.dom.addEventListener("mousedown", this.onMouseDown);
      }

      destroy() {
        this.view.dom.removeEventListener("mousedown", this.onMouseDown);
      }
    }),
  ];
}

export function syncDebugView(view: EditorView | null, breakpoints: readonly BreakpointSpec[], pausedLine: number | null) {
  if (!view) return;
  const currentBps = view.state.field(bpField, false);
  const currentLine = view.state.field(pausedLineField, false);
  const effects: StateEffect<unknown>[] = [];
  if (currentBps !== breakpoints) effects.push(setBreakpointsEffect.of(breakpoints));
  if (currentLine !== pausedLine) effects.push(setPausedLineEffect.of(pausedLine));
  if (effects.length === 0) return;
  view.dispatch({ effects });
  if (pausedLine !== null && pausedLine >= 1 && pausedLine <= view.state.doc.lines) {
    const pos = view.state.doc.line(pausedLine).from;
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  }
}
