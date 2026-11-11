// A tiny figure plan from the script: `subplot(m, n, p)` followed by `plot`, `surf`, `mesh`,
// `imagesc` or `scatter`. The kernel will own the real figure model; this is the scaffold's
// parser so the examples open the right tiles now.
export type FigureKind = "line" | "surface" | "heat" | "scatter";
export type FigureTile = { row: number; col: number; kind: FigureKind; title: string };
export type Figure = { rows: number; cols: number; tiles: FigureTile[]; explicit: boolean };

export function parseFigure(code: string): Figure | null {
  const statements = code
    .split(/[\n;]/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  let rows = 1, cols = 1;
  let current = { row: 1, col: 1 };
  let explicit = false;
  const tiles: FigureTile[] = [];
  for (const statement of statements) {
    const sp = /^subplot\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(statement);
    if (sp) {
      rows = Number(sp[1]); cols = Number(sp[2]);
      const p = Number(sp[3]);
      current = { row: Math.floor((p - 1) / cols) + 1, col: ((p - 1) % cols) + 1 };
      explicit = true;
      continue;
    }
    const call = /^(plot|surf|mesh|imagesc|heatmap|scatter)\s*\(/.exec(statement);
    if (!call) continue;
    if (!explicit) {
      cols = Math.max(cols, tiles.length + 1);
      current = { row: 1, col: tiles.length + 1 };
    }
    const kind: FigureKind = call[1] === "plot" ? "line" : call[1] === "scatter" ? "scatter" : call[1] === "imagesc" || call[1] === "heatmap" ? "heat" : "surface";
    tiles.push({ ...current, kind, title: statement });
  }
  return tiles.length ? { rows, cols, tiles, explicit } : null;
}
