// The state-space and RHS simulation bridge: Julia computes A, B, C, D, x0 (or an ODE RHS `f`),
// MX packages a `paperboat/0` `graph.run` for Paperboat's `state_space` / `rhs` blocks, and turns the
// streamed `signal` samples into a 2D figure. MX never integrates locally.
import type { ClientMsg, RunSettings } from "@paperboat/shared/protocol";
import { MATLAB_COLORS } from "@paperboat/shared";
import type { Plot2DLayer as Layer2D } from "@paperboat/shared/plot";
import type { FigureEntry, FigureRun } from "../plot/history.ts";
import type { FigureScene, SceneAxis2D } from "../plot/scene.ts";
import type { WorkspaceVariable } from "../workspace/samples.ts";

/** A run's solver as the protocol names them, or auto (the backend's default). */
export type Solver = "auto" | NonNullable<RunSettings["solver"]>;

export type StateSpace = {
  A: number[][];
  B: number[][];
  C: number[][];
  D: number[][];
  x0: number[];
};

export type StateSpaceRun = {
  model: StateSpace;
  solver: Solver;
  /** Clock step and duration: the run's, not a local integrator's. */
  step: number;
  duration: number;
};

export type RhsRun = {
  f: string;
  x0: number[];
  solver: Solver;
  step: number;
  duration: number;
};

export type SimModel =
  | { kind: "state_space"; label: string; model: StateSpace }
  | { kind: "rhs"; label: string; f: string; x0: number[] };

export type SignalSample = {
  node: string;
  t: number;
  v: number | string | number[];
};

export function matrixParamText(value: number | number[] | number[][]): string {
  if (typeof value === "number") return String(value);
  if (!Array.isArray(value) || value.length === 0) return "[]";
  if (!Array.isArray(value[0])) return (value as number[]).join("; ");
  return (value as number[][]).map((row) => row.join(" ")).join("; ");
}

export function vectorParamText(values: readonly number[]): string {
  return values.join("; ");
}

function asMatrix2D(raw: WorkspaceVariable["value"]): number[][] | null {
  if (typeof raw === "number") return [[raw]];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!Array.isArray(raw[0])) return (raw as number[]).map((n) => [Number(n)]);
  return (raw as number[][]).map((row) => row.map((n) => Number(n)));
}

function asVector1D(raw: WorkspaceVariable["value"]): number[] | null {
  if (typeof raw === "number") return [raw];
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  if (!Array.isArray(raw[0])) return (raw as number[]).map((n) => Number(n));
  const mat = raw as number[][];
  if (mat.length === 1) return mat[0].map((n) => Number(n));
  if (mat[0]?.length === 1) return mat.map((r) => Number(r[0]));
  return null;
}

/** Detect either `(A, B, C, D [, x0])` or `(f [, x0])` in the workspace for the Run dock. */
export function detectSimModel(vars: readonly WorkspaceVariable[]): SimModel | null {
  const byName = new Map(vars.map((v) => [v.name, v]));
  const aVar = byName.get("A");
  const bVar = byName.get("B");
  const cVar = byName.get("C");
  const dVar = byName.get("D");
  if (aVar && bVar && cVar) {
    const A = asMatrix2D(aVar.value);
    const B = asMatrix2D(bVar.value);
    const C = asMatrix2D(cVar.value);
    const D = dVar ? asMatrix2D(dVar.value) : [[0]];
    if (A && B && C && D && A.length > 0 && A.length === A[0].length && B.length === A.length && C[0]?.length === A.length) {
      const x0Var = byName.get("x0");
      const x0 = x0Var ? (asVector1D(x0Var.value) ?? Array(A.length).fill(0)) : Array(A.length).fill(0);
      return {
        kind: "state_space",
        label: `state_space (${A.length} state${A.length === 1 ? "" : "s"})`,
        model: { A, B, C, D, x0 },
      };
    }
  }
  const fVar = byName.get("f");
  if (fVar && typeof fVar.value === "string" && fVar.value.trim()) {
    const eqCount = fVar.value.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).length;
    const x0Var = byName.get("x0");
    const x0 = x0Var ? (asVector1D(x0Var.value) ?? Array(eqCount).fill(0)) : Array(eqCount).fill(0);
    return {
      kind: "rhs",
      label: `rhs (${eqCount} state${eqCount === 1 ? "" : "s"})`,
      f: fVar.value.trim(),
      x0,
    };
  }
  return null;
}

/** Build a `paperboat/0` `graph.run` request for `control/state_space`. */
export function stateSpaceRunRequest(run: StateSpaceRun): Extract<ClientMsg, { type: "graph.run" }> {
  return {
    type: "graph.run",
    settings: {
      mode: "clock",
      ...(run.solver !== "auto" ? { solver: run.solver } : {}),
      dt: run.step,
      duration: run.duration,
    },
    graph: {
      nodes: [
        {
          id: "plant",
          type: "state_space",
          pos: [0, 0],
          params: {
            A: matrixParamText(run.model.A),
            B: matrixParamText(run.model.B),
            C: matrixParamText(run.model.C),
            D: matrixParamText(run.model.D),
            x0: vectorParamText(run.model.x0),
            domain: "s",
            solver: run.solver,
          },
        },
        { id: "y_plot", type: "graph", pos: [280, -40], params: {} },
        { id: "x_plot", type: "graph", pos: [280, 60], params: {} },
      ],
      edges: [
        { from: ["plant", "y"], to: ["y_plot", "in"] },
        { from: ["plant", "x"], to: ["x_plot", "in"] },
      ],
    },
  };
}

/** Build a `paperboat/0` `graph.run` request for `control/rhs`. */
export function rhsRunRequest(run: RhsRun): Extract<ClientMsg, { type: "graph.run" }> {
  return {
    type: "graph.run",
    settings: {
      mode: "clock",
      ...(run.solver !== "auto" ? { solver: run.solver } : {}),
      dt: run.step,
      duration: run.duration,
    },
    graph: {
      nodes: [
        {
          id: "ode",
          type: "rhs",
          pos: [0, 0],
          params: {
            f: run.f,
            x0: vectorParamText(run.x0),
            solver: run.solver,
          },
        },
        { id: "x_plot", type: "graph", pos: [280, 0], params: {} },
      ],
      edges: [{ from: ["ode", "x"], to: ["x_plot", "in"] }],
    },
  };
}

export function runRequest(run: StateSpaceRun) {
  return stateSpaceRunRequest(run);
}

/** Build a 2D `FigureScene` from streamed Paperboat `signal` samples so `FigureView` plots them. */
export function figureSceneFromSignals(
  samples: readonly SignalSample[],
  title = "Paperboat simulation",
  width = 760,
  height = 420,
): FigureScene | null {
  const byNode = new Map<string, { t: number[]; channels: number[][] }>();
  for (const s of samples) {
    const vals = typeof s.v === "number" ? [s.v] : Array.isArray(s.v) ? s.v.map(Number) : null;
    if (!vals || vals.length === 0) continue;
    let bucket = byNode.get(s.node);
    if (!bucket) {
      bucket = { t: [], channels: vals.map(() => []) };
      byNode.set(s.node, bucket);
    }
    bucket.t.push(s.t);
    for (let i = 0; i < vals.length; i++) {
      if (!bucket.channels[i]) bucket.channels[i] = [];
      bucket.channels[i].push(vals[i]);
    }
  }
  if (byNode.size === 0) return null;

  const layers: Layer2D[] = [];
  const legendEntries: { label: string; line: { color: string; linewidth: number } }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let colorIdx = 0;

  for (const [node, bucket] of byNode) {
    for (const x of bucket.t) {
      if (Number.isFinite(x)) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    for (let c = 0; c < bucket.channels.length; c++) {
      const ys = bucket.channels[c];
      for (const y of ys) {
        if (Number.isFinite(y)) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      const color = MATLAB_COLORS[colorIdx++ % MATLAB_COLORS.length];
      const prefix = node.replace(/_plot$/, "");
      const label = bucket.channels.length === 1 ? prefix : `${prefix}[${c + 1}]`;
      layers.push({ kind: "lines", x: bucket.t, y: ys, color, linewidth: 2, label });
      legendEntries.push({ label, line: { color, linewidth: 2 } });
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  if (maxX === minX) maxX = minX + 1;
  if (maxY === minY) { minY -= 0.5; maxY += 0.5; }
  const padY = (maxY - minY) * 0.05;

  const axis: SceneAxis2D = {
    kind: "axis",
    index: 1,
    title,
    subtitle: "",
    titlealign: "center",
    xlabel: "time [s]",
    ylabel: "value",
    limits: [minX, maxX, minY - padY, maxY + padY],
    xscale: "linear",
    yscale: "linear",
    xreversed: false,
    yreversed: false,
    yaxisposition: "left",
    xaxisposition: "bottom",
    backgroundcolor: "#ffffff",
    xgridvisible: true,
    ygridvisible: true,
    xticksvisible: true,
    yticksvisible: true,
    xticklabelsvisible: true,
    yticklabelsvisible: true,
    xticks: [],
    xticklabels: [],
    yticks: [],
    yticklabels: [],
    topspinevisible: true,
    rightspinevisible: true,
    leftspinevisible: true,
    bottomspinevisible: true,
    linkX: null,
    linkY: null,
    aspect: null,
    legends: legendEntries.length > 0 ? [{
      kind: "legend",
      title: "",
      position: "rt",
      orientation: "vertical",
      framevisible: true,
      backgroundcolor: "#ffffff",
      framecolor: "#d4d4d4",
      entries: legendEntries,
    }] : [],
    plots: layers,
  };

  return {
    id: `sim-${Date.now()}`,
    title,
    width,
    height,
    background: "#ffffff",
    layout: {
      kind: "grid",
      nrows: 1,
      ncols: 1,
      colgap: 8,
      rowgap: 8,
      cols: [{ kind: "fr", value: 1 }],
      rows: [{ kind: "fr", value: 1 }],
      items: [{ row: 1, rowEnd: 1, col: 1, colEnd: 1, block: axis }],
    },
  };
}

let simSeq = 0;

export function figureEntryFromSignals(
  samples: readonly SignalSample[],
  source: string,
  title: string,
  run?: FigureRun,
): FigureEntry | null {
  const scene = figureSceneFromSignals(samples, title);
  if (!scene) return null;
  const ax = scene.layout.items[0]?.block as SceneAxis2D;
  const id = `paperboat-${++simSeq}`;
  const version = `${Date.now()}`;
  return {
    key: `${id}@${version}`,
    figure: id,
    version,
    source,
    time: Date.now(),
    ...(run ? { run } : {}),
    title,
    width: scene.width,
    height: scene.height,
    plots: ax.plots.length,
    axes: 1,
    lines: [],
    artifacts: {},
    scene,
  };
}
