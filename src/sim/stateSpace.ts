// The state-space bridge: Julia computes A, B, C, D and x0; Paperboat's `state_space` block
// integrates them with the run's solver. MX never integrates locally.
export type Solver = "auto" | "rk4" | "rk45" | "rk2" | "euler" | "discrete" | "cvode" | "ida";

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

/** What the app will send to the backend once the `state_space` block lands. */
export function runRequest(run: StateSpaceRun) {
  return {
    type: "graph.run" as const,
    settings: { solver: run.solver, step: run.step, duration: run.duration },
    // The block's params are the matrices; the exact node shape lands with the block.
    graph: { nodes: [], edges: [] },
  };
}
