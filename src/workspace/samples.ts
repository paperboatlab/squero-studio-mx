// Demo workspaces: one per script, as MATLAB shows. Replaced by the kernel's `whos` when the
// session is attached; the shapes and types are the real ones.
export type WorkspaceVariable = {
  name: string;
  shape: string;
  /** Julia's type name: Matrix{Float64}, Vector{Int64}, Float64, Int64, Function… */
  type: string;
  /** A small preview, if the app has one (the workspace card glyph). */
  preview?: number[];
  /** The scalar, text or array value (whole when the kernel sent it, else a preview). */
  value?: number | boolean | string | number[] | number[][];
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
  "examples/subplots.jl": [
    { name: "x", shape: "101", type: "Vector{Float64}", preview: [0, 0.2, 0.5, 0.8, 1] },
    { name: "A", shape: "64 × 64", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2] },
  ],
  "examples/lines.jl": [
    { name: "x", shape: "101", type: "Vector{Float64}", preview: [0, 0.2, 0.5, 0.8, 1] },
  ],
  "examples/surfaces.jl": [
    { name: "A", shape: "64 × 64", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2] },
  ],
  "plots/peaks.jl": [
    { name: "A", shape: "512 × 512", type: "Matrix{Float64}", preview: [0.1, 0.3, 0.85, 0.4, 0.2] },
    { name: "x", shape: "512", type: "Vector{Float64}", preview: [0, 0.4, 0.7, 0.4, 0.1] },
    { name: "y", shape: "512", type: "Vector{Float64}", preview: [0.1, 0.6, 0.4, 0.8, 0.3] },
  ],
};
