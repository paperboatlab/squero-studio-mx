import { defineFunction, evaluate, variableFrom, type FunctionTable, type NumValue } from "../kernel/localEval.ts";

export type AnswerKind = "heat" | "spark" | "dots" | "chart" | "ok" | "run" | "type";

export type AnswerSpec = {
  text: string;
  kind: AnswerKind;
  title?: string;
  data?: number[] | number[][];
  figureLine?: number;
};

export type AnswerVariable = {
  name: string;
  type: string;
  shape?: string;
  preview?: number[];
  value?: number | boolean | string | number[] | number[][];
};

type EvalScalarOrArray =
  | { kind: "value"; value: NumValue }
  | { kind: "synthetic"; shape: string; type: string; kindTag: AnswerKind; preview?: number[] };

type ScannedLine = {
  code: string;
  masked: string;
  startContinuation: boolean;
  startLocalDepth: number;
};

const FIGURE_CALL = /\b(Figure|Axis3?|Colorbar|Legend|Label|axislegend|annotation!|(lines|scatter|scatterlines|linesegments|stem|stairs|barplot|hist|errorbars|band|area|heatmap|image|contourf?|text|hlines|vlines|ablines|poly|series|multiline|surface|mesh|wireframe)!?)\s*\(/;
const SAVE_CALL = /\b(save|to_html|snapshot|save_snapshot)\s*\(/;
const OPTIMIZE_CALL = /\boptimize\s*\(/;
const SIMULATE_CALL = /\bsimulate\s*\(/;

const IDENT_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const IDENT_BANG_RE = /^[\p{L}_][\p{L}\p{N}_]*!?$/u;
const JULIA_KEYWORDS = new Set([
  "if", "else", "elseif", "for", "while", "function", "struct", "mutable", "module", "baremodule",
  "using", "import", "export", "const", "global", "local", "return", "begin", "let", "try",
  "catch", "finally", "macro", "quote", "do", "end", "true", "false", "nothing", "in", "isa",
  "where", "abstract", "primitive", "type",
]);

const LOCAL_OPENERS = new Set(["function", "for", "while", "let", "macro", "struct", "module", "baremodule", "do"]);
const BLOCK_OPENERS = new Set(["if", "begin", "try", "quote"]);
const CONTINUATION_END_RE = /(?:&&|\|\||=>|::|[+\-*/\\^%&|=,?:])$/;
const DEFAULT_CONSTANTS: Record<string, NumValue> = { π: Math.PI, pi: Math.PI };

function isWordChar(ch: string): boolean {
  return /[\p{L}\p{N}_!]/u.test(ch);
}

function isIdentPrefix(ch: string): boolean {
  return /[\p{L}\p{N}_!)\]}']/u.test(ch);
}

/**
 * Scan every line once to strip `#` / `#=...=#` comments, mask string/symbol literals,
 * and track delimiter depth, continuation lines, and local block (`for`/`function`/`let`) depth.
 */
function analyzeLines(lines: readonly string[]): ScannedLine[] {
  const out: ScannedLine[] = [];
  let blockCommentDepth = 0;
  let inTripleQuote = false;
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let prevCont = false;
  const scopeStack: ("local" | "block")[] = [];

  for (const raw of lines) {
    const startLocalDepth = scopeStack.filter((k) => k === "local").length;
    const startContinuation = blockCommentDepth > 0 || inTripleQuote || paren > 0 || bracket > 0 || brace > 0 || prevCont;
    let code = "";
    let masked = "";
    let inString = false;
    let escapeNext = false;
    let n = 0;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const next = raw[i + 1] ?? "";

      if (blockCommentDepth > 0) {
        if (ch === "#" && next === "=") { blockCommentDepth++; i++; }
        else if (ch === "=" && next === "#") { blockCommentDepth--; i++; }
        continue;
      }

      if (inTripleQuote) {
        code += ch;
        masked += " ";
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === "\\") { escapeNext = true; continue; }
        if (raw.startsWith('"""', i)) {
          code += '""';
          masked += "  ";
          i += 2;
          inTripleQuote = false;
        }
        continue;
      }

      if (inString) {
        code += ch;
        masked += ch === '"' ? '"' : " ";
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === "\\") { escapeNext = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }

      // Comments outside strings
      if (ch === "#" && next === "=") { blockCommentDepth++; i++; continue; }
      if (ch === "#") break;

      // Triple-quoted or regular double-quoted strings
      if (raw.startsWith('"""', i)) {
        inTripleQuote = true;
        code += '"""';
        masked += '"" ';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = true;
        code += ch;
        masked += '"';
        continue;
      }

      // Char literals `'x'` or `'\n'` (as opposed to transpose `'`, e.g. `A'`)
      if (ch === "'") {
        const prev = i > 0 ? raw[i - 1] : "";
        if (!isIdentPrefix(prev)) {
          const m = /^'(\\.|[^'\\])'/.exec(raw.slice(i));
          if (m) {
            code += m[0];
            masked += "''".padEnd(m[0].length, " ");
            i += m[0].length - 1;
            continue;
          }
        }
      }

      // Symbol literals `:foo`, `:end`, `:for`, etc. (ignore `::` and ranges like `a:b`)
      if (ch === ":" && next !== ":" && (i === 0 || !isIdentPrefix(raw[i - 1]))) {
        const sym = /^:([\p{L}_][\p{L}\p{N}_!]*)/u.exec(raw.slice(i));
        if (sym) {
          code += sym[0];
          masked += ":sym".padEnd(sym[0].length, " ").slice(0, sym[0].length);
          i += sym[0].length - 1;
          continue;
        }
      }

      code += ch;
      masked += ch;

      if (ch === "(") paren++;
      else if (ch === ")") paren = Math.max(0, paren - 1);
      else if (ch === "[") bracket++;
      else if (ch === "]") bracket = Math.max(0, bracket - 1);
      else if (ch === "{") brace++;
      else if (ch === "}") brace = Math.max(0, brace - 1);
      else if (paren === 0 && bracket === 0 && brace === 0 && isWordChar(ch) && (i === 0 || !isWordChar(raw[i - 1]))) {
        let j = i + 1;
        while (j < raw.length && isWordChar(raw[j])) j++;
        const word = raw.slice(i, j);
        if (LOCAL_OPENERS.has(word)) scopeStack.push("local");
        else if (BLOCK_OPENERS.has(word)) scopeStack.push("block");
        else if (word === "end" && scopeStack.length > 0) scopeStack.pop();
      }
      n++;
    }

    const trimmedMasked = masked.trim();
    const isLineActive = blockCommentDepth === 0 && !inTripleQuote && n > 0;
    prevCont = isLineActive && CONTINUATION_END_RE.test(trimmedMasked);

    out.push({
      code: code.trim(),
      masked: trimmedMasked,
      startContinuation,
      startLocalDepth,
    });
  }

  return out;
}

/** Format scalar numbers cleanly, preserving Float64 `.0` distinction when known. */
export function formatScalar(n: number, juliaType?: string, rhsSource?: string): string {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? "NaN" : n > 0 ? "Inf" : "-Inf";
  if (Number.isInteger(n)) {
    const looksFloat = juliaType ? juliaType.includes("Float") : rhsSource !== undefined && /^-?\d+\.\d*$/.test(rhsSource.trim());
    if (looksFloat) return `${n}.0`;
    return String(n);
  }
  if (Math.abs(n) >= 1e4 || (Math.abs(n) < 1e-3 && n !== 0)) return n.toExponential(1);
  return String(Number(n.toFixed(3)));
}

/** Shorten verbose Julia parametric types such as `@NamedTuple{...}` or `Surface{Tuple{...}}`. */
export function shortTypeName(rawType: string): string {
  const leaf = rawType.replace(/^@/, "").split(".").pop() ?? rawType;
  const brace = leaf.indexOf("{");
  if (brace < 0) return leaf;
  if (leaf.startsWith("NamedTuple")) return "NamedTuple";
  if (leaf.length <= 18 && !leaf.slice(brace + 1).includes("{")) return leaf;
  return leaf.slice(0, brace);
}

/** Find the index of the top-level assignment `=` in a masked line, or -1 if none. */
function findAssignmentEquals(masked: string): number {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "=" && paren === 0 && bracket === 0 && brace === 0) {
      const prev = i > 0 ? masked[i - 1] : "";
      const next = masked[i + 1] ?? "";
      if (next === "=" || next === ">") { i++; continue; }
      if ("<>!=:+-*/\\^%&|÷~".includes(prev)) continue;
      return i;
    }
  }
  return -1;
}

/** Split string at top-level delimiter `,` or `;`, ignoring delimiters inside brackets or strings. */
function splitTopLevel(expr: string, sep: "," | ";"): string[] {
  const parts: string[] = [];
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let inString = false;
  let escapeNext = false;
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inString) {
      if (escapeNext) escapeNext = false;
      else if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "{") brace++;
    else if (ch === "}") brace = Math.max(0, brace - 1);
    else if (ch === sep && paren === 0 && bracket === 0 && brace === 0) {
      parts.push(expr.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
}

function unwrapParens(text: string): string {
  let s = text.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let coversAll = true;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      if (depth === 0) { coversAll = false; break; }
    }
    if (!coversAll) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

function parseTargets(lhsMasked: string): string[] | null {
  let raw = unwrapParens(lhsMasked.trim());
  raw = raw.replace(/^(?:const|global|local)\s+/, "").trim();
  const pieces = splitTopLevel(raw, ",").filter((p, idx, arr) => !(p === "" && idx === arr.length - 1 && arr.length > 1));
  if (pieces.length === 0) return null;
  for (const p of pieces) {
    if (!IDENT_RE.test(p) || JULIA_KEYWORDS.has(p)) return null;
  }
  return pieces;
}

function parseShortFunctionHeader(lhsMasked: string): { name: string; params: string } | null {
  const m = /^\s*([\p{L}_][\p{L}\p{N}_!]*)\s*\(([\s\S]*)\)\s*$/u.exec(lhsMasked);
  if (!m || JULIA_KEYWORDS.has(m[1])) return null;
  // Ensure the outer `(...)` encloses the entire parameter list rather than two separate calls.
  let depth = 1;
  const body = m[2];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    if (depth === 0) return null;
  }
  return depth === 1 ? { name: m[1], params: body.trim() } : null;
}

function parseLongFunctionHeader(code: string): string | null {
  const m = /^(?:function|macro)\s+([\p{L}_][\p{L}\p{N}_!]*)/u.exec(code);
  return m ? m[1] : /^(?:function|macro)\b/.test(code) ? "" : null;
}

function preprocessLocalMath(expr: string): string {
  // Expand Julia implicit coefficient before π/pi (e.g., `4π` -> `(4 * π)`), outside words/strings.
  return expr
    .trim()
    .replace(/;+\s*$/, "")
    .replace(/(?<![\p{L}\p{N}_])(\d+(?:\.\d+)?)\s*(π|pi)\b/gu, "($1 * $2)");
}

function tryEvalRange(rhs: string, scopeVars: Record<string, NumValue>, functions: FunctionTable): EvalScalarOrArray | null {
  let inner = rhs.trim().replace(/;+\s*$/, "");
  const collectMatch = /^collect\s*\(([\s\S]*)\)$/.exec(inner);
  if (collectMatch) inner = collectMatch[1].trim();

  const call = /^(range|LinRange)\s*\(([\s\S]*)\)$/.exec(inner);
  if (!call) return null;
  const isLinRange = call[1] === "LinRange";
  const semi = splitTopLevel(call[2], ";");
  if (semi.length > 2) return null;

  const positional: string[] = [];
  const kwargs: Record<string, string> = {};
  for (const part of semi.flatMap((chunk) => splitTopLevel(chunk, ","))) {
    if (!part) continue;
    const eq = findAssignmentEquals(part);
    if (eq > 0 && IDENT_RE.test(part.slice(0, eq).trim())) {
      kwargs[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    } else {
      positional.push(part);
    }
  }

  const evalNum = (src: string | undefined): number | null => {
    if (!src) return null;
    const res = evaluate(preprocessLocalMath(src), scopeVars, functions);
    return res.ok && typeof res.value === "number" && Number.isFinite(res.value) ? res.value : null;
  };

  let start = evalNum(positional[0] ?? kwargs.start);
  let stop = evalNum(positional[1] ?? kwargs.stop);
  let length = evalNum(isLinRange ? positional[2] : kwargs.length);
  const step = evalNum(kwargs.step);

  if (start === null) return null;
  if (stop === null && length !== null) {
    const s = step ?? 1;
    stop = start + (Math.max(1, Math.round(length)) - 1) * s;
  }
  if (stop === null) return null;
  if (length === null && step !== null && step !== 0) {
    length = Math.floor((stop - start) / step) + 1;
  }
  if (length === null || !Number.isInteger(length) || length < 0 || length > 1_000_000) return null;

  if (length <= 5000) {
    const arr: number[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(length === 1 ? start : start + ((stop - start) * i) / (length - 1));
    }
    return { kind: "value", value: arr };
  }

  const preview: number[] = [];
  for (let i = 0; i < 40; i++) preview.push(start + ((stop - start) * i) / 39);
  return { kind: "synthetic", shape: String(length), type: "Vector{Float64}", kindTag: "spark", preview };
}

function evalRhsLocally(rhs: string, scopeVars: Record<string, NumValue>, functions: FunctionTable): EvalScalarOrArray | null {
  const varsWithConsts = "π" in scopeVars && "pi" in scopeVars ? scopeVars : { ...DEFAULT_CONSTANTS, ...scopeVars };
  const rangeRes = tryEvalRange(rhs, varsWithConsts, functions);
  if (rangeRes) return rangeRes;

  const cleaned = preprocessLocalMath(rhs);
  if (!cleaned) return null;
  const res = evaluate(cleaned, varsWithConsts, functions);
  if (!res.ok) return null;
  return { kind: "value", value: res.value };
}

function answerFromNumValue(name: string, value: NumValue, wsVar?: AnswerVariable, rhsSource?: string): AnswerSpec {
  if (typeof value === "number") {
    const scalarType = wsVar && typeof wsVar.value === "number" && wsVar.value === value ? wsVar.type : undefined;
    const label = formatScalar(value, scalarType, rhsSource);
    return {
      text: label,
      kind: "type",
      title: scalarType ? `${name} :: ${scalarType} = ${value}` : `${name} = ${value}`,
    };
  }
  const meta = variableFrom(name, value);
  const isMatrix = meta.type.startsWith("Matrix");
  return {
    text: meta.shape,
    kind: isMatrix ? "heat" : "spark",
    data: Array.isArray(value) ? value : undefined,
    title: `${name} :: ${meta.type} (${meta.shape})`,
  };
}

function answerFromWorkspace(v: AnswerVariable): { text: string; kind: AnswerKind; title: string; data?: number[] | number[][] } {
  if (v.type === "Function") {
    return { text: "function", kind: "type", title: `${v.name} :: Function` };
  }
  if (v.type === "Figure") {
    const shapeSuffix = v.shape && v.shape !== "—" ? ` (${v.shape})` : "";
    return { text: "→ figure", kind: "chart", title: `${v.name} :: Figure${shapeSuffix}` };
  }
  if (typeof v.value === "number") {
    return {
      text: formatScalar(v.value, v.type),
      kind: "type",
      title: `${v.name} :: ${v.type} = ${v.value}`,
    };
  }
  if (typeof v.value === "boolean") {
    return { text: String(v.value), kind: "type", title: `${v.name} :: ${v.type} = ${v.value}` };
  }
  if (typeof v.value === "string") {
    const brief = v.value.length > 14 ? `${v.value.slice(0, 13)}…` : v.value;
    return { text: `"${brief}"`, kind: "type", title: `${v.name} :: ${v.type} = ${JSON.stringify(v.value)}` };
  }
  if (v.type.startsWith("Matrix") || (Array.isArray(v.value) && Array.isArray(v.value[0]))) {
    const matrix = Array.isArray(v.value) && Array.isArray(v.value[0]) ? (v.value as number[][]) : undefined;
    return {
      text: v.shape && v.shape !== "—" ? v.shape : "matrix",
      kind: "heat",
      data: matrix,
      title: `${v.name} :: ${v.type}${v.shape ? ` (${v.shape})` : ""}`,
    };
  }
  if (v.type.startsWith("Vector") || Array.isArray(v.value)) {
    const vec = Array.isArray(v.value) ? (v.value as number[]) : v.preview;
    return {
      text: v.shape && v.shape !== "—" ? v.shape : String(vec?.length ?? "vector"),
      kind: "spark",
      data: vec,
      title: `${v.name} :: ${v.type}${v.shape ? ` (${v.shape})` : ""}`,
    };
  }
  if (v.type === "Nothing") {
    return { text: "nothing", kind: "type", title: `${v.name} :: Nothing` };
  }
  const typeText = shortTypeName(v.type);
  const shapeInfo = v.shape && v.shape !== "—" && v.shape !== "1" ? ` (${v.shape})` : "";
  return {
    text: typeText,
    kind: "type",
    title: `${v.name} :: ${v.type}${shapeInfo}`,
  };
}

/**
 * Compute all right-hand answer chips for a Julia script in a single linear pass,
 * combining incremental local evaluation with live Julia workspace metadata.
 */
export function computeLineAnswers(
  lines: readonly string[],
  workspace: readonly AnswerVariable[],
  baseFunctions: FunctionTable = {},
): (AnswerSpec | null)[] {
  const wsMap = new Map<string, AnswerVariable>();
  const scopeVars: Record<string, NumValue> = {};
  for (const v of workspace) {
    wsMap.set(v.name, v);
    if (typeof v.value === "number" || Array.isArray(v.value)) {
      scopeVars[v.name] = v.value;
    }
  }
  let functions: FunctionTable = { ...baseFunctions };
  const scanned = analyzeLines(lines);

  return scanned.map((line, index): AnswerSpec | null => {
    const lineNum = index + 1;
    const { code, masked, startContinuation, startLocalDepth } = line;
    if (!code) return null;

    // Long-form `function f(...)` / `macro m(...)`
    if (!startContinuation) {
      const longFn = parseLongFunctionHeader(code);
      if (longFn !== null) {
        return { text: "function", kind: "type", title: longFn ? `${longFn} :: Function` : "Function" };
      }

      const eqHeader = findAssignmentEquals(masked);
      if (eqHeader > 0) {
        const shortFn = parseShortFunctionHeader(masked.slice(0, eqHeader));
        if (shortFn !== null) {
          const eqCode = findAssignmentEquals(code);
          const headerParams = eqCode > 0 ? code.slice(0, eqCode).replace(/^[^(]*\(/, "").replace(/\)\s*$/, "").trim() : shortFn.params;
          const nextFns = defineFunction(code, functions);
          if (nextFns) functions = nextFns;
          const params = functions[shortFn.name]?.params.join(", ") ?? headerParams;
          return {
            text: "function",
            kind: "type",
            title: params ? `${shortFn.name}(${params}) :: Function` : `${shortFn.name}() :: Function`,
          };
        }
      }
    }

    // Action calls outside strings/comments still show inside conditionals/loops.
    if (!startContinuation) {
      if (SAVE_CALL.test(masked)) return { text: "→ file", kind: "ok", title: "Save output file" };
      if (FIGURE_CALL.test(masked)) {
        const eq = findAssignmentEquals(masked);
        const target = eq > 0 ? parseTargets(masked.slice(0, eq))?.[0] : undefined;
        const ws = target ? wsMap.get(target) : undefined;
        const detail = ws ? `${ws.name} :: ${ws.type}${ws.shape && ws.shape !== "—" ? ` (${ws.shape})` : ""} — click to focus figure` : "Click to focus figure";
        return { text: "→ figure", kind: "chart", figureLine: lineNum, title: detail };
      }
      if (OPTIMIZE_CALL.test(masked)) return { text: "→ optimize", kind: "run", title: "Optimization run" };
      if (SIMULATE_CALL.test(masked)) return { text: "→ run", kind: "run", title: "Simulation run" };
    }

    if (startContinuation) return null;

    const eqIdx = findAssignmentEquals(masked);
    if (eqIdx > 0) {
      const lhsMasked = masked.slice(0, eqIdx);
      const rhsCode = code.slice(eqIdx + 1).trim();
      const rhsMasked = masked.slice(eqIdx + 1).trim();

      // Assignments inside `for` / `function` / `let` blocks stay local — never show stale global workspace values.
      if (startLocalDepth > 0) return null;

      const targets = parseTargets(lhsMasked);
      if (!targets) return null;

      if (targets.length === 1) {
        const name = targets[0];
        const local = evalRhsLocally(rhsCode, scopeVars, functions);
        if (local) {
          if (local.kind === "value") {
            scopeVars[name] = local.value;
            return answerFromNumValue(name, local.value, wsMap.get(name), rhsCode);
          }
          return {
            text: local.shape,
            kind: local.kindTag,
            data: local.preview,
            title: `${name} :: ${local.type} (${local.shape})`,
          };
        }
        const ws = wsMap.get(name);
        if (!ws) return null;
        if (typeof ws.value === "number" || Array.isArray(ws.value)) {
          scopeVars[name] = ws.value;
        }
        return answerFromWorkspace(ws);
      }

      // Multi-target tuple destructuring: `σ, ρ, β = 10.0, 28.0, 8 / 3` or `zmin, at = findmin(Z)`
      const rhsItems = splitTopLevel(unwrapParens(rhsCode), ",");
      const rhsMaskedItems = splitTopLevel(unwrapParens(rhsMasked), ",");
      if (rhsItems.length === targets.length && rhsMaskedItems.length === targets.length) {
        const texts: string[] = [];
        const titles: string[] = [];
        let allLocal = true;
        const pendingVars: [string, NumValue][] = [];
        for (let i = 0; i < targets.length; i++) {
          const name = targets[i];
          const res = evalRhsLocally(rhsItems[i], scopeVars, functions);
          if (!res || res.kind !== "value") { allLocal = false; break; }
          pendingVars.push([name, res.value]);
          const formatted = answerFromNumValue(name, res.value, wsMap.get(name), rhsItems[i]);
          texts.push(formatted.text);
          titles.push(formatted.title ?? name);
        }
        if (allLocal) {
          for (const [k, v] of pendingVars) scopeVars[k] = v;
          return { text: texts.join(", "), kind: "type", title: titles.join(" · ") };
        }
      }

      const wsTexts: string[] = [];
      const wsTitles: string[] = [];
      let primaryKind: AnswerKind = "type";
      let primaryData: number[] | number[][] | undefined;
      for (const name of targets) {
        const ws = wsMap.get(name);
        if (ws) {
          if (typeof ws.value === "number" || Array.isArray(ws.value)) scopeVars[name] = ws.value;
          const formatted = answerFromWorkspace(ws);
          wsTexts.push(formatted.text);
          wsTitles.push(formatted.title);
          if (targets.length === 1 || (!primaryData && formatted.data)) {
            primaryKind = formatted.kind;
            primaryData = formatted.data;
          }
        } else if (name in scopeVars) {
          const formatted = answerFromNumValue(name, scopeVars[name]);
          wsTexts.push(formatted.text);
          wsTitles.push(formatted.title ?? name);
        }
      }
      if (wsTexts.length > 0) {
        return {
          text: wsTexts.join(", "),
          kind: wsTexts.length === 1 ? primaryKind : "type",
          data: wsTexts.length === 1 ? primaryData : undefined,
          title: wsTitles.join(" · "),
        };
      }
      return null;
    }

    // Standalone trailing `fig` (bare identifier bound to a Figure in workspace) -> clickable `→ figure`.
    if (startLocalDepth === 0 && IDENT_BANG_RE.test(masked) && !JULIA_KEYWORDS.has(masked)) {
      const ws = wsMap.get(masked);
      if (ws?.type === "Figure") {
        return {
          text: "→ figure",
          kind: "chart",
          figureLine: lineNum,
          title: `${ws.name} :: Figure${ws.shape && ws.shape !== "—" ? ` (${ws.shape})` : ""} — click to focus figure`,
        };
      }
    }

    return null;
  });
}
