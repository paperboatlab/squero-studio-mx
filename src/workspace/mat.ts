// A tiny MAT v4 writer for the numeric workspace. MATLAB and Octave open v4 files directly;
// no kernel round trip and no library. Only double matrices, which is what the workspace has.
import type { WorkspaceVariable } from "../chart/samples.ts";

const enc = new TextEncoder();

function nameOf(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return clean.slice(0, 31) || "v";
}

function numeric(v: WorkspaceVariable): { rows: number; cols: number; data: number[] } | null {
  if (typeof v.value === "number") return { rows: 1, cols: 1, data: [v.value] };
  if (Array.isArray(v.value) && Array.isArray(v.value[0])) {
    const m = v.value as number[][];
    const rows = m.length, cols = m[0]?.length ?? 0;
    const data: number[] = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) data.push(m[r][c] ?? 0);
    return { rows, cols, data };
  }
  if (Array.isArray(v.value)) return { rows: 1, cols: v.value.length, data: v.value.map(Number) };
  if (v.preview?.length) return { rows: 1, cols: v.preview.length, data: v.preview };
  return null;
}

/** MATLAB v4: type, rows, cols, imagf, namelen, name + NUL, then column-major doubles. */
export function workspaceMat(vars: readonly WorkspaceVariable[]): Blob {
  const chunks: BlobPart[] = [];
  for (const v of vars) {
    const m = numeric(v);
    if (!m) continue;
    const name = nameOf(v.name);
    const nameBytes = enc.encode(name);
    const head = 20 + nameBytes.length + 1;
    const buf = new ArrayBuffer(head + 8 * m.data.length);
    const view = new DataView(buf);
    view.setInt32(0, 0, true);          // 0: double
    view.setInt32(4, m.rows, true);
    view.setInt32(8, m.cols, true);
    view.setInt32(12, 0, true);         // imaginary part: none
    view.setInt32(16, nameBytes.length + 1, true);
    new Uint8Array(buf, 20, nameBytes.length).set(nameBytes);
    new Uint8Array(buf, 20 + nameBytes.length, 1)[0] = 0;
    m.data.forEach((value, i) => view.setFloat64(head + i * 8, value, true));
    chunks.push(buf);
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

export function downloadMat(vars: readonly WorkspaceVariable[], filename: string): boolean {
  const blob = workspaceMat(vars);
  if (blob.size === 0) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
