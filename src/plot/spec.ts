// Chart and optimization specs, as the kernel and Paperboat emit them. This module only maps
// the shared schema onto the figure model; it has no solver and no parser of its own.
import type { Figure, FigureKind, FigureTile } from "./figure.ts";

export type ChartSeries = { x?: number[]; y?: number[]; z?: number[][] | number[]; label?: string; color?: string };
export type ChartSpec = {
  schema?: number;
  kind: "line" | "surface" | "heat" | "scatter" | "optimization";
  title?: string;
  grid?: [number, number];
  cell?: [number, number];
  series?: ChartSeries[];
  options?: { wireframe?: boolean; colormap?: string; point?: number[] };
};

export type OptimizationResult = {
  ok: boolean;
  kind?: "lp" | "qp" | "nlp";
  status?: string;
  objective?: number;
  iterations?: number;
  x?: number[];
  trace?: string[];
  grid?: { x: number[]; y: number[]; z: number[][] };
  error?: string;
};

const kinds = new Set<FigureKind>(["line", "surface", "heat", "scatter"]);

/** A matrix from the kernel: rows of numbers (a flat vector is not a field). */
export function matrix(value: unknown): number[][] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return Array.isArray(value[0]) ? (value as number[][]) : undefined;
}

export function figureFromCharts(charts: ChartSpec[] | undefined | null): Figure | null {
  if (!Array.isArray(charts) || charts.length === 0) return null;
  let rows = 1;
  let cols = 1;
  const tiles: FigureTile[] = [];
  for (const chart of charts) {
    const kind = chart.kind === "optimization" ? "surface" : chart.kind;
    if (!kinds.has(kind)) continue;
    const grid = chart.grid ?? [1, 1];
    rows = Math.max(rows, grid[0] || 1);
    cols = Math.max(cols, grid[1] || 1);
    const cell = chart.cell ?? [1, 1];
    const series = chart.series?.[0] ?? {};
    const tile: FigureTile = {
      row: cell[0] || 1,
      col: cell[1] || 1,
      kind,
      title: chart.title?.trim() || kind,
    };
    if (kind === "line") {
      tile.series = [{ x: series.x ?? [], y: series.y ?? [], label: series.label, color: series.color }];
    } else if (kind === "heat") {
      const z = matrix(series.z);
      if (!z) continue;
      tile.heat = z;
    } else if (kind === "scatter") {
      const x = series.x ?? [];
      const y = series.y ?? [];
      tile.points = x.map((value, index) => [value, y[index] ?? 0] as [number, number]);
    } else {
      const z = matrix(series.z);
      if (!z || !series.x || !series.y) continue;
      const point = chart.options?.point;
      tile.surface = {
        x: series.x,
        y: series.y,
        z,
        point: point?.length === 3 ? [point[0], point[1], point[2]] : undefined,
      };
    }
    tiles.push(tile);
  }
  return tiles.length ? { rows, cols, tiles, explicit: true } : null;
}

/** The solver's optimum as a 3D surface with the result marked, when it returned a grid. */
export function figureFromOptimization(result: OptimizationResult, title?: string): Figure | null {
  const grid = result.grid;
  const x = result.x ?? [];
  if (!grid || x.length < 2) return null;
  const point: [number, number, number] = [x[0], result.objective ?? 0, x[1]];
  return {
    rows: 1,
    cols: 1,
    explicit: true,
    tiles: [{
      row: 1,
      col: 1,
      kind: "surface",
      title: title ?? `${result.kind ?? "opt"} · optimum ${x.map((v) => v.toFixed(3)).join(", ")}`,
      surface: { x: grid.x, y: grid.y, z: grid.z, point },
    }],
  };
}
