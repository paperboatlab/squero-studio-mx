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
import type { FunctionTable } from "../kernel/localEval.ts";
import { computeLineAnswers, type AnswerSpec, type AnswerVariable } from "./answers.ts";
import { LATEX_SYMBOLS } from "./unicode.ts";
import { gitGutter } from "./gitGutter.ts";

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
  // Opaque: the sticky gutters (line numbers, answers) sit over text scrolled sideways when wrap is off.
  ".cm-gutters": { backgroundColor: "var(--surface-screen)", border: "none", color: "#4f4f4a" },
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

const FOLD_ANSWERS_WIDTH = 376;
const UNFOLD_ANSWERS_WIDTH = 396;

function foldedForWidth(width: number, prev: boolean): boolean {
  if (width <= 0) return prev;
  return prev ? width < UNFOLD_ANSWERS_WIDTH : width < FOLD_ANSWERS_WIDTH;
}

function sameData(a: number[] | number[][] | undefined, b: number[] | number[][] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  if (Array.isArray(a[0]) || Array.isArray(b[0])) {
    const ma = a as number[][];
    const mb = b as number[][];
    const cols = ma[0]?.length ?? 0;
    if (cols !== (mb[0]?.length ?? 0)) return false;
    for (let k = 0; k < 8; k++) {
      const r = Math.min(ma.length - 1, Math.floor((k / 7) * (ma.length - 1)));
      const c = Math.min(Math.max(0, cols - 1), Math.floor((k / 7) * Math.max(0, cols - 1)));
      if (ma[r]?.[c] !== mb[r]?.[c]) return false;
    }
    return true;
  }
  const va = a as number[];
  const vb = b as number[];
  for (let k = 0; k < 8; k++) {
    const idx = Math.min(va.length - 1, Math.floor((k / 7) * (va.length - 1)));
    if (va[idx] !== vb[idx]) return false;
  }
  return true;
}

/** A right-hand token: the accurate shape, value, or figure link for a line. */
class AnswerMarker extends GutterMarker {
  constructor(
    private readonly spec: AnswerSpec,
    private readonly onClick?: () => void,
  ) { super(); }
  eq(other: AnswerMarker) {
    return this.spec.text === other.spec.text
      && this.spec.kind === other.spec.kind
      && this.spec.title === other.spec.title
      && this.spec.figureLine === other.spec.figureLine
      && sameData(this.spec.data, other.spec.data);
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-answer k-${this.spec.kind}${this.onClick ? " click" : ""}`;
    if (this.spec.title) el.title = this.spec.title;

    if (this.spec.kind === "heat" && Array.isArray(this.spec.data) && Array.isArray(this.spec.data[0])) {
      const mat = this.spec.data as number[][];
      const rows = mat.length;
      const cols = mat[0]?.length ?? 0;
      if (rows > 0 && cols > 0) {
        let min = Infinity;
        let max = -Infinity;
        const rStep = Math.max(1, Math.floor(rows / 24));
        const cStep = Math.max(1, Math.floor(cols / 24));
        for (let r = 0; r < rows; r += rStep) {
          for (let c = 0; c < cols; c += cStep) {
            const v = mat[r][c];
            if (Number.isFinite(v)) {
              if (v < min) min = v;
              if (v > max) max = v;
            }
          }
        }
        if (Number.isFinite(min) && Number.isFinite(max)) {
          const canvas = document.createElement("canvas");
          canvas.width = 48; canvas.height = 20;
          const g = canvas.getContext("2d")!;
          const span = max - min;
          for (let x = 0; x < 24; x++) {
            const c = Math.min(cols - 1, Math.floor((x / 24) * cols));
            for (let y = 0; y < 10; y++) {
              const r = Math.min(rows - 1, Math.floor((y / 10) * rows));
              const raw = mat[r]?.[c];
              const v = Number.isFinite(raw) && span > 0 ? (raw - min) / span : 0.5;
              g.fillStyle = `hsl(${250 - v * 190}, ${60 + v * 20}%, ${20 + v * 45}%)`;
              g.fillRect(x * 2, y * 2, 2, 2);
            }
          }
          el.append(canvas);
        }
      }
    } else if (this.spec.kind === "spark" && Array.isArray(this.spec.data) && typeof this.spec.data[0] === "number") {
      const vec = (this.spec.data as number[]).filter((v) => Number.isFinite(v));
      if (vec.length >= 2) {
        let min = Infinity;
        let max = -Infinity;
        for (const v of vec) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const canvas = document.createElement("canvas");
        canvas.width = 48; canvas.height = 20;
        const g = canvas.getContext("2d")!;
        g.strokeStyle = "#ff5a1f";
        g.lineWidth = 2;
        g.beginPath();
        const span = max - min;
        for (let x = 0; x < 48; x++) {
          const idx = Math.min(vec.length - 1, Math.floor((x / 47) * (vec.length - 1)));
          const norm = span > 0 ? (vec[idx] - min) / span : 0.5;
          const y = 17 - norm * 14;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
        el.append(canvas);
      }
    }

    const label = document.createElement("span");
    label.className = "cm-answer-text";
    label.textContent = this.spec.text;
    el.append(label);

    if (this.onClick) {
      el.style.pointerEvents = "auto";
      el.addEventListener("pointerdown", (e) => e.stopPropagation());
      el.addEventListener("click", (e) => { e.preventDefault(); this.onClick?.(); });
    }
    return el;
  }
}

/** Show the figure an editor line drew into (1-based line number). */
type OnFigure = (line: number) => void;

const answerGutter = (
  getVars: () => readonly AnswerVariable[],
  getFunctions: () => FunctionTable,
  onFigure?: OnFigure,
) => {
  let cache: {
    doc: EditorView["state"]["doc"];
    vars: readonly AnswerVariable[];
    fns: FunctionTable;
    answers: (AnswerSpec | null)[];
  } | null = null;

  const answersFor = (view: EditorView) => {
    const doc = view.state.doc;
    const vars = getVars();
    const fns = getFunctions();
    if (cache && cache.doc === doc && cache.vars === vars && cache.fns === fns) {
      return cache.answers;
    }
    const lines = Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1).text);
    const answers = computeLineAnswers(lines, vars, fns);
    cache = { doc, vars, fns, answers };
    return answers;
  };

  return gutter({
    class: "cm-answer-gutter",
    side: "after",
    lineMarker(view, line) {
      const lineNum = view.state.doc.lineAt(line.from).number;
      const spec = answersFor(view)[lineNum - 1];
      if (!spec) return null;
      const figLine = spec.figureLine;
      return new AnswerMarker(spec, figLine !== undefined ? () => onFigure?.(figLine) : undefined);
    },
    initialSpacer: () => new AnswerMarker({ text: "60 × 60", kind: "heat" }),
  });
};

export function CodeEditor({
  value, file, onChange, settings, appTheme, variables, functions, onFigure, onRunSelection, onPos, base,
}: {
  value: string;
  file: string;
  onChange: (value: string) => void;
  settings: EditorSettings;
  appTheme: "light" | "dark";
  variables: readonly AnswerVariable[];
  functions?: FunctionTable;
  onFigure?: OnFigure;
  onRunSelection?: (code: string, mode: "cell" | "line" | "selection") => void;
  onPos?: (pos: { line: number; col: number; selected: number }) => void;
  /** HEAD's copy of this file for the git gutter; null when it is untracked or not in a repository. */
  base?: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const answersFolded = useRef(false);
  const change = useRef(onChange);
  change.current = onChange;
  const vars = useRef(variables);
  vars.current = variables;
  const fns = useRef(functions ?? {});
  fns.current = functions ?? {};
  const varList = () => vars.current;
  const fnMap = () => fns.current;
  const figureLink = useRef(onFigure);
  figureLink.current = onFigure;
  const runSelection = useRef(onRunSelection);
  runSelection.current = onRunSelection;
  const pos = useRef(onPos);
  pos.current = onPos;

  const compartments = useRef({
    theme: new Compartment(), font: new Compartment(), wrap: new Compartment(),
    tab: new Compartment(), auto: new Compartment(), brackets: new Compartment(), lint: new Compartment(),
    answers: new Compartment(), git: new Compartment(),
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

  const answersExtension = (folded: boolean) => (
    folded ? [] : answerGutter(varList, fnMap, (line) => figureLink.current?.(line))
  );

  useEffect(() => {
    const container = host.current!;
    const initialFolded = foldedForWidth(container.clientWidth, false);
    answersFolded.current = initialFolded;
    container.dataset.answersFolded = String(initialFolded);

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
          compartments.git.of(base != null ? gitGutter(base) : []),
          compartments.answers.of(answersExtension(initialFolded)),
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
      parent: container,
    });
    view.current = instance;

    const resize = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? container.clientWidth;
      const next = foldedForWidth(width, answersFolded.current);
      if (next === answersFolded.current) return;
      answersFolded.current = next;
      container.dataset.answersFolded = String(next);
      instance.dispatch({ effects: compartments.answers.reconfigure(answersExtension(next)) });
    });
    resize.observe(container);

    const first = instance.state.selection.main;
    const firstLine = instance.state.doc.lineAt(first.head);
    pos.current?.({ line: firstLine.number, col: first.head - firstLine.from + 1, selected: first.to - first.from });
    return () => {
      resize.disconnect();
      instance.destroy();
      view.current = null;
    };
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
      effects: compartments.answers.reconfigure(answersExtension(answersFolded.current)),
    });
  }, [variables, functions]);

  useEffect(() => {
    view.current?.dispatch({ effects: compartments.git.reconfigure(base != null ? gitGutter(base) : []) });
  }, [base]);

  return <div className="cm-host" ref={host} aria-label={`${file} editor`} />;
}
