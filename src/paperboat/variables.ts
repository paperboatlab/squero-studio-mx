// The shared-variable contract between an MX workspace and a Paperboat project.
//
// MX broadcasts its workspace as live variables (`variables.set` with source mx); Paperboat shows
// them beside its project variables and never saves them. Scalars stay numbers; an array is a
// `matrix` carrying its whole rows ("1 2; 3 4", what the matrix blocks parse), or, past
// LIVE_LIMIT values, no value and a note saying why. A run puts the value where it is bound.
import type { Variable, Variables } from "@paperboat/shared/protocol";
import type { WorkspaceVariable } from "../chart/samples.ts";

export type Source = "mx" | "paperboat";

/** Arrays up to this many values travel whole to Paperboat; a larger one says it is too large. */
export const LIVE_LIMIT = 4096;

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

const shapeOf = (shape: string): [number, number] | null => {
  const match = /^(\d+)(?:\s*×\s*(\d+))?$/.exec(shape.trim());
  return match ? [Number(match[1]), Number(match[2] ?? 1)] : null;
};

/** A matrix in the text the matrix blocks parse (`1 2; 3 4`), when the whole matrix is here.
 *  A vector is a column, as in Julia. Only a preview (too large, not numeric): undefined. */
function matrixText(v: WorkspaceVariable): string | undefined {
  const data = v.value;
  if (Array.isArray(data) && Array.isArray(data[0]))
    return (data as number[][]).map((row) => row.join(" ")).join("; ");
  const shape = shapeOf(v.shape);
  if (Array.isArray(data) && shape && data.length === shape[0] * shape[1]) {
    const flat = data as number[];
    const rows: string[] = [];
    for (let r = 0; r < shape[0]; r++) rows.push(flat.slice(r * shape[1], (r + 1) * shape[1]).join(" "));
    return rows.join("; ");
  }
  return undefined;
}

/** Why an array has no value in the broadcast: one line, with what to do about it. */
function withheld(v: WorkspaceVariable): string {
  const shape = shapeOf(v.shape);
  const count = shape ? shape[0] * shape[1] : 0;
  return count > LIVE_LIMIT
    ? `${v.shape} ${v.type}: too large to share live (${count} values, limit ${LIVE_LIMIT}); share a slice such as ${v.name}[1:10, 1:10]`
    : `${v.shape} ${v.type}: not a numeric array MX can share`;
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
      shared: v.type !== "Function",
    })),
    ...pb.filter((v) => !names.has(v.name)),
  ];
}

/**
 * MX's own workspace as live variables: numbers stay numbers, arrays are `matrix` with their
 * whole rows (or no value and a note saying why). Paperboat keeps them beside its project
 * variables, not in them; a same-named project variable is shadowed while MX shares one.
 */
export function toPaperboat(mx: readonly WorkspaceVariable[]): Variables {
  return mx.filter((v) => v.type !== "Function").map((v): Variable => {
    if (scalar(v)) return { name: v.name, type: "number", value: Number(v.value) };
    if (typeof v.value === "boolean" || typeof v.value === "string")
      return { name: v.name, type: typeof v.value === "boolean" ? "boolean" : "text", value: v.value };
    if (v.type.startsWith("Matrix") || v.type.startsWith("Vector")) {
      const text = matrixText(v);
      return text === undefined ? { name: v.name, type: "matrix", note: withheld(v) } : { name: v.name, type: "matrix", value: text };
    }
    return { name: v.name, type: "text", value: `${v.type} ${v.shape}`.trim(), note: "MX workspace: not a number or an array" };
  });
}

/** The message the link sends when the shared set changes. */
export function setMessage(mx: readonly WorkspaceVariable[]) {
  return { type: "variables.set" as const, source: "mx" as const, variables: toPaperboat(mx) };
}
