// The figure model: what a script drew, as tiles. The kernel's SqueroBase verbs describe it
// (`schema/chart.schema.json`); the app renders the spec and never parses the source.
export type FigureKind = "line" | "surface" | "heat" | "scatter";
export type FigureSeries = {
  x?: number[];
  y?: number[];
  label?: string;
  color?: string;
};
export type FigureTile = {
  row: number;
  col: number;
  kind: FigureKind;
  title: string;
  /** A line tile's series, from `plot(x, y)`. */
  series?: FigureSeries[];
  /** A scatter's points, from `scatter(x, y)`. */
  points?: [number, number][];
  /** A heat tile's field, rows of values. */
  heat?: number[][];
  /** A surface: `x`, `y`, `z` rows, and the optimum marker `[x, value, y]`. */
  surface?: { x: number[]; y: number[]; z: number[][]; point?: [number, number, number] };
};
export type Figure = { rows: number; cols: number; tiles: FigureTile[]; explicit: boolean };
