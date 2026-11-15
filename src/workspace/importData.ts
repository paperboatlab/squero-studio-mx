// Data import, in the browser: delimited text (.csv .tsv .txt .dat), .json, .mat (v4 and v5,
// compressed or not) and .xlsx. Each file becomes sheets of numbers; the import dialog turns a
// sheet into one matrix or one vector per column. No library: text and XML by hand, zip and zlib
// through DecompressionStream. Text columns are left out (and named in the sheet's notes).

export type Sheet = {
  name: string;
  /** Column names when the first row was a header. */
  headers: string[] | null;
  /** Row-major numbers; a missing or text cell is NaN. */
  rows: number[][];
  notes: string[];
};
export type Imported = { sheets: Sheet[]; notes: string[] };
export type ImportValue = number | number[] | number[][];

export const IMPORT_EXTENSIONS = [".csv", ".tsv", ".txt", ".dat", ".json", ".mat", ".xlsx"];

/** A Julia identifier from any label: `Speed (m/s)` → `Speed_m_s`, `2x` → `_2x`. */
export function identifier(label: string, fallback = "data"): string {
  const clean = label.trim().replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, "");
  if (!clean) return fallback;
  return /^\p{N}/u.test(clean) ? `_${clean}` : clean;
}

const stem = (file: string) => file.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");

/** A cell as a number: "1.5", "-2e3", "Inf", "NaN"; anything else is null (text). Empty is NaN. */
export function cellNumber(cell: string | number | null | undefined): number | null {
  if (typeof cell === "number") return cell;
  const t = (cell ?? "").trim();
  if (!t) return NaN;
  const lower = t.toLowerCase();
  if (lower === "nan" || lower === "na") return NaN;
  if (/^[+-]?inf(inity)?$/.test(lower)) return lower.startsWith("-") ? -Infinity : Infinity;
  if (lower === "true") return 1;
  if (lower === "false") return 0;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/** A grid of cells as a sheet: a first row with text over numbers is the header; text columns go. */
export function sheetFromCells(name: string, cells: (string | number | null)[][]): Sheet {
  const notes: string[] = [];
  const rows = cells.filter((row) => row.some((c) => c !== null && String(c).trim() !== ""));
  const isText = (c: string | number | null) => cellNumber(c) === null;
  const real = (c: string | number | null) => { const n = cellNumber(c); return n !== null && !Number.isNaN(n); };
  const header = rows.length > 1 && rows[0].some(isText) && rows[1].some(real);
  const body = header ? rows.slice(1) : rows;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const keep: number[] = [];
  for (let c = 0; c < width; c++) {
    const numeric = body.some((r) => real(r[c] ?? null));
    if (numeric || body.every((r) => (r[c] ?? "") === "" || r[c] === null)) keep.push(c);
    else notes.push(`left out text column ${header ? `“${String(rows[0][c] ?? c + 1).trim()}”` : c + 1}`);
  }
  let texts = 0;
  const data = body.map((r) => keep.map((c) => {
    const n = cellNumber(r[c] ?? null);
    if (n === null) texts++;
    return n ?? NaN;
  }));
  if (texts) notes.push(`${texts} text cell${texts === 1 ? "" : "s"} read as NaN`);
  const headers = header ? keep.map((c, i) => String(rows[0][c] ?? "").trim() || `col${i + 1}`) : null;
  return { name, headers, rows: data, notes };
}

/** Split one line on `delim`, honouring double quotes ("a, b" and "" inside). Whitespace: runs of spaces/tabs. */
export function splitLine(line: string, delim: string): string[] {
  if (delim === " ") return line.trim().split(/\s+/);
  const out: string[] = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === delim) { out.push(cell); cell = ""; }
    else cell += ch;
  }
  out.push(cell);
  return out;
}

/** The delimiter that splits the first lines into the same number (> 1) of cells: tab, comma, semicolon or spaces. */
export function guessDelimiter(lines: string[], ext = ""): string {
  if (ext === ".tsv") return "\t";
  const sample = lines.slice(0, 20);
  let best = ext === ".csv" ? "," : " ", bestScore = 0;
  for (const d of ["\t", ",", ";", " "]) {
    const counts = sample.map((l) => splitLine(l, d).length);
    const steady = counts.filter((n) => n === counts[counts.length > 1 ? 1 : 0]).length;
    const score = counts[counts.length > 1 ? 1 : 0] > 1 ? steady * 10 + counts[0] : 0;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

export function parseDelimited(name: string, text: string, ext = ""): Sheet {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() && !/^\s*[#%]/.test(l));
  const delim = guessDelimiter(lines, ext);
  return sheetFromCells(name, lines.map((l) => splitLine(l, delim)));
}

// --- JSON ---------------------------------------------------------------------------------------

const isNum = (x: unknown): x is number => typeof x === "number";

/** Numbers, arrays of numbers, arrays of rows, records ({a: 1, b: 2}[]) and objects of those. */
export function parseJson(name: string, text: string): Imported {
  const notes: string[] = [];
  const sheets: Sheet[] = [];
  const add = (key: string, v: unknown): boolean => {
    if (isNum(v)) { sheets.push({ name: key, headers: null, rows: [[v]], notes: [] }); return true; }
    if (Array.isArray(v) && v.length && v.every(isNum)) { sheets.push({ name: key, headers: null, rows: v.map((x) => [x]), notes: [] }); return true; }
    if (Array.isArray(v) && v.length && v.every((r) => Array.isArray(r) && r.every(isNum))) {
      const width = Math.max(...(v as number[][]).map((r) => r.length));
      sheets.push({ name: key, headers: null, rows: (v as number[][]).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? NaN)), notes: [] });
      return true;
    }
    if (Array.isArray(v) && v.length && v.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
      const records = v as Record<string, unknown>[];
      const keys = [...new Set(records.flatMap((r) => Object.keys(r)))];
      sheets.push(sheetFromCells(key, [keys, ...records.map((r) => keys.map((k) => (isNum(r[k]) || typeof r[k] === "string" ? (r[k] as string | number) : null)))]));
      return true;
    }
    return false;
  };
  const value: unknown = JSON.parse(text);
  if (!add(name, value)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) if (!add(k, v)) notes.push(`left out “${k}”: not numbers`);
    } else notes.push("no numbers in this file");
  }
  return { sheets, notes };
}

// --- MAT ----------------------------------------------------------------------------------------

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Column-major data as rows. */
function rowsOf(data: ArrayLike<number>, rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => Number(data[c * rows + r])));
}

/** MAT v4: what MX itself exports, and Octave's -v4. Numeric full matrices; text and sparse are left out. */
function parseMat4(bytes: Uint8Array): Imported {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sheets: Sheet[] = [], notes: string[] = [];
  const SIZE = [8, 4, 4, 2, 2, 1];
  let at = 0;
  while (at + 20 <= bytes.length) {
    let little = true;
    let type = view.getInt32(at, true);
    if (type < 0 || type > 4052) { little = false; type = view.getInt32(at, false); }
    const rows = view.getInt32(at + 4, little), cols = view.getInt32(at + 8, little);
    const imag = view.getInt32(at + 12, little), namelen = view.getInt32(at + 16, little);
    const name = new TextDecoder().decode(bytes.subarray(at + 20, at + 20 + namelen)).replace(/\0.*$/, "");
    const p = Math.floor(type / 10) % 10, t = type % 10;
    const size = SIZE[p] ?? 8;
    const count = rows * cols;
    let data = at + 20 + namelen;
    if (t === 0) {
      const values = new Float64Array(count);
      for (let i = 0; i < count; i++, data += size) {
        values[i] = p === 0 ? view.getFloat64(data, little) : p === 1 ? view.getFloat32(data, little) : p === 2 ? view.getInt32(data, little)
          : p === 3 ? view.getInt16(data, little) : p === 4 ? view.getUint16(data, little) : view.getUint8(data);
      }
      sheets.push({ name, headers: null, rows: rowsOf(values, rows, cols), notes: imag ? ["imaginary part left out"] : [] });
    } else notes.push(`left out “${name}”: ${t === 1 ? "text" : "sparse"}`);
    at = at + 20 + namelen + count * size * (imag ? 2 : 1);
  }
  return { sheets, notes };
}

const MI = { INT8: 1, UINT8: 2, INT16: 3, UINT16: 4, INT32: 5, UINT32: 6, SINGLE: 7, DOUBLE: 9, INT64: 12, UINT64: 13, MATRIX: 14, COMPRESSED: 15 } as const;
const MX_CLASS: Record<number, string> = { 1: "cell array", 2: "struct", 3: "object", 4: "text", 5: "sparse matrix" };

type Element = { type: number; data: Uint8Array; next: number };

function element(view: DataView, bytes: Uint8Array, at: number, little: boolean, top: boolean): Element {
  const first = view.getUint32(at, little);
  if (first >>> 16 !== 0) return { type: first & 0xffff, data: bytes.subarray(at + 4, at + 4 + (first >>> 16)), next: at + 8 }; // small element
  const n = view.getUint32(at + 4, little);
  const pad = top && first === MI.COMPRESSED ? 0 : (8 - (n % 8)) % 8;
  return { type: first, data: bytes.subarray(at + 8, at + 8 + n), next: at + 8 + n + pad };
}

function numbers(el: Element, little: boolean): Float64Array {
  const v = new DataView(el.data.buffer, el.data.byteOffset, el.data.byteLength);
  const read: Record<number, [number, (o: number) => number]> = {
    [MI.DOUBLE]: [8, (o) => v.getFloat64(o, little)], [MI.SINGLE]: [4, (o) => v.getFloat32(o, little)],
    [MI.INT8]: [1, (o) => v.getInt8(o)], [MI.UINT8]: [1, (o) => v.getUint8(o)],
    [MI.INT16]: [2, (o) => v.getInt16(o, little)], [MI.UINT16]: [2, (o) => v.getUint16(o, little)],
    [MI.INT32]: [4, (o) => v.getInt32(o, little)], [MI.UINT32]: [4, (o) => v.getUint32(o, little)],
    [MI.INT64]: [8, (o) => Number(v.getBigInt64(o, little))], [MI.UINT64]: [8, (o) => Number(v.getBigUint64(o, little))],
  };
  const [size, get] = read[el.type] ?? [8, () => NaN];
  const out = new Float64Array(Math.floor(el.data.length / size));
  for (let i = 0; i < out.length; i++) out[i] = get(i * size);
  return out;
}

function matrix(el: Element, little: boolean): Sheet | string {
  const view = new DataView(el.data.buffer, el.data.byteOffset, el.data.byteLength);
  const parts: Element[] = [];
  for (let at = 0; at + 8 <= el.data.length;) { const e = element(view, el.data, at, little, false); parts.push(e); at = e.next; }
  const [flags, dims, nameEl, real] = parts;
  const fv = new DataView(flags.data.buffer, flags.data.byteOffset, flags.data.byteLength);
  const word = fv.getUint32(0, little);
  const cls = word & 0xff, complex = (word & 0x0800) !== 0;
  const shape = Array.from(numbers(dims, little));
  const name = new TextDecoder().decode(nameEl.data);
  if (MX_CLASS[cls]) return `left out “${name}”: ${MX_CLASS[cls]}`;
  if (shape.length > 2) return `left out “${name}”: ${shape.join(" × ")} (more than 2 dimensions)`;
  return { name, headers: null, rows: rowsOf(numbers(real, little), shape[0], shape[1]), notes: complex ? ["imaginary part left out"] : [] };
}

/** MAT v5 (MATLAB's default, -v6 and -v7): numeric arrays, compressed or not. */
async function parseMat5(bytes: Uint8Array): Promise<Imported> {
  const little = String.fromCharCode(bytes[126], bytes[127]) === "IM";
  const sheets: Sheet[] = [], notes: string[] = [];
  const read = async (buf: Uint8Array) => {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let at = 0; at + 8 <= buf.length;) {
      const el = element(view, buf, at, little, true);
      at = el.next;
      if (el.type === MI.COMPRESSED) await read(await inflate(el.data, "deflate"));
      else if (el.type === MI.MATRIX) {
        const got = matrix(el, little);
        if (typeof got === "string") notes.push(got); else sheets.push(got);
      }
    }
  };
  await read(bytes.subarray(128));
  return { sheets, notes };
}

export async function parseMat(bytes: Uint8Array): Promise<Imported> {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 116));
  if (head.startsWith("MATLAB 7.3")) throw new Error("MAT v7.3 is HDF5; save it with -v7 in MATLAB (or -v6) to import it here");
  return head.startsWith("MATLAB 5.0") ? parseMat5(bytes) : parseMat4(bytes);
}

// --- XLSX ---------------------------------------------------------------------------------------

/** The files of a zip, by name, inflated on demand. */
export function unzip(bytes: Uint8Array): Map<string, () => Promise<Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip file");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, () => Promise<Uint8Array>>();
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    files.set(name, () => (method === 0 ? Promise.resolve(data) : inflate(data, "deflate-raw")));
    at += 46 + nameLen + extra + comment;
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()]);
const textOf = (xml: string) => unescapeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** "AB" → 27 (0-based). */
const columnIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Every sheet of a workbook, cached values for formulas, dates as Excel serial numbers. */
export async function parseXlsx(bytes: Uint8Array): Promise<Imported> {
  const files = unzip(bytes);
  const read = async (name: string) => { const f = files.get(name); return f ? new TextDecoder().decode(await f()) : ""; };
  const strings = [...(await read("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = new Map([...(await read("xl/_rels/workbook.xml.rels")).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const sheets: Sheet[] = [];
  for (const m of (await read("xl/workbook.xml")).matchAll(/<sheet\b[^>]*>/g)) {
    const target = rels.get(attr(m[0], "r:id")) ?? "";
    const xml = await read(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    const cells: (string | number | null)[][] = [];
    for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attr(row[0], "r") ?? cells.length + 1) - 1;
      const line: (string | number | null)[] = [];
      for (const c of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[0], "r");
        const col = ref ? columnIndex(/^[A-Z]+/.exec(ref)?.[0] ?? "A") : line.length;
        const type = attr(c[0], "t");
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? "")?.[1];
        line[col] = type === "s" ? strings[Number(v)] ?? "" : type === "inlineStr" ? textOf(c[2] ?? "") : type === "str" || type === "e" ? unescapeXml(v ?? "") : v === undefined ? null : Number(v);
      }
      cells[r] = Array.from(line, (x) => x ?? null);
    }
    sheets.push(sheetFromCells(unescapeXml(attr(m[0], "name") ?? `Sheet${sheets.length + 1}`), Array.from(cells, (x) => x ?? [])));
  }
  return { sheets: sheets.filter((s) => s.rows.length), notes: sheets.filter((s) => !s.rows.length).map((s) => `left out empty sheet “${s.name}”`) };
}

// --- one entry point ----------------------------------------------------------------------------

export async function importFile(file: string, bytes: Uint8Array): Promise<Imported> {
  const ext = (/\.[^.]*$/.exec(file.toLowerCase())?.[0] ?? "");
  const name = identifier(stem(file));
  if (ext === ".mat") return parseMat(bytes);
  if (ext === ".xlsx") return parseXlsx(bytes);
  if (ext === ".xls") throw new Error("old .xls workbooks aren't read; save as .xlsx or .csv");
  const text = new TextDecoder().decode(bytes);
  if (ext === ".json") return parseJson(name, text);
  return { sheets: [parseDelimited(name, text, ext)], notes: [] };
}

/** A sheet's shape as MATLAB says it: 1 × 1 is a number, one row or one column is a vector. */
function valueOf(rows: number[][]): ImportValue {
  const r = rows.length, c = rows[0]?.length ?? 0;
  if (r === 1 && c === 1) return rows[0][0];
  if (c === 1) return rows.map((row) => row[0]);
  if (r === 1) return rows[0];
  return rows;
}

/** The variables a sheet becomes: one value named `name`, or one vector per column named by its header. */
/**
 * The variables a sheet becomes: one value named `name`, or one vector per column named by its header.
 * `reserved`: Julia's own names (`time`, `angle`, `sum`…), which get a `_` so a column never hides a function.
 */
export function sheetVariables(sheet: Sheet, as: "matrix" | "columns", name = identifier(sheet.name), reserved: ReadonlySet<string> = new Set()): { name: string; value: ImportValue }[] {
  const free = (v: string, used: ReadonlySet<string> = new Set()) => { while (used.has(v) || reserved.has(v)) v += "_"; return v; };
  if (as === "matrix" || !sheet.rows.length) return [{ name: free(name), value: valueOf(sheet.rows) }];
  const width = sheet.rows[0].length;
  const used = new Set<string>();
  return Array.from({ length: width }, (_, c) => {
    const v = free(identifier(sheet.headers?.[c] ?? "", `${name}_${c + 1}`), used);
    used.add(v);
    return { name: v, value: sheet.rows.map((row) => row[c]) };
  });
}
