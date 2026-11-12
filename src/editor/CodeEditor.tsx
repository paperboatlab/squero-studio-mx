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
  HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput,
} from "@codemirror/language";
import { julia } from "./julia.ts";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
  snippetCompletion, type Completion, type CompletionSource,
} from "@codemirror/autocomplete";
import { tags } from "@lezer/highlight";
import { defineFunction, evaluate, variableFrom, type FunctionTable, type NumValue } from "../kernel/localEval.ts";
import { LATEX_SYMBOLS } from "./unicode.ts";

export type EditorSettings = {
  theme: "ui" | "dark" | "light";
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
  theme: "ui", fontSize: 12, font: "geist", lineHeight: 22,
  tabSize: 2, wrap: true, autocomplete: true, brackets: true, lint: true,
};

const FONTS: Record<EditorSettings["font"], string> = {
  geist: "var(--font-mono)",
  system: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  serif: "ui-serif, Georgia, Cambria, serif",
};

const darkHighlight = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: "#6f737a", fontStyle: "italic" },
  { tag: [tags.keyword, tags.operatorKeyword, tags.typeOperator], color: "#c792ea" },
  { tag: tags.string, color: "#98c379" },
  { tag: tags.special(tags.string), color: "#56b6c2" },
  { tag: tags.escape, color: "#d19a66" },
  { tag: [tags.number, tags.bool, tags.null], color: "#e5c07b" },
  { tag: tags.atom, color: "#56b6c2" },
  { tag: tags.operator, color: "#a6adc8" },
  { tag: tags.punctuation, color: "#7f848e" },
  { tag: tags.variableName, color: "#d6d6d0" },
  { tag: tags.propertyName, color: "#61afef" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#61afef" },
  { tag: tags.standard(tags.variableName), color: "#56b6c2" },
  { tag: tags.typeName, color: "#e5c07b" },
  { tag: tags.macroName, color: "#c678dd" },
  { tag: tags.definition(tags.variableName), color: "#f2f2ee", fontWeight: "600" },
  { tag: tags.definition(tags.typeName), color: "#f2f2ee", fontWeight: "600" },
  { tag: tags.special(tags.variableName), color: "#e06c75" },
  { tag: tags.invalid, color: "#e06c75", textDecoration: "underline wavy" },
]);

const lightHighlight = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: "#7a7a73", fontStyle: "italic" },
  { tag: [tags.keyword, tags.operatorKeyword, tags.typeOperator], color: "#7c3aed" },
  { tag: tags.string, color: "#15803d" },
  { tag: tags.special(tags.string), color: "#0f766e" },
  { tag: tags.escape, color: "#b45309" },
  { tag: [tags.number, tags.bool, tags.null], color: "#b45309" },
  { tag: tags.atom, color: "#0f766e" },
  { tag: tags.operator, color: "#55554f" },
  { tag: tags.punctuation, color: "#8a8a84" },
  { tag: tags.variableName, color: "#161616" },
  { tag: tags.propertyName, color: "#1d4ed8" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#1d4ed8" },
  { tag: tags.standard(tags.variableName), color: "#0f766e" },
  { tag: tags.typeName, color: "#a16207" },
  { tag: tags.macroName, color: "#9333ea" },
  { tag: tags.definition(tags.variableName), color: "#000000", fontWeight: "600" },
  { tag: tags.definition(tags.typeName), color: "#000000", fontWeight: "600" },
  { tag: tags.special(tags.variableName), color: "#b42318" },
  { tag: tags.invalid, color: "#b42318", textDecoration: "underline wavy" },
]);

const darkTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "#d6d6d0" },
  ".cm-content": { caretColor: "var(--signal)" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "#4f4f4a" },
  ".cm-activeLine": { backgroundColor: "rgba(255,255,255,.045)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#f2f2ee" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--signal)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(255,255,255,.18)" },
  ".cm-selectionMatch": { backgroundColor: "rgba(255,255,255,.08)" },
  ".cm-matchingBracket, .cm-nonmatchingBracket": { backgroundColor: "rgba(255,255,255,.1)", outline: "1px solid #4a4a4a" },
  ".cm-tooltip": { backgroundColor: "#191919", border: "1px solid #3a3a3a", color: "#d6d6d0", fontFamily: "var(--font-mono)", fontSize: "10px", borderRadius: "5px", boxShadow: "0 8px 22px rgb(0 0 0 / .5)" },
  ".cm-tooltip.cm-tooltip-autocomplete": { overflow: "hidden" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "11px", maxHeight: "16em", padding: "3px" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 7px", lineHeight: "1.5", borderLeft: "2px solid transparent" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "transparent", color: "#f2f2ee", borderLeftColor: "var(--signal)" },
  ".cm-completionDetail": { color: "#8a8a84", fontStyle: "normal", fontSize: "9.5px", marginLeft: "8px" },
  ".cm-completionMatchedText": { color: "var(--signal)", textDecoration: "none" },
  ".cm-completionInfo": { backgroundColor: "#191919", border: "1px solid #3a3a3a", color: "#d6d6d0", padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: "10px" },
  ".cm-lintRange-warning": { textDecorationColor: "var(--signal)" },
  ".cm-lint-marker-warning": { color: "var(--signal)" },
  ".cm-answer-gutter": { borderLeftColor: "rgba(255,255,255,.06)" },
  ".cm-answer": { borderColor: "rgba(255,255,255,.14)", backgroundColor: "rgba(255,255,255,.04)", color: "#9d9d97" },
}, { dark: true });

const lightTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#f2f2ef", color: "#161616" },
  ".cm-content": { caretColor: "#b03d0a" },
  ".cm-gutters": { backgroundColor: "#eaeae6", border: "none", color: "#9d9d97" },
  ".cm-activeLine": { backgroundColor: "rgba(0,0,0,.045)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#161616" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#b03d0a" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(0,0,0,.13)" },
  ".cm-selectionMatch": { backgroundColor: "rgba(0,0,0,.06)" },
  ".cm-matchingBracket, .cm-nonmatchingBracket": { backgroundColor: "rgba(0,0,0,.08)", outline: "1px solid #9d9d97" },
  ".cm-tooltip": { backgroundColor: "#f2f2ef", border: "1px solid #161616", color: "#161616", fontFamily: "var(--font-mono)", fontSize: "10px", borderRadius: "5px", boxShadow: "0 8px 22px rgb(0 0 0 / .16)" },
  ".cm-tooltip.cm-tooltip-autocomplete": { overflow: "hidden" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "11px", maxHeight: "16em", padding: "3px" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 7px", lineHeight: "1.5", borderLeft: "2px solid transparent" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "transparent", color: "#161616", borderLeftColor: "#b03d0a" },
  ".cm-completionDetail": { color: "#6f6f69", fontStyle: "normal", fontSize: "9.5px", marginLeft: "8px" },
  ".cm-completionMatchedText": { color: "#b03d0a", textDecoration: "none" },
  ".cm-completionInfo": { backgroundColor: "#f2f2ef", border: "1px solid #161616", color: "#161616", padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: "10px" },
  ".cm-lintRange-warning": { textDecorationColor: "#b03d0a" },
  ".cm-lint-marker-warning": { color: "#b03d0a" },
  ".cm-answer-gutter": { borderLeftColor: "rgba(0,0,0,.1)" },
  ".cm-answer": { borderColor: "rgba(0,0,0,.18)", backgroundColor: "rgba(0,0,0,.035)", color: "#55554f" },
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
  "global", "local", "where", "break", "continue", "abstract", "primitive", "baremodule", "public",
  "export", "outer", "in", "isa",
];
const BUILTINS = [
  "sin", "cos", "tan", "asin", "acos", "atan", "exp", "log", "sqrt", "abs", "hypot", "floor", "ceil",
  "round", "zeros", "ones", "eye", "rand", "linspace", "range", "length", "size", "sum", "mean",
  "maximum", "minimum", "clamp", "mod", "rem", "meshgrid", "surf", "plot", "figure", "colormap",
  "view", "clim", "savefig", "writematrix", "load", "print", "println", "display", "show",
  "read", "write", "open", "close", "parse", "string", "collect", "reshape", "transpose",
  "inv", "det", "norm", "dot", "cross", "sort", "filter", "map", "reduce", "enumerate", "zip",
  "push!", "pop!", "append!", "keys", "values", "haskey", "get", "merge", "copy", "fill",
  "repeat", "vcat", "hcat", "first", "last", "isempty", "isnan", "isinf", "isfinite",
];
const MACROS = ["@time", "@elapsed", "@show", "@. ", "@which", "@assert", "@boundscheck", "@inline"];
const SNIPPETS: Completion[] = [
  snippetCompletion("function ${name}(${args})\n    ${}\nend", { label: "function", detail: "snippet", type: "snippet" }),
  snippetCompletion("for ${i} in ${}\n    ${}\nend", { label: "for", detail: "snippet", type: "snippet" }),
  snippetCompletion("if ${}\n    ${}\nend", { label: "if", detail: "snippet", type: "snippet" }),
  snippetCompletion("let ${}\n    ${}\nend", { label: "let", detail: "snippet", type: "snippet" }),
  snippetCompletion("using ${}", { label: "using", detail: "snippet", type: "snippet" }),
  snippetCompletion("@time ${}", { label: "@time", detail: "snippet", type: "snippet" }),
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
  value, file, onChange, settings, appTheme, variables, functions, onChart, onRunSelection, onPos,
}: {
  value: string;
  file: string;
  onChange: (value: string) => void;
  settings: EditorSettings;
  appTheme: "light" | "dark";
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
    const word = context.matchBefore(/[@A-Za-z_]\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const options: Completion[] = [
      ...vars.current.map((v) => ({ label: v.name, type: "variable", detail: v.type, boost: 9 })),
      ...Object.entries(fns.current).map(([name, fn]) => ({ label: name, type: "function", detail: `(${fn.params.join(", ")})`, boost: 10 })),
      ...KEYWORDS.map((label) => ({ label, type: "keyword", detail: "keyword", boost: 1 })),
      ...MACROS.map((label) => ({ label: label.trim(), type: "keyword", detail: "macro", boost: 2 })),
      ...BUILTINS.map((label) => ({ label, type: "function", detail: "builtin", boost: 2 })),
      ...SNIPPETS,
    ];
    return { from: word.from, options };
  };

  /** `\pi` + Tab, the Julia REPL habit; returns false so Tab still indents when it has no match. */
  const insertLatex = (instance: EditorView): boolean => {
    const sel = instance.state.selection.main;
    if (!sel.empty) return false;
    const line = instance.state.doc.lineAt(sel.head);
    const before = instance.state.sliceDoc(line.from, sel.head);
    const match = /\\([A-Za-z]+)$/.exec(before);
    const symbol = match ? LATEX_SYMBOLS[match[1]] : undefined;
    if (!match || !symbol) return false;
    const from = sel.head - match[0].length;
    instance.dispatch({
      changes: { from, to: sel.head, insert: symbol },
      selection: { anchor: from + symbol.length },
    });
    return true;
  };

  const latexSource: CompletionSource = (context) => {
    const word = context.matchBefore(/\\[A-Za-z]*/);
    if (!word) return null;
    const typed = word.text.slice(1).toLowerCase();
    const options: Completion[] = Object.entries(LATEX_SYMBOLS)
      .filter(([name]) => !typed || name.toLowerCase().startsWith(typed))
      .slice(0, 80)
      .map(([name, symbol]) => ({ label: `\\${name}`, apply: symbol, detail: symbol, type: "unicode", boost: 100 }));
    return options.length ? { from: word.from, options } : null;
  };

  const autocompleteExt = () => autocompletion({ override: [source, latexSource], activateOnTyping: true, icons: true });
  const bracketExt = () => [bracketMatching(), closeBrackets()];
  const lintExt = () => [lintGutter(), habitLint];
  const resolvedTheme = settings.theme === "ui" ? appTheme : settings.theme;
  const themeExt = () => [resolvedTheme === "dark" ? darkTheme : lightTheme, syntaxHighlighting(resolvedTheme === "dark" ? darkHighlight : lightHighlight)];

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
            { key: "Tab", run: insertLatex },
          ])),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, ...closeBracketsKeymap, ...completionKeymap]),
          julia,
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
  }, [settings, appTheme]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.answers.reconfigure(answerGutter(varMap, fnMap, (kind, line) => chart.current?.(kind, line))),
    });
  }, [variables, functions]);

  return <div className="cm-host" ref={host} aria-label={`${file} editor`} />;
}
