// Demo workspaces: one per script, as MATLAB shows. Replaced by the kernel's `whos` when the
// session is attached; the shapes and types are the real ones.
export type WorkspaceVariable = {
  name: string;
  shape: string;
  type: "Matrix{Float64}" | "Vector{Float64}" | "Float64";
  /** A small preview, if the app has one (the workspace card glyph). */
  preview?: number[];
  /** The scalar or vector value the bridge publishes. */
  value?: number | number[] | number[][];
};

export const demoWorkspaces: Record<string, WorkspaceVariable[]> = {
  "surface.jl": [
    { name: "A", shape: "512 × 512", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2], value: [1, 0.5, 0.25] },
    { name: "x", shape: "512", type: "Vector{Float64}", preview: [0, 0.4, 0.7, 0.4, 0.1] },
    { name: "t", shape: "500", type: "Vector{Float64}", preview: [0, 0.2, 0.5, 0.7, 1] },
    { name: "k", shape: "1", type: "Float64", value: 0.42 },
  ],
  "lorenz.jl": [
    { name: "t", shape: "5000", type: "Vector{Float64}", preview: [0, 0.2, 0.5, 0.7, 1] },
    { name: "x", shape: "5000", type: "Vector{Float64}", preview: [0.2, 0.6, 0.4, 0.8, 0.3] },
    { name: "y", shape: "5000", type: "Vector{Float64}", preview: [0.1, 0.5, 0.9, 0.4, 0.2] },
    { name: "z", shape: "5000", type: "Vector{Float64}", preview: [0.3, 0.4, 0.6, 0.9, 0.5] },
  ],
  "state_space.jl": [
    { name: "A", shape: "4 × 4", type: "Matrix{Float64}", preview: [0.2, 0.4, 0.1, 0.6, 0.3] },
    { name: "B", shape: "4 × 1", type: "Matrix{Float64}", preview: [0.1, 0.2, 0.3, 0.4, 0.5] },
    { name: "C", shape: "1 × 4", type: "Matrix{Float64}", preview: [0.5, 0.4, 0.3, 0.2, 0.1] },
    { name: "D", shape: "1 × 1", type: "Matrix{Float64}", preview: [0.1, 0.1, 0.1, 0.1, 0.1] },
    { name: "x0", shape: "4", type: "Vector{Float64}", preview: [0, 0, 0, 0, 0] },
  ],
  "export.jl": [
    { name: "A", shape: "512 × 512", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2] },
    { name: "sel", shape: "1284", type: "Vector{Float64}", preview: [0.2, 0.5, 0.3, 0.8, 0.4] },
  ],
  "plots/peaks.jl": [
    { name: "A", shape: "512 × 512", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2] },
    { name: "x", shape: "512", type: "Vector{Float64}", preview: [0, 0.4, 0.7, 0.4, 0.1] },
    { name: "y", shape: "512", type: "Vector{Float64}", preview: [0.1, 0.6, 0.4, 0.8, 0.3] },
  ],
};

export const times = Float64Array.from({ length: 500 }, (_, i) => i * 0.01);
export const sampled = Float64Array.from(times, (t) => Math.sin(t * 3) * 0.6 + Math.sin(t * 11) * 0.12);
export const sampled2 = Float64Array.from(times, (t) => Math.cos(t * 2) * 0.35 + Math.sin(t * 7) * 0.08);
