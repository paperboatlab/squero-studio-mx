// The script editor: CodeMirror 6 with the Julia stream mode, line numbers, history,
// selection, and a lint gutter. The same component works for Modelica (`modelica` mode)
// in Squero OM, which is why this is a thin wrapper with no app-specific logic.
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor,
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
