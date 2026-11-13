// The script editor: the shared Studio editor (@paperboat/shared/editor) with Julia: the stream
// parser, `#%%` cells, completions (keywords, builtins, the live workspace, `\\pi` symbols), the
// `%`-comment lint, run-cell keys and the clickable answer tokens on the right.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EditorView, gutter, GutterMarker, Decoration, ViewPlugin, type DecorationSet, type KeyBinding, type ViewUpdate,
} from "@codemirror/view";
import { CodeEditor as StudioEditor, type EditorPos, type EditorSettings } from "@paperboat/shared/editor";
import { julia } from "./julia.ts";
import { linter, type Diagnostic } from "@codemirror/lint";
import { snippetCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import type { FunctionTable } from "../kernel/localEval.ts";
import { computeLineAnswers, type AnswerSpec, type AnswerVariable } from "./answers.ts";
import { LATEX_SYMBOLS } from "./unicode.ts";

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

/** The answer tokens follow the editor's own theme, which can differ from the app's. */
const answerTheme = {
  dark: EditorView.theme({
    ".cm-answer-gutter": { borderLeftColor: "rgba(255,255,255,.06)" },
    ".cm-answer": { borderColor: "rgba(255,255,255,.14)", backgroundColor: "rgba(255,255,255,.04)", color: "#9d9d97" },
  }, { dark: true }),
  light: EditorView.theme({
    ".cm-answer-gutter": { borderLeftColor: "rgba(0,0,0,.1)" },
    ".cm-answer": { borderColor: "rgba(0,0,0,.18)", backgroundColor: "rgba(0,0,0,.035)", color: "#55554f" },
  }, { dark: false }),
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
  onPos?: (pos: EditorPos) => void;
  /** HEAD's copy of this file for the git gutter; null when it is untracked or not in a repository. */
  base?: string | null;
}) {
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

  const runAt = (instance: EditorView, mode: "cell" | "line"): boolean => {
    if (!runSelection.current) return false;
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

  // Read once at mount by the shared editor; they reach the live props through the refs above.
  const statics = useRef({
    language: [julia, cellSections],
    keys: [
      { key: "Mod-Enter", run: (v) => runAt(v, "cell") },
      { key: "Shift-Enter", run: (v) => runAt(v, "line") },
      { key: "Tab", run: insertLatex },
    ] as KeyBinding[],
    completions: [source, latexSource],
  }).current;

  // The answer tokens fold away when the editor gets narrow (with a little hysteresis).
  const [view, setView] = useState<EditorView | null>(null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!view) return;
    let prev = foldedForWidth(view.dom.clientWidth, false);
    setFolded(prev);
    const resize = new ResizeObserver((entries) => {
      const next = foldedForWidth(entries[0]?.contentRect.width ?? view.dom.clientWidth, prev);
      if (next !== prev) { prev = next; setFolded(next); }
    });
    resize.observe(view.dom);
    return () => resize.disconnect();
  }, [view]);

  const resolved = settings.theme === "ui" ? appTheme : settings.theme;
  const extra = useMemo(
    () => [answerTheme[resolved], folded ? [] : answerGutter(varList, fnMap, (line) => figureLink.current?.(line))],
    [resolved, folded, variables, functions],
  );

  return (
    <StudioEditor
      value={value}
      onChange={onChange}
      settings={settings}
      appTheme={appTheme}
      ariaLabel={`${file} editor`}
      language={statics.language}
      keys={statics.keys}
      completions={statics.completions}
      lint={habitLint}
      extra={extra}
      base={base}
      onPos={onPos}
      onView={setView}
    />
  );
}
