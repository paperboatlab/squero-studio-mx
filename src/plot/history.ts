// The figure history. SqueroPlot (in the kernel) draws every figure and stores its artifacts per
// version; the app keeps its own copy of each version's bytes, so the history survives `clear`,
// `clc`, file switches, a closed figure, a reset or a restarted kernel. Nothing here draws.
import type { FigureFormat, FigureMeta } from "../kernel/protocol.ts";
import type { FigureScene } from "./scene.ts";

export type FigureEntry = {
  /** The history entry (one per figure version). */
  key: string;
  /** The kernel's figure id (`figure-3`) and the snapshot's content version. */
  figure: string;
  version: string;
  /** The script that ran, and when. */
  source: string;
  time: number;
  title: string;
  width: number;
  height: number;
  plots: number;
  axes: number;
  /** Source lines that drew into the figure. */
  lines: number[];
  /** The stored artifacts, as SqueroPlot wrote them. */
  artifacts: Partial<Record<FigureFormat, Uint8Array>>;
  /** Cached structured interactive scene (2D/3D typed arrays + layout), surviving kernel reset. */
  scene?: FigureScene;
  /** An object URL of the SVG (or PNG) the stage and the list show. */
  preview?: string;
};

export const MIME: Record<FigureFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  eps: "application/postscript",
  html: "text/html",
};

export const entryKey = (meta: Pick<FigureMeta, "id" | "version">) => `${meta.id}@${meta.version}`;

export function entryFrom(meta: FigureMeta, source: string, time = Date.now()): FigureEntry {
  return {
    key: entryKey(meta),
    figure: meta.id,
    version: meta.version,
    source,
    time,
    title: meta.title,
    width: meta.width,
    height: meta.height,
    plots: meta.plots,
    axes: meta.axes,
    lines: meta.lines ?? [],
    artifacts: {},
  };
}

/**
 * Add the run's figures to the front of the history, newest first. A version already in the
 * history is not added again: an entry is made only when the drawing changed.
 */
export function addEntries(history: FigureEntry[], fresh: FigureEntry[]): FigureEntry[] {
  const have = new Set(history.map((one) => one.key));
  const added: FigureEntry[] = [];
  for (const entry of fresh) {
    if (have.has(entry.key)) continue;
    have.add(entry.key);
    added.push(entry);
  }
  return [...added.reverse(), ...history];
}

/** The entry an editor line points at: one that line drew into, else the file's latest figure. */
export function entryForLine(history: FigureEntry[], source: string, line: number): FigureEntry | undefined {
  const fromFile = history.filter((one) => one.source === source);
  return fromFile.find((one) => one.lines.includes(line)) ?? fromFile[0];
}

/** `Waves`, or the script's name, for the list and the file names. */
export const entryLabel = (entry: FigureEntry) => entry.title || (entry.source.split("/").pop() ?? "figure");

/** A safe file name for an entry; numbered when several are exported together. */
export function figureFileName(entry: FigureEntry, format: FigureFormat, index: number, total: number): string {
  const base = (entry.title || entry.source.split("/").pop() || "figure").replace(/\.jl$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "figure";
  return `${total > 1 ? `${String(index + 1).padStart(2, "0")}-` : ""}${base}.${format}`;
}
