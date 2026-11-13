// The kernel contract (`squero-kernel/0`). The launcher starts a pinned Julia container (or a
// native julia) and bridges these messages; the UI never links a Julia runtime.
//
// JSON line header + an optional binary frame:
//   arrays:    { "array": { "rows": 512, "cols": 512, "dtype": "f64", "order": "col", "bytes": 2097152 } }\n<raw>
//   artifacts: { "artifact": { "figure": "figure-1", "version": "…", "format": "svg", "mime": "image/svg+xml", "bytes": 24481 } }\n<raw>
// Figure images never travel as base64 inside JSON.
export type KernelRequest =
  | { op: "hello" }
  | { op: "eval"; id: string; code: string }
  | { op: "whos" }
  | { op: "get"; id: string; name: string }
  | { op: "set"; id: string; name: string; rows: number; cols: number }
  | { op: "snapshot"; id: string; line: number }
  | { op: "figure.get"; id: string; figure: string; version?: string; format?: "svg" | "png" }
  | { op: "figure.export"; id: string; figure: string; version?: string; format: FigureFormat; width?: number; height?: number; view?: boolean; view_state?: ViewState }
  | { op: "figure.scene"; id: string; figure: string; version?: string }
  | { op: "figure.render"; id: string; figure: string; version: string; width: number; height: number; format: "png" | "svg"; px_per_unit?: number }
  | ({ op: "figure.interact"; id: string; figure: string; version: string; width: number; height: number; format: "png" | "svg"; px_per_unit?: number } & ViewAction)
  | { op: "figure.list"; id: string }
  | { op: "plot.optimum"; id: string; result: unknown; title?: string }
  | { op: "reset" }
  | { op: "shutdown" };

export type KernelHello = {
  op: "hello";
  julia: string;
  image: string;
  protocol: number;
  packages: string[];
  /** SqueroBase and SqueroPlot versions the session loaded. */
  versions?: Record<string, string>;
};

export type KernelEvent = { type: "clear" | "clc"; names?: string[] };

/** Every export format SqueroPlot stores for a history version (HTML is built from the SVG). */
export type FigureFormat = "png" | "svg" | "pdf" | "eps" | "html";
export const FIGURE_FORMATS: FigureFormat[] = ["png", "svg", "pdf", "eps", "html"];

/** A figure the kernel captured after an eval: one SqueroPlot snapshot, stored per version. */
export type FigureMeta = {
  id: string;
  version: string;
  title: string;
  width: number;
  height: number;
  plots: number;
  axes: number;
  formats: string[];
  /** Source lines that drew into this figure (the editor's `→ figure` links). */
  lines: number[];
  error?: string;
};

/** Where an axis is drawn, in figure units (= CSS px at the stage size), for hit-testing. */
export type AxisLayout = { index: number; kind: "axis" | "axis3"; x: number; y: number; w: number; h: number; title: string };

/** A change to a version's stage view (its stored artifacts never change). */
export type ViewAction =
  | { action: "pan"; axis: number; dx: number; dy: number }
  | { action: "zoom"; axis: number; factor: number; fx: number; fy: number }
  | { action: "rotate"; axis: number; daz: number; del: number }
  | { action: "reset" };

/** Per-axis interactive overrides sent back to Julia `apply_view!` on "Current view" export. */
export type ViewAxisState =
  | {
      index: number;
      limits: [number, number, number, number];
      xgridvisible?: boolean;
      ygridvisible?: boolean;
    }
  | {
      index: number;
      limits?: [number, number, number, number, number, number];
      azimuth: number;
      elevation: number;
      perspectiveness?: number;
      xgridvisible?: boolean;
      ygridvisible?: boolean;
      zgridvisible?: boolean;
    };

export type ViewState = { axes: ViewAxisState[] };

export type ArtifactHeader = {
  figure: string;
  version: string;
  format: FigureFormat | "scene";
  mime: string;
  bytes: number;
  title: string;
  width?: number;
  height?: number;
};

export type KernelReply = {
  id?: string;
  ok: boolean;
  error?: string;
  stdout?: string;
  value?: unknown;
  /** `eval`: the value as Julia's REPL prints it (`text/plain`), "" for nothing. */
  text?: string;
  /** `eval`: figures whose drawing changed in this run. */
  figures?: FigureMeta[];
  /** `plot.optimum`: the figure it drew. */
  figure?: FigureMeta;
  /** Optimization problem specs, for the Paperboat solver. */
  problems?: unknown[];
  /** `graph.run` requests for a Paperboat backend (SqueroBase.simulate). */
  runs?: unknown[];
  /** Session events the app applies after the statement (`clear`, `clc`). */
  events?: KernelEvent[];
  /** A matrix's header comes before its binary frame; vectors use rows = 1. */
  array?: { rows: number; cols: number; dtype: "f64"; order: "col"; bytes: number };
  /** The array's values (column-major), filled in by the client from the binary frame. */
  data?: Float64Array;
  /** A figure artifact's header comes before its binary frame. */
  artifact?: ArtifactHeader;
  /** `figure.render`/`figure.interact`: the axes of the drawn figure, and whether it has a view. */
  axes?: AxisLayout[];
  view?: boolean;
  /** `figure.scene`: structured 2D/3D figure specification with optional binary frame in `bytes`. */
  scene?: Record<string, unknown>;
  /** The artifact's bytes, filled in by the client from the binary frame. */
  bytes?: Uint8Array;
};

/** The launcher/kernel versions the About window and the handshake show. */
export type KernelVersions = {
  julia: string;
  frontend: string;
  image: string;
  protocol: number;
};
