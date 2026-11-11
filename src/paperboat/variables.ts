// The shared-variable contract between an MX workspace and a Paperboat project.
//
// Paperboat's `Variable` is a scalar/boolean/text used by params and expressions; matrices and
// vectors are not project variables (they travel as Table/matrix handles to blocks). So the
// bridge shares MX scalars and leaves matrices to `state_space`/matrix blocks.
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
  /** Broadcast to Paperboat: every scalar, automatically. */
  shared: boolean;
};

const scalar = (v: WorkspaceVariable) => v.type === "Float64" && typeof v.value !== "object";

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
      shareable: scalar(v),
      value: scalar(v) ? (v.value as number) : undefined,
      preview: v.preview,
      shared: scalar(v),
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
    if (!scalar(v)) continue;
    byName.set(v.name, { name: v.name, type: "number", value: Number(v.value) });
  }
  return [...byName.values()];
}

/** The message the link sends when the shared set changes. */
export function setMessage(mx: readonly WorkspaceVariable[], paperboat: readonly Variable[]) {
  return { type: "variables.set" as const, variables: toPaperboat(mx, paperboat) };
}
