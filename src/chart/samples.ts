// Demo workspace and run samples. Replaced by the kernel's `whos` and a Paperboat run's
// `signal` samples once the bridge is in place; the shapes and types are the real ones.
export type WorkspaceVariable = {
  name: string;
  shape: string;
  type: "Matrix{Float64}" | "Vector{Float64}" | "Float64";
  /** A small preview, if the app has one (the workspace card glyph). */
  preview?: number[];
  /** The scalar or vector value the bridge publishes. */
  value?: number | number[];
};

export const demoVariables: WorkspaceVariable[] = [
  { name: "A", shape: "512 × 512", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2], value: [1, 0.5, 0.25] },
  { name: "x", shape: "512", type: "Vector{Float64}", preview: [0, 0.4, 0.7, 0.4, 0.1] },
  { name: "t", shape: "500", type: "Vector{Float64}", preview: [0, 0.2, 0.5, 0.7, 1] },
  { name: "k", shape: "1", type: "Float64", value: 0.42 },
];

export const times = Float64Array.from({ length: 500 }, (_, i) => i * 0.01);
export const sampled = Float64Array.from(times, (t) => Math.sin(t * 3) * 0.6 + Math.sin(t * 11) * 0.12);
export const sampled2 = Float64Array.from(times, (t) => Math.cos(t * 2) * 0.35 + Math.sin(t * 7) * 0.08);
