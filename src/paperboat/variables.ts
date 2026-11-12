// The shared-variable contract between an MX workspace and a Paperboat project.
//
// Paperboat's project variables are scalar/boolean/text; a live MX matrix is a separate kind of
// variable, carried on a signal wire (a Table) and never saved in the project. The bridge keeps
// scalars as numbers and marks matrices as `matrix`, not `text`.
import type { Variable, Variables } from "@paperboat/shared/protocol";
import type { WorkspaceVariable } from "../chart/samples.ts";

export type Source = "mx" | "paperboat";

export type SharedVariable = {
  name: string;
  shape: string;
  type: string;
  source: Source;
  /** What the bridge would write: only scalars are shareable today. */
  shareable: boolean;
  value?: number | boolean | string;
  /** A small preview for the workspace card. */
  preview?: number[];
  /** Broadcast to Paperboat: every variable, automatically. */
  shared: boolean;
};

const scalar = (v: WorkspaceVariable) => typeof v.value === "number";

/** Scalars keep their number; arrays become text (JSON when small, a typed descriptor otherwise). */
function broadcastValue(v: WorkspaceVariable): number | string {
  if (typeof v.value === "number") return v.value;
  const data = v.value ?? v.preview;
  if (data) {
    const text = JSON.stringify(data);
    if (text.length <= 4096) return text;
  }
  const preview = v.preview?.length ? ` · [${v.preview.join(", ")}]` : "";
  return `${v.type} ${v.shape}${preview}`;
}

export function fromPaperboat(v: Variable): SharedVariable {
  return {
    name: v.name,
    shape: "1",
    type: v.type,
    source: "paperboat",
    shareable: false,
    value: v.value,
    shared: true,
  };
}

export function mergeShared(
  mx: readonly WorkspaceVariable[],
  paperboat: readonly Variable[],
): SharedVariable[] {
  const pb = paperboat.map(fromPaperboat);
  const names = new Set(mx.map((v) => v.name));
  return [
    ...mx.map((v) => ({
      name: v.name,
      shape: v.shape,
      type: v.type,
      source: "mx" as const,
      shareable: true,
      value: scalar(v) ? (v.value as number) : undefined,
      preview: v.preview,
      shared: true,
    })),
    ...pb.filter((v) => !names.has(v.name)),
  ];
}

/**
 * The v0 bridge: take Paperboat's current list, replace/add the MX scalars the user shared,
 * and send the whole list back with `variables.set` (Paperboat has no client-side patch yet).
 * The same-name rule is deliberate: sharing `k` makes Paperboat's `k` the MX value.
 */
export function toPaperboat(mx: readonly WorkspaceVariable[], paperboat: readonly Variable[]): Variables {
  const byName = new Map(paperboat.map((v) => [v.name, v]));
  for (const v of mx) {
    if (scalar(v)) {
      byName.set(v.name, { name: v.name, type: "number", value: Number(v.value) });
      continue;
    }
    const matrix = v.type.startsWith("Matrix") || v.type.startsWith("Vector");
    byName.set(v.name, {
      name: v.name,
      type: matrix ? "matrix" : "text",
      value: broadcastValue(v),
      note: matrix ? "MX workspace — a matrix travels on signal wires" : "MX workspace — array data travels to blocks",
    });
  }
  return [...byName.values()];
}

/** The message the link sends when the shared set changes. */
export function setMessage(mx: readonly WorkspaceVariable[], paperboat: readonly Variable[]) {
  return { type: "variables.set" as const, source: "mx" as const, variables: toPaperboat(mx, paperboat) };
}
