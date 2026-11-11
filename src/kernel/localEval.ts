// A small, local Julia-like evaluator for the console before the kernel is attached.
// It handles numbers, vectors, matrices, arithmetic, ranges, common math functions and the
// MATLAB-style builders; anything else is clearly queued for squero-kernel/0.
import type { WorkspaceVariable } from "../chart/samples.ts";

export type NumValue = number | number[] | number[][];
export type EvalResult = { ok: true; value: NumValue; display: string } | { ok: false; error: string };

type Tok = { kind: "num" | "id" | "op" | "punc"; text: string; space: boolean };
const OPS = ["+", "-", "*", "/", "^", "%", ":"];
const PUNC = ["(", ")", ",", ";", "[", "]"];
const CONST: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E, Inf: Infinity, NaN: NaN };
const MATH: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  exp: Math.exp, log: Math.log, sqrt: Math.sqrt, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
};

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let space = false;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { space = true; i++; continue; }
    if (c === "." && /[*/^]/.test(src[i + 1] ?? "")) { out.push({ kind: "op", text: src[i + 1], space }); i += 2; space = false; continue; }
    if (/\d/.test(c) || (c === "." && /\d/.test(src[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ kind: "num", text: m[0], space });
      i += m[0].length; space = false; continue;
    }
    if (/[A-Za-z_π]/.test(c)) {
      const m = /^[A-Za-z0-9_π]+/.exec(src.slice(i))!;
      out.push({ kind: "id", text: m[0], space });
      i += m[0].length; space = false; continue;
    }
    if (OPS.includes(c)) { out.push({ kind: "op", text: c, space }); i++; space = false; continue; }
    if (PUNC.includes(c)) { out.push({ kind: "punc", text: c, space }); i++; space = false; continue; }
    throw new Error(`unexpected "${c}"`);
  }
  return out;
}

const num = (v: NumValue): v is number => typeof v === "number";
const vec = (v: NumValue): v is number[] => Array.isArray(v) && (v.length === 0 || typeof v[0] === "number");
const mat = (v: NumValue): v is number[][] => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]);
const rowsOf = (v: number[][]) => v.length;
const colsOf = (v: number[][]) => v[0]?.length ?? 0;

function mapValue(v: NumValue, f: (x: number) => number): NumValue {
  if (num(v)) return f(v);
  if (vec(v)) return v.map(f);
  return v.map((row) => row.map(f));
}
function zip(a: NumValue, b: NumValue, f: (x: number, y: number) => number): NumValue {
  if (num(a) && num(b)) return f(a, b);
  if (num(a) && vec(b)) return b.map((y) => f(a, y));
  if (vec(a) && num(b)) return a.map((x) => f(x, b));
  if (vec(a) && vec(b)) { if (a.length !== b.length) throw new Error("length mismatch"); return a.map((x, i) => f(x, b[i])); }
  if (mat(a) && num(b)) return a.map((row) => row.map((x) => f(x, b)));
  if (num(a) && mat(b)) return b.map((row) => row.map((y) => f(a, y)));
  if (mat(a) && mat(b)) {
    if (rowsOf(a) !== rowsOf(b) || colsOf(a) !== colsOf(b)) throw new Error("size mismatch");
    return a.map((row, i) => row.map((x, j) => f(x, b[i][j])));
  }
  throw new Error("cannot combine these shapes");
}
function mul(a: NumValue, b: NumValue): NumValue {
  if (mat(a) && mat(b)) {
    if (colsOf(a) !== rowsOf(b)) throw new Error("inner dimensions do not match");
    return Array.from({ length: rowsOf(a) }, (_, i) =>
      Array.from({ length: colsOf(b) }, (_, j) => a[i].reduce((s, _, k) => s + a[i][k] * b[k][j], 0)));
  }
  if (mat(a) && vec(b)) {
    if (colsOf(a) !== b.length) throw new Error("inner dimensions do not match");
    return a.map((row) => row.reduce((s, x, k) => s + x * b[k], 0));
  }
  return zip(a, b, (x, y) => x * y);
}
function bin(op: string, a: NumValue, b: NumValue): NumValue {
  switch (op) {
    case "+": return zip(a, b, (x, y) => x + y);
    case "-": return zip(a, b, (x, y) => x - y);
    case "*": return mul(a, b);
    case "/": return zip(a, b, (x, y) => x / y);
    case "%": return zip(a, b, (x, y) => x % y);
    case "^": return zip(a, b, (x, y) => x ** y);
    default: throw new Error(`unsupported operator ${op}`);
  }
}
function range(a: NumValue, step: NumValue, b: NumValue): number[] {
  if (!num(a) || !num(step) || !num(b)) throw new Error("a range needs three numbers");
  if (step === 0) throw new Error("a range step cannot be zero");
  const out: number[] = [];
  const n = Math.floor((b - a) / step + 1e-9);
  if (n < 0 || n > 100000) throw new Error("range too large");
  for (let i = 0; i <= n; i++) out.push(a + step * i);
  return out;
}
function zeros(rows: number, cols = rows): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}
function ones(rows: number, cols = rows): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1));
}
function eye(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}
function rand(rows: number, cols = rows): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.random()));
}
function linspace(a: number, b: number, n = 100): number[] {
  if (n <= 0) return [];
  if (n === 1) return [a];
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}
function asInt(v: NumValue): number {
  if (!num(v)) throw new Error("expected a number");
  return Math.trunc(v);
}
function call(name: string, args: NumValue[]): NumValue {
  if (name === "zeros" || name === "ones" || name === "rand") {
    const r = asInt(args[0] ?? 1);
    const c = args.length > 1 ? asInt(args[1]) : r;
    return name === "zeros" ? zeros(r, c) : name === "ones" ? ones(r, c) : rand(r, c);
  }
  if (name === "eye") return eye(asInt(args[0] ?? 1));
  if (name === "linspace") return linspace(args[0] as number, args[1] as number, args[2] === undefined ? 100 : asInt(args[2]));
  if (name === "range") return range(args[0], 1, args[1]);
  if (name === "length") return vec(args[0]) ? (args[0] as number[]).length : mat(args[0]) ? (args[0] as number[][]).length : 1;
  if (name === "sum") {
    if (vec(args[0])) return (args[0] as number[]).reduce((a, b) => a + b, 0);
    if (mat(args[0])) return (args[0] as number[][]).map((row) => row.reduce((a, b) => a + b, 0));
  }
  if (name === "mean" && vec(args[0])) return (args[0] as number[]).reduce((a, b) => a + b, 0) / (args[0] as number[]).length;
  if (name === "hypot") return Math.hypot(args[0] as number, args[1] as number);
  if (name === "min" || name === "max") {
    const f = name === "min" ? Math.min : Math.max;
    if (args.length === 2) return f(args[0] as number, args[1] as number);
    return (args[0] as number[]).reduce((a, b) => f(a, b));
  }
  if (name === "mod" || name === "rem") return zip(args[0], args[1], (x, y) => x % y);
  if (name === "clamp") return zip(args[0], args[1], (x, lo) => Math.min(args[2] as number, Math.max(lo, x)));
  const f = MATH[name];
  if (!f) throw new Error(`"${name}" is not in the local evaluator`);
  return mapValue(args[0], f);
}

class Parser {
  private i = 0;
  private readonly tokens: Tok[];
  private readonly vars: Record<string, NumValue>;
  constructor(tokens: Tok[], vars: Record<string, NumValue>) {
    this.tokens = tokens;
    this.vars = vars;
  }

  private peek(): Tok | undefined { return this.tokens[this.i]; }
  private eat(text: string): boolean {
    const t = this.peek();
    if (t && t.text === text) { this.i++; return true; }
    return false;
  }
  private expect(text: string): void { if (!this.eat(text)) throw new Error(`expected ${text}`); }

  parse(): NumValue {
    const v = this.range();
    if (this.i < this.tokens.length) throw new Error(`unexpected "${this.tokens[this.i].text}"`);
    return v;
  }

  private range(): NumValue {
    const a = this.add();
    if (!this.eat(":")) return a;
    const b = this.add();
    if (!this.eat(":")) return range(a, 1, b);
    const c = this.add();
    return range(a, b, c);
  }

  private add(): NumValue {
    let v = this.term();
    while (this.peek()?.text === "+" || this.peek()?.text === "-") {
      const op = this.tokens[this.i++].text;
      v = bin(op, v, this.term());
    }
    return v;
  }

  private term(): NumValue {
    let v = this.unary();
    while (this.peek()?.text === "*" || this.peek()?.text === "/" || this.peek()?.text === "%") {
      const op = this.tokens[this.i++].text;
      v = bin(op, v, this.unary());
    }
    return v;
  }

  private unary(): NumValue {
    if (this.eat("-")) return mapValue(this.unary(), (x) => -x);
    if (this.eat("+")) return this.unary();
    return this.power();
  }

  private power(): NumValue {
    let v = this.primary();
    if (this.eat("^")) v = bin("^", v, this.unary());
    return v;
  }

  private primary(): NumValue {
    const t = this.peek();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "num") { this.i++; return Number(t.text); }
    if (t.kind === "id") {
      this.i++;
      if (t.text in CONST) return CONST[t.text];
      if (this.eat("(")) {
        const args: NumValue[] = [];
        if (!this.eat(")")) {
          do { args.push(this.range()); } while (this.eat(","));
          this.expect(")");
        }
        return call(t.text, args);
      }
      if (t.text in this.vars) return this.vars[t.text];
      throw new Error(`"${t.text}" is not defined`);
    }
    if (t.text === "(") { this.i++; const v = this.range(); this.expect(")"); return v; }
    if (t.text === "[") {
      this.i++;
      const rows: number[][] = [];
      let row: number[] = [];
      if (this.eat("]")) return rows;
      for (;;) {
        const v = this.range();
        if (!num(v)) throw new Error("matrix cells must be numbers");
        row.push(v);
        if (this.eat(",")) continue;
        if (this.eat(";")) { rows.push(row); row = []; continue; }
        if (this.eat("]")) { rows.push(row); break; }
        const next = this.peek();
        if (next?.space) continue;
        throw new Error("expected , ; or ] in a matrix");
      }
      return rows;
    }
    throw new Error(`unexpected "${t.text}"`);
  }
}

function display(v: NumValue): string {
  if (num(v)) return String(v);
  if (vec(v)) return v.length > 8 ? `[${v.slice(0, 8).join(", ")}, …] (${v.length})` : `[${v.join(", ")}]`;
  return `${v.length} × ${v[0]?.length ?? 0} matrix`;
}

export function evaluate(source: string, vars: Record<string, NumValue>): EvalResult {
  try {
    const value = new Parser(tokenize(source), vars).parse();
    return { ok: true, value, display: display(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function variableFrom(name: string, value: NumValue): WorkspaceVariable {
  if (num(value)) return { name, type: "Float64", shape: "1", value };
  if (vec(value)) {
    return {
      name, type: "Vector{Float64}", shape: String(value.length),
      value: value.slice(0, 5000), preview: value.slice(0, 5),
    };
  }
  const cols = value[0]?.length ?? 0;
  return {
    name, type: "Matrix{Float64}", shape: `${value.length} × ${cols}`,
    value, preview: value.flat().slice(0, 5),
  };
}

export function varsOf(workspace: readonly WorkspaceVariable[]): Record<string, NumValue> {
  const out: Record<string, NumValue> = {};
  for (const v of workspace) out[v.name] = v.value ?? v.preview ?? 0;
  return out;
}
