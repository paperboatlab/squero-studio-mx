// Structured 2D/3D figure scene unpacker and adapters (Julia Z-up / Plot2DLayer / SceneView).
// Pure TypeScript with type-only imports from @paperboat/shared so unit tests run directly in Node.
import type { Interpreter, PlotAxes, PlotLegendEntry, Plot2DLayer, PlotText } from "@paperboat/shared/plot";
import type { SceneLabel, ScenePlotLayer } from "@paperboat/shared/station";

export type BufRef = {
  buf: true;
  dtype: "f32" | "u32" | "u8";
  offset: number;
  length: number;
};

export type SceneTrack = {
  kind: "fixed" | "relative" | "auto" | "fr";
  value: number;
};

export type SceneLegendItem = {
  label: string;
  line?: { color: string; linestyle?: string; linewidth?: number };
  marker?: { shape: string; color: string; size?: number; strokecolor?: string; strokewidth?: number };
  patch?: { color: string; strokecolor?: string; strokewidth?: number };
};

export type SceneLegend = {
  kind?: "legend";
  title: string;
  position: string;
  orientation: string;
  framevisible: boolean;
  backgroundcolor: string;
  framecolor: string;
  entries: SceneLegendItem[];
};

export type SceneColorbar = {
  kind: "colorbar";
  label: string;
  limits: [number, number];
  colormap: [number, number, number][];
  ticks: number[];
  ticklabels: string[];
  levels: number[] | null;
  vertical: boolean;
  flipaxis: boolean;
};

export type SceneLabelBlock = {
  kind: "label";
  text: string;
  fontsize: number;
  bold: boolean;
  color: string;
  rotation: number;
};

export type ScenePlot3D =
  | {
      kind: "surface";
      label: string;
      positions: Float32Array;
      indices: Uint32Array;
      nx: number;
      ny: number;
      alpha: number;
      strokewidth: number;
      strokecolor: string;
      shading: string;
      color?: string;
      values?: Float32Array;
      colorrange?: [number, number];
      colormap?: [number, number, number][];
    }
  | {
      kind: "wireframe";
      label: string;
      positions: Float32Array;
      indices: Uint32Array;
      color: string;
      linewidth: number;
    }
  | {
      kind: "mesh";
      label: string;
      positions: Float32Array;
      indices: Uint32Array;
      alpha: number;
      strokewidth: number;
      strokecolor: string;
      shading: string;
      color?: string;
      values?: Float32Array;
      colorrange?: [number, number];
      colormap?: [number, number, number][];
      vertexcolors?: Float32Array;
    }
  | {
      kind: "lines" | "scatter" | "scatterlines" | "linesegments" | "stem";
      label: string;
      positions: Float32Array;
      vertexcolors?: Float32Array;
      color: string;
      linewidth?: number;
      markersize?: number;
      marker?: string;
      offset?: number;
    };

export type SceneAxis2D = {
  kind: "axis";
  index: number;
  title: string;
  subtitle: string;
  titlealign: string;
  xlabel: string;
  ylabel: string;
  limits: [number, number, number, number];
  xscale: string;
  yscale: string;
  xreversed: boolean;
  yreversed: boolean;
  yaxisposition: "left" | "right";
  xaxisposition: "bottom" | "top";
  backgroundcolor: string;
  xgridvisible: boolean;
  ygridvisible: boolean;
  xticksvisible: boolean;
  yticksvisible: boolean;
  xticklabelsvisible: boolean;
  yticklabelsvisible: boolean;
  xticks: number[];
  xticklabels: string[];
  yticks: number[];
  yticklabels: string[];
  topspinevisible: boolean;
  rightspinevisible: boolean;
  leftspinevisible: boolean;
  bottomspinevisible: boolean;
  linkX: number | null;
  linkY: number | null;
  aspect: string | number | null;
  legends: SceneLegend[];
  plots: Plot2DLayer[];
};

export type SceneAxis3D = {
  kind: "axis3";
  index: number;
  title: string;
  xlabel: string;
  ylabel: string;
  zlabel: string;
  limits: [number, number, number, number, number, number];
  half: [number, number, number];
  azimuth: number;
  elevation: number;
  perspectiveness: number;
  backgroundcolor: string;
  xticks: number[];
  xticklabels: string[];
  yticks: number[];
  yticklabels: string[];
  zticks: number[];
  zticklabels: string[];
  xgridvisible: boolean;
  ygridvisible: boolean;
  zgridvisible: boolean;
  legends: SceneLegend[];
  plots: ScenePlot3D[];
};

export type SceneBlock = SceneGridBlock | SceneAxis2D | SceneAxis3D | SceneColorbar | SceneLabelBlock | SceneLegend;

export type SceneLayoutItem = {
  row: number;
  rowEnd: number;
  col: number;
  colEnd: number;
  block: SceneBlock;
};

export type SceneGridBlock = {
  kind: "grid";
  nrows: number;
  ncols: number;
  colgap: number;
  rowgap: number;
  cols: SceneTrack[];
  rows: SceneTrack[];
  items: SceneLayoutItem[];
};

export type FigureScene = {
  id: string;
  title: string;
  width: number;
  height: number;
  background: string;
  layout: SceneGridBlock;
};

const isBufRef = (v: unknown): v is BufRef =>
  typeof v === "object" && v !== null && (v as BufRef).buf === true;

function readF32(v: unknown, bytes?: Uint8Array): Float32Array {
  if (isBufRef(v)) {
    if (!bytes || v.length <= 0) return new Float32Array(0);
    const byteOff = bytes.byteOffset + v.offset;
    if (byteOff % 4 === 0 && v.offset + v.length * 4 <= bytes.byteLength) {
      return new Float32Array(bytes.buffer, byteOff, v.length);
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = dv.getFloat32(v.offset + i * 4, true);
    return out;
  }
  if (Array.isArray(v)) {
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) {
      const val = v[i];
      out[i] = val === null || val === undefined ? NaN : Number(val);
    }
    return out;
  }
  return new Float32Array(0);
}

function readU32(v: unknown, bytes?: Uint8Array): Uint32Array {
  if (isBufRef(v)) {
    if (!bytes || v.length <= 0) return new Uint32Array(0);
    const byteOff = bytes.byteOffset + v.offset;
    if (byteOff % 4 === 0 && v.offset + v.length * 4 <= bytes.byteLength) {
      return new Uint32Array(bytes.buffer, byteOff, v.length);
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = new Uint32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = dv.getUint32(v.offset + i * 4, true);
    return out;
  }
  if (Array.isArray(v)) return new Uint32Array(v.map((n) => Number(n) || 0));
  return new Uint32Array(0);
}

function readU8(v: unknown, bytes?: Uint8Array): Uint8Array {
  if (isBufRef(v)) {
    if (!bytes || v.length <= 0) return new Uint8Array(0);
    return new Uint8Array(bytes.buffer, bytes.byteOffset + v.offset, Math.min(v.length, bytes.byteLength - v.offset));
  }
  if (Array.isArray(v)) return new Uint8Array(v.map((n) => Number(n) || 0));
  return new Uint8Array(0);
}

type RawRec = Record<string, unknown>;

function unpackPlot2D(p: RawRec, bytes?: Uint8Array): Plot2DLayer | null {
  const kind = String(p.kind ?? "");
  const label = String(p.label ?? "");
  if (kind === "lines" || kind === "stairs" || kind === "scatter" || kind === "scatterlines") {
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      y: readF32(p.y, bytes),
      color: typeof p.color === "string" ? p.color : undefined,
      colors: Array.isArray(p.colors) ? (p.colors as string[]) : undefined,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: (p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined) ?? "solid",
      marker: typeof p.marker === "string" ? p.marker : undefined,
      markersize: p.markersize as number | readonly number[] | undefined,
      markercolor: p.markercolor as string | readonly string[] | undefined,
      strokecolor: typeof p.strokecolor === "string" ? p.strokecolor : undefined,
      strokewidth: p.strokewidth !== undefined ? Number(p.strokewidth) : undefined,
    };
  }
  if (kind === "linesegments") {
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      y: readF32(p.y, bytes),
      color: p.color as string | readonly string[] | undefined,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
    };
  }
  if (kind === "stem") {
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      y: readF32(p.y, bytes),
      baseline: readF32(p.baseline, bytes),
      color: typeof p.color === "string" ? p.color : undefined,
      stemcolor: p.stemcolor as string | readonly string[] | undefined,
      trunkcolor: typeof p.trunkcolor === "string" ? p.trunkcolor : undefined,
      stemwidth: p.stemwidth !== undefined ? Number(p.stemwidth) : undefined,
      stemlinestyle: p.stemlinestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
      trunkwidth: p.trunkwidth !== undefined ? Number(p.trunkwidth) : undefined,
      trunklinestyle: p.trunklinestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
      marker: typeof p.marker === "string" ? p.marker : undefined,
      markersize: p.markersize !== undefined ? Number(p.markersize) : undefined,
      strokecolor: typeof p.strokecolor === "string" ? p.strokecolor : undefined,
      strokewidth: p.strokewidth !== undefined ? Number(p.strokewidth) : undefined,
    };
  }
  if (kind === "barplot" || kind === "hist") {
    return {
      kind,
      label,
      x0: readF32(p.x0, bytes),
      x1: readF32(p.x1, bytes),
      y0: readF32(p.y0, bytes),
      y1: readF32(p.y1, bytes),
      color: p.color as string | readonly string[] | undefined,
      strokecolor: typeof p.strokecolor === "string" ? p.strokecolor : undefined,
      strokewidth: p.strokewidth !== undefined ? Number(p.strokewidth) : undefined,
    };
  }
  if (kind === "errorbars") {
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      y: readF32(p.y, bytes),
      low: readF32(p.low, bytes),
      high: readF32(p.high, bytes),
      direction: String(p.direction ?? "y"),
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      whiskerwidth: p.whiskerwidth !== undefined ? Number(p.whiskerwidth) : undefined,
      color: p.color as string | readonly string[] | undefined,
    };
  }
  if (kind === "band") {
    return { kind, label, x: readF32(p.x, bytes), lo: readF32(p.lo, bytes), hi: readF32(p.hi, bytes), color: typeof p.color === "string" ? p.color : undefined };
  }
  if (kind === "area") {
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      y: readF32(p.y, bytes),
      baseline: Number(p.baseline ?? 0),
      color: typeof p.color === "string" ? p.color : undefined,
      fillcolor: typeof p.fillcolor === "string" ? p.fillcolor : undefined,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
    };
  }
  if (kind === "heatmap") {
    return {
      kind,
      label,
      xe: readF32(p.xe, bytes),
      ye: readF32(p.ye, bytes),
      nx: Number(p.nx ?? 0),
      ny: Number(p.ny ?? 0),
      z: readF32(p.z, bytes),
      colormap: (p.colormap as readonly (readonly number[])[]) ?? "viridis",
      colorrange: (p.colorrange as [number, number]) ?? [0, 1],
      nancolor: typeof p.nancolor === "string" ? p.nancolor : "transparent",
      interpolate: Boolean(p.interpolate),
      alpha: Number(p.alpha ?? 1),
    };
  }
  if (kind === "image") {
    return {
      kind,
      label,
      xe: readF32(p.xe, bytes),
      ye: readF32(p.ye, bytes),
      nx: Number(p.nx ?? 0),
      ny: Number(p.ny ?? 0),
      rgba: readU8(p.rgba, bytes),
      interpolate: Boolean(p.interpolate),
      alpha: Number(p.alpha ?? 1),
    };
  }
  if (kind === "contour") {
    const groups = ((p.groups as RawRec[]) ?? []).map((g) => ({
      level: Number(g.level ?? 0),
      color: String(g.color ?? "#0072BD"),
      coords: readF32(g.coords, bytes),
    }));
    return {
      kind,
      label,
      groups,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
    };
  }
  if (kind === "contourf") {
    return {
      kind,
      label,
      bands: (p.bands as { color: string; polygons: number[][] }[]) ?? [],
    };
  }
  if (kind === "hlines" || kind === "vlines") {
    return {
      kind,
      label,
      values: readF32(p.values, bytes),
      color: p.color as string | readonly string[] | undefined,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
      min: (p.min as number[]) ?? [],
      max: (p.max as number[]) ?? [],
    };
  }
  if (kind === "ablines") {
    return {
      kind,
      label,
      a: readF32(p.a, bytes),
      b: readF32(p.b, bytes),
      color: p.color as string | readonly string[] | undefined,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
    };
  }
  if (kind === "poly") {
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      y: readF32(p.y, bytes),
      color: typeof p.color === "string" ? p.color : undefined,
      strokecolor: typeof p.strokecolor === "string" ? p.strokecolor : undefined,
      strokewidth: p.strokewidth !== undefined ? Number(p.strokewidth) : undefined,
    };
  }
  if (kind === "series" || kind === "multiline") {
    const items = ((p.series as RawRec[]) ?? []).map((s) => ({
      y: readF32(s.y, bytes),
      color: String(s.color ?? "#0072BD"),
      label: String(s.label ?? ""),
    }));
    return {
      kind,
      label,
      x: readF32(p.x, bytes),
      series: items,
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      linestyle: p.linestyle as "solid" | "dashed" | "dotted" | "dashdot" | undefined,
      marker: typeof p.marker === "string" ? p.marker : undefined,
      markersize: p.markersize !== undefined ? Number(p.markersize) : undefined,
    };
  }
  if (kind === "text") {
    return { kind, label, items: (p.items as Extract<Plot2DLayer, { kind: "text" }>["items"]) ?? [] };
  }
  if (kind === "annotation") {
    return {
      kind,
      label,
      xt: Number(p.xt ?? 0),
      yt: Number(p.yt ?? 0),
      x: Number(p.x ?? 0),
      y: Number(p.y ?? 0),
      text: String(p.text ?? ""),
      color: String(p.color ?? "#262626"),
      fontsize: Number(p.fontsize ?? 11),
      linewidth: Number(p.linewidth ?? 1),
      arrowsize: Number(p.arrowsize ?? 8),
    };
  }
  if (kind === "mesh2d") {
    return {
      kind,
      label,
      triangles: (p.triangles as Extract<Plot2DLayer, { kind: "mesh2d" }>["triangles"]) ?? [],
      strokecolor: typeof p.strokecolor === "string" ? p.strokecolor : undefined,
      strokewidth: p.strokewidth !== undefined ? Number(p.strokewidth) : undefined,
    };
  }
  return null;
}

function unpackPlot3D(p: RawRec, bytes?: Uint8Array): ScenePlot3D | null {
  const kind = String(p.kind ?? "");
  const label = String(p.label ?? "");
  if (kind === "surface") {
    return {
      kind,
      label,
      positions: readF32(p.positions, bytes),
      indices: readU32(p.indices, bytes),
      nx: Number(p.nx ?? 0),
      ny: Number(p.ny ?? 0),
      alpha: Number(p.alpha ?? 1),
      strokewidth: Number(p.strokewidth ?? 0),
      strokecolor: String(p.strokecolor ?? "transparent"),
      shading: String(p.shading ?? "true"),
      color: typeof p.color === "string" ? p.color : undefined,
      values: p.values !== undefined ? readF32(p.values, bytes) : undefined,
      colorrange: p.colorrange as [number, number] | undefined,
      colormap: p.colormap as [number, number, number][] | undefined,
    };
  }
  if (kind === "wireframe") {
    return {
      kind,
      label,
      positions: readF32(p.positions, bytes),
      indices: readU32(p.indices, bytes),
      color: String(p.color ?? "#262626"),
      linewidth: Number(p.linewidth ?? 1),
    };
  }
  if (kind === "mesh") {
    return {
      kind,
      label,
      positions: readF32(p.positions, bytes),
      indices: readU32(p.indices, bytes),
      alpha: Number(p.alpha ?? 1),
      strokewidth: Number(p.strokewidth ?? 0),
      strokecolor: String(p.strokecolor ?? "transparent"),
      shading: String(p.shading ?? "true"),
      color: typeof p.color === "string" ? p.color : undefined,
      values: p.values !== undefined ? readF32(p.values, bytes) : undefined,
      colorrange: p.colorrange as [number, number] | undefined,
      colormap: p.colormap as [number, number, number][] | undefined,
      vertexcolors: p.vertexcolors !== undefined ? readF32(p.vertexcolors, bytes) : undefined,
    };
  }
  if (kind === "lines" || kind === "scatter" || kind === "scatterlines" || kind === "linesegments" || kind === "stem") {
    return {
      kind,
      label,
      positions: readF32(p.positions, bytes),
      vertexcolors: p.vertexcolors !== undefined ? readF32(p.vertexcolors, bytes) : undefined,
      color: String(p.color ?? "#0072BD"),
      linewidth: p.linewidth !== undefined ? Number(p.linewidth) : undefined,
      markersize: p.markersize !== undefined ? Number(p.markersize) : undefined,
      marker: typeof p.marker === "string" ? p.marker : undefined,
      offset: p.offset !== undefined ? Number(p.offset) : undefined,
    };
  }
  return null;
}

function unpackBlock(raw: RawRec, bytes?: Uint8Array): SceneBlock {
  const kind = String(raw.kind ?? "");
  if (kind === "grid") {
    const items = ((raw.items as RawRec[]) ?? []).map((it) => ({
      row: Number(it.row ?? 1),
      rowEnd: Number(it.rowEnd ?? 2),
      col: Number(it.col ?? 1),
      colEnd: Number(it.colEnd ?? 2),
      block: unpackBlock((it.block as RawRec) ?? {}, bytes),
    }));
    return {
      kind: "grid",
      nrows: Number(raw.nrows ?? 1),
      ncols: Number(raw.ncols ?? 1),
      colgap: Number(raw.colgap ?? 12),
      rowgap: Number(raw.rowgap ?? 12),
      cols: (raw.cols as SceneTrack[]) ?? [{ kind: "fr", value: 1 }],
      rows: (raw.rows as SceneTrack[]) ?? [{ kind: "fr", value: 1 }],
      items,
    };
  }
  if (kind === "axis") {
    const plots: Plot2DLayer[] = [];
    for (const p of (raw.plots as RawRec[]) ?? []) {
      const layer = unpackPlot2D(p, bytes);
      if (layer) plots.push(layer);
    }
    return {
      ...(raw as Omit<SceneAxis2D, "plots">),
      kind: "axis",
      plots,
    };
  }
  if (kind === "axis3") {
    const plots: ScenePlot3D[] = [];
    for (const p of (raw.plots as RawRec[]) ?? []) {
      const layer = unpackPlot3D(p, bytes);
      if (layer) plots.push(layer);
    }
    return {
      ...(raw as Omit<SceneAxis3D, "plots">),
      kind: "axis3",
      plots,
    };
  }
  return raw as unknown as SceneBlock;
}

/** Unpack a JSON `figure.scene` payload + optional little-endian binary frame into typed arrays. */
export function unpackScene(raw: Record<string, unknown>, bytes?: Uint8Array): FigureScene {
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    width: Number(raw.width ?? 600),
    height: Number(raw.height ?? 450),
    background: String(raw.background ?? "#ffffff"),
    layout: unpackBlock((raw.layout as RawRec) ?? { kind: "grid" }, bytes) as SceneGridBlock,
  };
}

const textOf = (s: string, interpreter: Interpreter = "tex"): PlotText | undefined =>
  s ? { text: s, interpreter } : undefined;

const scaleOf = (s: string): "linear" | "log" =>
  s === "log10" || s === "log2" || s === "ln" ? "log" : "linear";

const toPlotLegendEntries = (lg: SceneLegend): PlotLegendEntry[] =>
  lg.entries.map((e) => ({
    label: e.label,
    line: e.line ? { color: e.line.color, linestyle: e.line.linestyle, linewidth: e.line.linewidth } : undefined,
    marker: e.marker ? { shape: e.marker.shape, color: e.marker.color, size: e.marker.size, strokecolor: e.marker.strokecolor } : undefined,
    patch: e.patch ? { color: e.patch.color, strokecolor: e.patch.strokecolor } : undefined,
  }));

/** Convert one 2D Julia `Axis` (plus optional right-hand overlaid `twinx` `Axis`) into `Plot2D` props. */
export function axis2dToPlotProps(
  ax: SceneAxis2D,
  twinx?: SceneAxis2D,
): { layers: Plot2DLayer[]; axes: PlotAxes } {
  const layers: Plot2DLayer[] = [...ax.plots];
  if (twinx) {
    for (const p of twinx.plots) layers.push({ ...p, secondaryY: true });
  }
  const lg = ax.legends[0] ?? twinx?.legends[0];
  const axes: PlotAxes = {
    title: textOf(ax.title),
    subtitle: textOf(ax.subtitle),
    xlabel: textOf(ax.xlabel),
    ylabel: textOf(ax.ylabel),
    ylabel2: twinx ? textOf(twinx.ylabel) : undefined,
    xlim: [ax.limits[0], ax.limits[1]],
    ylim: [ax.limits[2], ax.limits[3]],
    y2lim: twinx ? [twinx.limits[2], twinx.limits[3]] : undefined,
    xscale: scaleOf(ax.xscale),
    yscale: scaleOf(ax.yscale),
    y2scale: twinx ? scaleOf(twinx.yscale) : undefined,
    xreversed: ax.xreversed,
    yreversed: ax.yreversed,
    y2reversed: twinx?.yreversed,
    ySide: ax.yaxisposition,
    xticks: ax.xticks,
    xticklabels: ax.xticklabels,
    yticks: ax.yticks,
    yticklabels: ax.yticklabels,
    y2ticks: twinx?.yticks,
    y2ticklabels: twinx?.yticklabels,
    xgrid: ax.xgridvisible,
    ygrid: ax.ygridvisible,
    topspine: ax.topspinevisible,
    bottomspine: ax.bottomspinevisible,
    leftspine: ax.leftspinevisible,
    rightspine: twinx ? twinx.rightspinevisible : ax.rightspinevisible,
    xticksvisible: ax.xticksvisible,
    yticksvisible: ax.yticksvisible,
    xticklabelsvisible: ax.xticklabelsvisible,
    yticklabelsvisible: ax.yticklabelsvisible,
    background: ax.backgroundcolor !== "transparent" ? ax.backgroundcolor : undefined,
    axis: ax.aspect === "data" ? "equal" : undefined,
    legend: lg
      ? {
          show: true,
          position: undefined,
          location: lg.position,
          entries: toPlotLegendEntries(lg),
        } as PlotAxes["legend"] & { location?: string }
      : undefined,
    interpreter: "tex",
  };
  return { layers, axes };
}

/** Convert Julia `(azimuth, elevation)` spherical camera to Three.js Y-up `eye`/`target`/`fov`/`projection`. */
export function axis3CameraFor(ax: SceneAxis3D, az = ax.azimuth, el = ax.elevation): {
  fov: number;
  eye: [number, number, number];
  target: [number, number, number];
  projection: "persp" | "iso";
} {
  const [hx, hy, hz] = ax.half;
  const radius = Math.hypot(hx, hy, hz);
  const persp = ax.perspectiveness ?? 0.5;
  const fov = persp > 0.05 ? Math.max(22, Math.min(60, Math.round(20 + 35 * persp))) : 40;
  const dist = Math.max(1.95, radius * 2.18);
  const ce = Math.cos(el);
  return {
    fov,
    eye: [dist * ce * Math.cos(az), dist * Math.sin(el), -dist * ce * Math.sin(az)],
    target: [0, 0, 0],
    projection: persp <= 0.05 ? "iso" : "persp",
  };
}

/** Inverse map from Three.js Y-up `(eye, target)` back to Julia `(azimuth, elevation)`. */
export function cameraToAzEl(
  eye: readonly [number, number, number],
  target: readonly [number, number, number] = [0, 0, 0],
): { azimuth: number; elevation: number } {
  const dx = eye[0] - target[0];
  const dy = eye[1] - target[1];
  const dz = eye[2] - target[2];
  const horiz = Math.hypot(dx, -dz);
  const elevation = Math.max(-0.499 * Math.PI, Math.min(0.499 * Math.PI, Math.atan2(dy, Math.max(horiz, 1e-12))));
  const azimuth = Math.atan2(-dz, dx);
  return { azimuth, elevation };
}

/** Compare Two 3D camera `(eye, target)` states against home (angle + distance tolerance, `±2π` invariant). */
export function isCameraAtHome(
  cur: { eye: readonly [number, number, number]; target: readonly [number, number, number] },
  home: { eye: readonly [number, number, number]; target: readonly [number, number, number] },
): boolean {
  const dx0 = home.eye[0] - home.target[0], dy0 = home.eye[1] - home.target[1], dz0 = home.eye[2] - home.target[2];
  const dx1 = cur.eye[0] - cur.target[0], dy1 = cur.eye[1] - cur.target[1], dz1 = cur.eye[2] - cur.target[2];
  const d0 = Math.hypot(dx0, dy0, dz0), d1 = Math.hypot(dx1, dy1, dz1);
  if (d0 <= 1e-9 || d1 <= 1e-9) return true;
  const dot = (dx0 * dx1 + dy0 * dy1 + dz0 * dz1) / (d0 * d1);
  const distErr = Math.abs(d1 - d0) / d0;
  const targetErr = Math.hypot(cur.target[0] - home.target[0], cur.target[1] - home.target[1], cur.target[2] - home.target[2]);
  return dot > 0.9999 && distErr < 0.02 && targetErr < 0.02;
}

function mapXYZToYUp(
  pos: Float32Array,
  limits: readonly [number, number, number, number, number, number],
  half: readonly [number, number, number],
): Float32Array {
  const [x0, x1, y0, y1, z0, z1] = limits;
  const [hx, hy, hz] = half;
  const sx = x1 - x0 || 1;
  const sy = y1 - y0 || 1;
  const sz = z1 - z0 || 1;
  const out = new Float32Array(pos.length);
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const nx = -hx + ((pos[i] - x0) / sx) * (2 * hx);
    const ny = -hy + ((pos[i + 1] - y0) / sy) * (2 * hy);
    const nz = -hz + ((pos[i + 2] - z0) / sz) * (2 * hz);
    out[i] = nx || 0;
    out[i + 1] = nz || 0;
    out[i + 2] = -ny || 0;
  }
  return out;
}

/** Convert a Y-up 3D scene coordinate back to `[x, y, z]` Axis3 data coordinates. */
export function sceneYUpToXYZ(
  point: readonly [number, number, number],
  limits: readonly [number, number, number, number, number, number],
  half: readonly [number, number, number],
): [number, number, number] {
  const [x0, x1, y0, y1, z0, z1] = limits;
  const [hx, hy, hz] = half;
  const sx = x1 - x0 || 1;
  const sy = y1 - y0 || 1;
  const sz = z1 - z0 || 1;
  const nx = point[0];
  const ny = -point[2];
  const nz = point[1];
  return [
    x0 + ((nx + hx) / (2 * hx || 1)) * sx,
    y0 + ((ny + hy) / (2 * hy || 1)) * sy,
    z0 + ((nz + hz) / (2 * hz || 1)) * sz,
  ];
}

/** Build Y-up `ScenePlotLayer[]` + box/grid frame + tick `SceneLabel[]` for a `SceneAxis3D`. */
export function axis3ToSceneData(
  ax: SceneAxis3D,
  gridVisible: boolean,
  darkBg = false,
): { layers: ScenePlotLayer[]; labels: SceneLabel[] } {
  const [x0, x1, y0, y1, z0, z1] = ax.limits;
  const [hx, hy, hz] = ax.half;
  const ink = darkBg ? "#d4d4d8" : "#262626";
  const gridCol = darkBg ? "#3a3a42" : "#d8d8d4";
  const layers: ScenePlotLayer[] = [];
  const labels: SceneLabel[] = [];

  const normX = (x: number) => -hx + ((x - x0) / (x1 - x0 || 1)) * (2 * hx);
  const normY = (y: number) => -hy + ((y - y0) / (y1 - y0 || 1)) * (2 * hy);
  const normZ = (z: number) => -hz + ((z - z0) / (z1 - z0 || 1)) * (2 * hz);
  const ptYUp = (x: number, y: number, z: number): [number, number, number] => [normX(x), normZ(z), -normY(y)];

  // Outer back wall octant chosen opposite initial eye so ticks & grids frame cleanly.
  // Avoid drawing a 12-edge closed solid wireframe cube across the front of the 3D plot.
  const cam0 = axis3CameraFor(ax);
  const backX = cam0.eye[0] >= 0 ? -hx : hx;
  const backZ = cam0.eye[2] >= 0 ? -hy : hy;
  const frontX = -backX;
  const frontZ = -backZ;

  if (gridVisible) {
    const gverts: number[] = [];
    if (ax.xgridvisible !== false) {
      for (const xt of ax.xticks) {
        const vx = normX(xt);
        gverts.push(vx, -hz, -hy, vx, -hz, hy); // floor
        gverts.push(vx, -hz, backZ, vx, hz, backZ); // Z-normal back wall
      }
    }
    if (ax.ygridvisible !== false) {
      for (const yt of ax.yticks) {
        const vz = -normY(yt);
        gverts.push(-hx, -hz, vz, hx, -hz, vz); // floor
        gverts.push(backX, -hz, vz, backX, hz, vz); // X-normal back wall
      }
    }
    if (ax.zgridvisible !== false) {
      for (const zt of ax.zticks) {
        const vy = normZ(zt);
        gverts.push(backX, vy, -hy, backX, vy, hy);
        gverts.push(-hx, vy, backZ, hx, vy, backZ);
      }
    }
    if (gverts.length > 0) {
      layers.push({
        id: `ax3:${ax.index}:grid`,
        pickable: false,
        kind: "linesegments",
        positions: new Float32Array(gverts),
        color: gridCol,
        alpha: 0.75,
      });
    }
  }

  // Axis tick labels along front-facing bottom & vertical edges
  const offZ = frontZ > 0 ? 0.11 : -0.11;
  const offX = frontX > 0 ? 0.11 : -0.11;
  const maxLabels = 7;
  const xStep = Math.max(1, Math.ceil(ax.xticks.length / maxLabels));
  for (let i = 0; i < ax.xticks.length; i += xStep) {
    const lbl = ax.xticklabels[i];
    if (lbl) labels.push({ text: lbl, pos: [normX(ax.xticks[i]), -hz - 0.06, frontZ + offZ], color: ink, size: 0.085 });
  }
  const yStep = Math.max(1, Math.ceil(ax.yticks.length / maxLabels));
  for (let i = 0; i < ax.yticks.length; i += yStep) {
    const lbl = ax.yticklabels[i];
    if (lbl) labels.push({ text: lbl, pos: [frontX + offX, -hz - 0.06, -normY(ax.yticks[i])], color: ink, size: 0.085 });
  }
  const zStep = Math.max(1, Math.ceil(ax.zticks.length / maxLabels));
  for (let i = 0; i < ax.zticks.length; i += zStep) {
    const lbl = ax.zticklabels[i];
    if (lbl) labels.push({ text: lbl, pos: [backX + (backX > 0 ? 0.13 : -0.13), normZ(ax.zticks[i]), frontZ], color: ink, size: 0.085 });
  }
  if (ax.xlabel) labels.push({ text: ax.xlabel, pos: [0, -hz - 0.18, frontZ + offZ * 1.9], color: ink, size: 0.1 });
  if (ax.ylabel) labels.push({ text: ax.ylabel, pos: [frontX + offX * 2.1, -hz - 0.18, 0], color: ink, size: 0.1 });
  if (ax.zlabel) labels.push({ text: ax.zlabel, pos: [backX + (backX > 0 ? 0.28 : -0.28), 0, frontZ + offZ * 0.4], color: ink, size: 0.1 });

  // Plot data layers transformed into Y-up normalized cube
  ax.plots.forEach((p, idx) => {
    const id = `ax3:${ax.index}:p${idx}`;
    const pos = mapXYZToYUp(p.positions, ax.limits, ax.half);
    if (p.kind === "surface" || p.kind === "mesh") {
      layers.push({
        id,
        kind: p.kind,
        positions: pos,
        indices: p.indices,
        nx: p.kind === "surface" ? p.nx : undefined,
        ny: p.kind === "surface" ? p.ny : undefined,
        values: p.values,
        colorrange: p.colorrange,
        colormap: p.colormap,
        vertexColors: p.kind === "mesh" ? p.vertexcolors : undefined,
        color: p.color,
        alpha: p.alpha,
        shading: p.shading,
        strokewidth: p.strokewidth,
        strokecolor: p.strokecolor,
      });
    } else if (p.kind === "wireframe") {
      layers.push({ id, kind: "linesegments", positions: pos, indices: p.indices, color: p.color, linewidth: p.linewidth });
    } else if (p.kind === "lines" || p.kind === "linesegments") {
      layers.push({
        id,
        kind: p.kind === "lines" ? "line" : "linesegments",
        positions: pos,
        vertexColors: p.vertexcolors,
        color: p.color,
        linewidth: p.linewidth,
      });
    } else if (p.kind === "scatter") {
      layers.push({ id, kind: "points", positions: pos, vertexColors: p.vertexcolors, color: p.color, size: p.markersize ?? 6 });
    } else if (p.kind === "scatterlines") {
      layers.push({ id: `${id}:l`, kind: "line", positions: pos, vertexColors: p.vertexcolors, color: p.color, linewidth: p.linewidth });
      layers.push({ id: `${id}:m`, kind: "points", positions: pos, vertexColors: p.vertexcolors, color: p.color, size: p.markersize ?? 6 });
    } else if (p.kind === "stem") {
      const zOff = p.offset ?? 0;
      const nyOff = normZ(zOff);
      const stalks = new Float32Array((pos.length / 3) * 6);
      for (let i = 0, k = 0; i + 2 < pos.length; i += 3, k += 6) {
        stalks[k] = pos[i]; stalks[k + 1] = nyOff; stalks[k + 2] = pos[i + 2];
        stalks[k + 3] = pos[i]; stalks[k + 4] = pos[i + 1]; stalks[k + 5] = pos[i + 2];
      }
      layers.push({ id: `${id}:s`, kind: "linesegments", positions: stalks, vertexColors: p.vertexcolors, color: p.color, linewidth: p.linewidth });
      layers.push({ id: `${id}:m`, kind: "points", positions: pos, vertexColors: p.vertexcolors, color: p.color, size: p.markersize ?? 6 });
    }
    void ptYUp;
  });

  return { layers, labels };
}
