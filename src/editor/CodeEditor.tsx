// The script editor: CodeMirror 6 with two themes, Julia completions (keywords, builtins and
// the live workspace), bracket matching/closing, a lint gutter and clickable answer tokens.
// The settings are the caller's; this file only maps them to extensions.
import { useEffect, useRef } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, gutter, GutterMarker,
  Decoration, ViewPlugin, type DecorationSet, type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle, StreamLanguage, syntaxHighlighting, bracketMatching, indentOnInput,
} from "@codemirror/language";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
  snippetCompletion, type Completion, type CompletionSource,
} from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { defineFunction, evaluate, variableFrom, type FunctionTable, type NumValue } from "../kernel/localEval.ts";

export type EditorSettings = {
  theme: "dark" | "light";
  fontSize: number;
  font: "geist" | "system" | "serif";
  lineHeight: number;
  tabSize: number;
  wrap: boolean;
  autocomplete: boolean;
  brackets: boolean;
  lint: boolean;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: "dark", fontSize: 12, font: "geist", lineHeight: 22,
  tabSize: 2, wrap: true, autocomplete: true, brackets: true, lint: true,
};

const FONTS: Record<EditorSettings["font"], string> = {
  geist: "var(--font-mono)",
  system: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  serif: "ui-serif, Georgia, Cambria, serif",
};

const darkHighlight = HighlightStyle.define([
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

const lightHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#7a7a73" },
  { tag: tags.keyword, color: "#7c3aed" },
  { tag: tags.number, color: "#b45309" },
  { tag: tags.bool, color: "#b45309" },
  { tag: tags.null, color: "#b45309" },
  { tag: tags.string, color: "#15803d" },
  { tag: tags.operator, color: "#55554f" },
  { tag: tags.function(tags.variableName), color: "#1d4ed8" },
  { tag: tags.definition(tags.variableName), color: "#161616" },
]);

const darkTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "#d6d6d0" },
  ".cm-content": { caretColor: "var(--signal)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#4f4f4a" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.045)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#f2f2ee" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--signal)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(255,255,255,.18)" },
  ".cm-tooltip": { backgroundColor: "var(--surface-panel)", border: "1px solid var(--line-strong)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "10px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--surface-sunken)", color: "var(--text)" },
  ".cm-lint-marker-warning": { color: "var(--signal)" },
}, { dark: true });

const lightTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#f2f2ef", color: "#161616" },
  ".cm-content": { caretColor: "#b03d0a" },
  ".cm-gutters": { backgroundColor: "#eaeae6", border: "none", color: "#9d9d97" },
  ".cm-activeLine": { backgroundColor: "rgba(0,0,0,.045)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#161616" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#b03d0a" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(0,0,0,.13)" },
  ".cm-tooltip": { backgroundColor: "var(--surface-raised)", border: "1px solid var(--line-strong)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "10px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--surface-sunken)", color: "var(--text)" },
  ".cm-lint-marker-warning": { color: "#b03d0a" },
}, { dark: false });

const geometry = (s: EditorSettings) => EditorView.theme({
  ".cm-scroller": { fontFamily: FONTS[s.font], fontSize: `${s.fontSize}px`, lineHeight: `${s.lineHeight}px` },
  ".cm-content": { padding: "8px 0" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px" },
});

/** `#%%` sections: a rule above the header and the header itself in the signal colour. */
const cellRule = Decoration.line({ class: "cm-cell-line" });
const cellTag = Decoration.mark({ class: "cm-cell-tag" });

function cellDecorations(view: EditorView): DecorationSet {
  const marks: ReturnType<typeof cellRule.range>[] = [];
  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      const match = /^\s*#%%/.exec(line.text);
      if (match) {
        marks.push(cellRule.range(line.from));
        marks.push(cellTag.range(line.from + match[0].indexOf("#%%"), line.from + match[0].length));
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(marks, true);
}

const cellSections = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = cellDecorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) this.decorations = cellDecorations(update.view);
  }
}, { decorations: (v) => v.decorations });

const KEYWORDS = [
  "function", "end", "if", "elseif", "else", "for", "while", "begin", "let", "struct", "mutable",
  "return", "using", "import", "module", "const", "try", "catch", "finally", "do", "quote", "macro",
  "global", "local", "where", "break", "continue",
];
const BUILTINS = [
  "sin", "cos", "tan", "asin", "acos", "atan", "exp", "log", "sqrt", "abs", "hypot", "floor", "ceil",
  "round", "zeros", "ones", "eye", "rand", "linspace", "range", "length", "size", "sum", "mean",
  "maximum", "minimum", "clamp", "mod", "rem", "meshgrid", "surf", "plot", "figure", "colormap",
  "view", "clim", "savefig", "writematrix", "load", "print", "println",
];
const SNIPPETS: Completion[] = [
  snippetCompletion("function ${name}(${args})\n    ${}\nend", { label: "function", detail: "snippet", type: "keyword" }),
  snippetCompletion("for ${i} in ${}\n    ${}\nend", { label: "for", detail: "snippet", type: "keyword" }),
  snippetCompletion("if ${}\n    ${}\nend", { label: "if", detail: "snippet", type: "keyword" }),
  snippetCompletion("using ${}", { label: "using", detail: "snippet", type: "keyword" }),
];

/** The lint seam: a MATLAB habit is flagged today, kernel diagnostics plug in here later. */
const habitLint = linter((view): Diagnostic[] => {
  const out: Diagnostic[] = [];
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    if (line.text.trimStart().startsWith("#")) continue; // comments, including #%% cells
    const at = line.text.indexOf("%");
    if (at >= 0) out.push({ from: line.from + at, to: line.from + at + 1, severity: "warning", message: "Julia comments start with #, not %." });
  }
  return out;
});

type AnswerKind = "heat" | "spark" | "dots" | "chart" | "ok" | "run" | "type";

/** A right-hand token: the shape/value a line produced, as in the design study. */
class AnswerMarker extends GutterMarker {
  constructor(
    private readonly text: string,
    private readonly kind: AnswerKind,
    private readonly onClick?: () => void,
  ) { super(); }
  eq(other: AnswerMarker) { return this.text === other.text && this.kind === other.kind; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-answer k-${this.kind}${this.onClick ? " click" : ""}`;
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
    if (this.onClick) {
      el.style.pointerEvents = "auto";
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
      el.addEventListener("click", (e) => { e.preventDefault(); this.onClick?.(); });
    }
    return el;
  }
}

type ChartKind = "3d" | "2d";

type OnChart = (kind: ChartKind, line: string) => void;

const dims = (vars: Record<string, NumValue>) => {
  const n = vars["n"];
  return typeof n === "number" && Number.isFinite(n) ? `${n} × ${n}` : "grid";
};

/** Values and functions in scope at a line: the session plus everything above it. */
function scopeAt(view: EditorView, from: number, base: Record<string, NumValue>, baseFunctions: FunctionTable) {
  const vars = { ...base };
  let functions = { ...baseFunctions };
  const here = view.state.doc.lineAt(from).number;
  for (let i = 1; i <= here; i++) {
    const text = view.state.doc.line(i).text.trim();
    const definition = defineFunction(text, functions);
    if (definition) { functions = definition; continue; }
    const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(text);
    if (!assign) continue;
    const res = evaluate(assign[2], vars, functions);
    if (res.ok) vars[assign[1]] = res.value;
  }
  return { vars, functions };
}

function answerFor(text: string, vars: Record<string, NumValue>, functions: FunctionTable, onChart?: OnChart): AnswerMarker | null {
  const t = text.trim();
  if (!t || t.startsWith("#")) return null;
  if (defineFunction(t)) return new AnswerMarker("function", "type");
  const assign = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(t);
  if (assign) {
    const res = evaluate(assign[2], vars, functions);
    if (res.ok) {
      const v = variableFrom(assign[1], res.value);
      if (v.type === "Float64") return new AnswerMarker(Number.isInteger(v.value) ? "Int64" : "Float64", "type");
      return new AnswerMarker(v.shape, v.type.startsWith("Matrix") ? "heat" : "spark");
    }
  }
  if (/^sel\s*=/.test(t)) return new AnswerMarker("selection", "dots");
  const peak = /^A\s*=\s*peaks\s*\(\s*(\d+)\s*\)/.exec(t);
  if (peak) return new AnswerMarker(`${peak[1]} × ${peak[1]}`, "heat");
  if (/\b(surf|mesh|imagesc)\b/.test(t)) return new AnswerMarker("→ chart", "chart", () => onChart?.("3d", t));
  if (/\bplot\b/.test(t)) return new AnswerMarker("→ chart", "chart", () => onChart?.("2d", t));
  if (/\bsubplot\b/.test(t)) return new AnswerMarker("subplot", "type");
  if (/\boptimize\s*\(/.test(t)) return new AnswerMarker("→ optimize", "run");
  if (/\bstate_space\b/.test(t)) return new AnswerMarker("→ run", "run");
  if (/\b(colormap|view|clim)\b/.test(t)) return new AnswerMarker("ok", "ok");
  if (/\bhypot\b/.test(t)) return new AnswerMarker(dims(vars), "spark");
  if (/\bmeshgrid\b/.test(t)) return new AnswerMarker(dims(vars), "heat");
  if (/^A\s*=/.test(t)) return new AnswerMarker(dims(vars), "heat");
  return null;
}

const answerGutter = (getVars: () => Record<string, NumValue>, getFunctions: () => FunctionTable, onChart?: OnChart) => gutter({
  class: "cm-answer-gutter",
  side: "after",
  lineMarker(view, line) {
    const scope = scopeAt(view, line.from, getVars(), getFunctions());
    return answerFor(view.state.doc.lineAt(line.from).text, scope.vars, scope.functions, onChart);
  },
  initialSpacer: () => new AnswerMarker("512 × 512", "heat"),
});

export function CodeEditor({
  value, file, onChange, settings, variables, functions, onChart, onRunSelection, onPos,
}: {
  value: string;
  file: string;
  onChange: (value: string) => void;
  settings: EditorSettings;
  variables: readonly { name: string; type: string; value?: NumValue }[];
  functions?: FunctionTable;
  onChart?: OnChart;
  onRunSelection?: (code: string, mode: "cell" | "line" | "selection") => void;
  onPos?: (pos: { line: number; col: number; selected: number }) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const vars = useRef(variables);
  vars.current = variables;
  const fns = useRef(functions ?? {});
  fns.current = functions ?? {};
  const varMap = () => Object.fromEntries(vars.current.map((v) => [v.name, v.value ?? 0]));
  const fnMap = () => fns.current;
  const chart = useRef(onChart);
  chart.current = onChart;
  const runSelection = useRef(onRunSelection);
  runSelection.current = onRunSelection;
  const pos = useRef(onPos);
  pos.current = onPos;

  const compartments = useRef({
    theme: new Compartment(), font: new Compartment(), wrap: new Compartment(),
    tab: new Compartment(), auto: new Compartment(), brackets: new Compartment(), lint: new Compartment(),
    answers: new Compartment(),
  }).current;

  const runAt = (mode: "cell" | "line"): boolean => {
    const instance = view.current;
    if (!instance || !runSelection.current) return false;
    const sel = instance.state.selection.main;
    if (!sel.empty) {
      runSelection.current(instance.state.sliceDoc(sel.from, sel.to), "selection");
      return true;
    }
    if (mode === "line") {
      const line = instance.state.doc.lineAt(sel.head);
      runSelection.current(line.text, "line");
      return true;
    }
    const doc = instance.state.doc;
    const here = doc.lineAt(sel.head).number;
    let start = 1, end = doc.lines;
    for (let i = here; i >= 1; i--) {
      if (doc.line(i).text.trimStart().startsWith("#%%")) { start = i; break; }
    }
    for (let i = here + 1; i <= doc.lines; i++) {
      if (doc.line(i).text.trimStart().startsWith("#%%")) { end = i - 1; break; }
    }
    runSelection.current(doc.sliceString(doc.line(start).from, doc.line(end).to), "cell");
    return true;
  };

  const source: CompletionSource = (context) => {
    const word = context.matchBefore(/[A-Za-z_]\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const options: Completion[] = [
      ...KEYWORDS.map((label) => ({ label, type: "keyword", boost: 1 })),
      ...BUILTINS.map((label) => ({ label, type: "function" })),
      ...SNIPPETS,
      ...vars.current.map((v) => ({ label: v.name, type: "variable", detail: v.type, boost: 6 })),
      ...Object.entries(fns.current).map(([name, fn]) => ({ label: name, type: "function", detail: `(${fn.params.join(", ")})`, boost: 7 })),
    ];
    return { from: word.from, options };
  };

  const autocompleteExt = () => autocompletion({ override: [source], activateOnTyping: true, icons: true });
  const bracketExt = () => [bracketMatching(), closeBrackets()];
  const lintExt = () => [lintGutter(), habitLint];
  const themeExt = () => [settings.theme === "dark" ? darkTheme : lightTheme, syntaxHighlighting(settings.theme === "dark" ? darkHighlight : lightHighlight)];

  useEffect(() => {
    const instance = new EditorView({
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
          indentOnInput(),
          Prec.high(keymap.of([
            { key: "Mod-Enter", run: () => runAt("cell") },
            { key: "Shift-Enter", run: () => runAt("line") },
          ])),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, ...closeBracketsKeymap, ...completionKeymap]),
          StreamLanguage.define(julia),
          compartments.theme.of(themeExt()),
          compartments.font.of(geometry(settings)),
          compartments.wrap.of(settings.wrap ? EditorView.lineWrapping : []),
          compartments.tab.of(EditorState.tabSize.of(settings.tabSize)),
          compartments.auto.of(settings.autocomplete ? autocompleteExt() : []),
          compartments.brackets.of(settings.brackets ? bracketExt() : []),
          compartments.lint.of(settings.lint ? lintExt() : []),
          compartments.answers.of(answerGutter(varMap, fnMap, (kind, line) => chart.current?.(kind, line))),
          cellSections,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) {
              const sel = u.state.selection.main;
              const line = u.state.doc.lineAt(sel.head);
              pos.current?.({ line: line.number, col: sel.head - line.from + 1, selected: sel.to - sel.from });
            }
          }),
        ],
      }),
      parent: host.current!,
    });
    view.current = instance;
    const first = instance.state.selection.main;
    const firstLine = instance.state.doc.lineAt(first.head);
    pos.current?.({ line: firstLine.number, col: first.head - firstLine.from + 1, selected: first.to - first.from });
    return () => { instance.destroy(); view.current = null; };
    // `key={file}` in the parent remounts for another document.
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        compartments.theme.reconfigure(themeExt()),
        compartments.font.reconfigure(geometry(settings)),
        compartments.wrap.reconfigure(settings.wrap ? EditorView.lineWrapping : []),
        compartments.tab.reconfigure(EditorState.tabSize.of(settings.tabSize)),
        compartments.auto.reconfigure(settings.autocomplete ? autocompleteExt() : []),
        compartments.brackets.reconfigure(settings.brackets ? bracketExt() : []),
        compartments.lint.reconfigure(settings.lint ? lintExt() : []),
      ],
    });
  }, [settings]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.answers.reconfigure(answerGutter(varMap, fnMap, (kind, line) => chart.current?.(kind, line))),
    });
  }, [variables, functions]);

  return <div className="cm-host" ref={host} aria-label={`${file} editor`} />;
}
