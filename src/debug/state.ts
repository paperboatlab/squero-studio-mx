// Pure debugger state helpers: breakpoint CRUD, flattening, and local value formatting.
import type { BreakpointSpec, DebugLocal } from "../kernel/protocol.ts";

export type BreakpointMap = Record<string, BreakpointSpec[]>;
export type FileBreakpoint = BreakpointSpec & { file: string };
export type WatchEntry = { expr: string; text?: string; type?: string; error?: string };

export function toggleBreakpointList(map: BreakpointMap, file: string, line: number): BreakpointMap {
  if (!file || line < 1) return map;
  const current = map[file] ?? [];
  const exists = current.some((bp) => bp.line === line);
  const nextList = exists
    ? current.filter((bp) => bp.line !== line)
    : [...current, { line, enabled: true }].sort((a, b) => a.line - b.line);
  if (nextList.length === 0) {
    const copy = { ...map };
    delete copy[file];
    return copy;
  }
  return { ...map, [file]: nextList };
}

export function setBreakpointEnabled(map: BreakpointMap, file: string, line: number, enabled: boolean): BreakpointMap {
  const current = map[file];
  if (!current) return map;
  return {
    ...map,
    [file]: current.map((bp) => (bp.line === line ? { ...bp, enabled } : bp)),
  };
}

export function setBreakpointCondition(map: BreakpointMap, file: string, line: number, condition: string): BreakpointMap {
  const current = map[file];
  if (!current) return map;
  const trimmed = condition.trim();
  return {
    ...map,
    [file]: current.map((bp) => (bp.line === line ? { ...bp, condition: trimmed || undefined } : bp)),
  };
}

export function removeBreakpoint(map: BreakpointMap, file: string, line: number): BreakpointMap {
  const current = map[file];
  if (!current) return map;
  const nextList = current.filter((bp) => bp.line !== line);
  if (nextList.length === 0) {
    const copy = { ...map };
    delete copy[file];
    return copy;
  }
  return { ...map, [file]: nextList };
}

export function flattenBreakpoints(map: BreakpointMap): FileBreakpoint[] {
  const out: FileBreakpoint[] = [];
  for (const file of Object.keys(map).sort()) {
    for (const bp of [...(map[file] ?? [])].sort((a, b) => a.line - b.line)) {
      out.push({ ...bp, file });
    }
  }
  return out;
}

const fmtNum = (n: number): string => {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 1e4 || (Math.abs(n) < 1e-3 && n !== 0)) return n.toExponential(1);
  return String(Number(n.toFixed(3)));
};

export function formatDebugValue(item: DebugLocal): string {
  const raw = item.value;
  if (typeof raw === "number") return fmtNum(raw);
  if (typeof raw === "boolean" || typeof raw === "string") return String(raw);
  if (Array.isArray(item.preview) && item.preview.length > 0) {
    const head = item.preview.slice(0, 3).map((v) => (typeof v === "number" ? fmtNum(v) : String(v))).join(", ");
    return `[${head}${item.preview.length > 3 ? ", …" : ""}]`;
  }
  if (item.text) {
    const first = item.text.split("\n")[0]?.trim() ?? "";
    return first.length > 28 ? `${first.slice(0, 27)}…` : first;
  }
  return "—";
}
