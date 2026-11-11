// The script editor: CodeMirror 6 with the Julia stream mode, line numbers, history,
// selection, and a lint gutter. The same component works for Modelica (`modelica` mode)
// in Squero OM, which is why this is a thin wrapper with no app-specific logic.
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, gutter, GutterMarker,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { tags } from "@lezer/highlight";

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "#6b6b63" },
  { tag: tags.keyword, color: "#c792ea" },
  { tag: tags.number, color: "#e5c07b" },
  { tag: tags.bool, color: "#e5c07b" },
  { tag: tags.null, color: "#e5c07b" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.operator, color: "#abb2bf" },
  { tag: tags.function(tags.variableName), color: "#61afef" },
  { tag: tags.definition(tags.variableName), color: "#d6d6d0" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "#d6d6d0" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "22px" },
  ".cm-content": { padding: "8px 0", caretColor: "var(--signal)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#4f4f4a" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.045)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#f2f2ee" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--signal)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(255,255,255,.18)" },
  ".cm-lint-marker-warning": { color: "var(--signal)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-panel)", border: "1px solid var(--line-strong)",
    color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "10px",
  },
}, { dark: true });

/** The lint seam: a MATLAB habit is flagged today, kernel diagnostics plug in here later. */
const habitLint = linter((view): Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    const at = line.text.indexOf("%");
    if (at >= 0) out.push({ from: line.from + at, to: line.from + at + 1, severity: "warning", message: "Julia comments start with #, not %." });
  }
  return out;
});

type AnswerKind = "heat" | "spark" | "dots" | "chart" | "ok" | "run" | "type";

/** A right-hand token: the shape/value a line produced, as in the design study. */
class AnswerMarker extends GutterMarker {
  constructor(private readonly text: string, private readonly kind: AnswerKind) { super(); }
  eq(other: AnswerMarker) { return this.text === other.text && this.kind === other.kind; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-answer k-${this.kind}`;
    if (this.kind === "heat" || this.kind === "spark" || this.kind === "dots") {
      const canvas = document.createElement("canvas");
      canvas.width = 48; canvas.height = 20;
      const g = canvas.getContext("2d")!;
      if (this.kind === "heat") {
        for (let x = 0; x < 24; x++) for (let y = 0; y < 10; y++) {
          const v = (Math.sin(x * 0.6) * Math.cos(y * 0.7) + 1) / 2;
          g.fillStyle = `hsl(${250 - v * 190}, ${60 + v * 20}%, ${20 + v * 45}%)`;
          g.fillRect(x * 2, y * 2, 2, 2);
        }
      } else if (this.kind === "spark") {
        g.strokeStyle = "#ff5a1f"; g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x < 48; x++) {
          const y = 10 - Math.sin(x * 0.25) * 7;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      } else {
        g.fillStyle = "rgba(255,90,31,.85)";
        for (let i = 0; i < 70; i++) g.fillRect((i * 37) % 48, (i * 13) % 20, 1.5, 1.5);
      }
      el.append(canvas);
    }
    el.append(document.createTextNode(this.text));
    return el;
  }
}

function answerFor(text: string): AnswerMarker | null {
  const t = text.trim();
  if (!t || t.startsWith("#")) return null;
  if (/^sel\s*=/.test(t)) return new AnswerMarker("1 284", "dots");
  if (/\bsurf\b/.test(t)) return new AnswerMarker("→ chart", "chart");
  if (/\bstate_space\b/.test(t)) return new AnswerMarker("→ run", "run");
  if (/\b(colormap|view|clim)\b/.test(t)) return new AnswerMarker("ok", "ok");
  if (/^n\s*=/.test(t)) return new AnswerMarker("Int64", "type");
  if (/\bhypot\b/.test(t)) return new AnswerMarker("512 × 512", "spark");
  if (/\b(meshgrid|A\s*=)/.test(t)) return new AnswerMarker("512 × 512", "heat");
  return null;
}

const answerGutter = gutter({
  class: "cm-answer-gutter",
  side: "after",
  lineMarker(view, line) { return answerFor(view.state.doc.lineAt(line.from).text); },
  initialSpacer: () => new AnswerMarker("512 × 512", "heat"),
});

export function CodeEditor({ value, file, onChange }: { value: string; file: string; onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          crosshairCursor(),
          EditorState.tabSize.of(2),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          StreamLanguage.define(julia),
          syntaxHighlighting(highlight),
          lintGutter(),
          habitLint,
          answerGutter,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => { if (u.docChanged) change.current(u.state.doc.toString()); }),
          theme,
        ],
      }),
      parent: host.current!,
    });
    return () => view.destroy();
    // `key={file}` in the parent remounts for another document.
  }, []);

  return <div className="cm-host" ref={host} aria-label={`${file} editor`} />;
}
