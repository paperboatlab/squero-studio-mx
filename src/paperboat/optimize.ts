// What `/__mx/optimize` returns: Paperboat's solver result (`paperboat optimize --json --grid N`).
// A 2-variable result carries a grid of the objective; the kernel draws it with SqueroPlot.
export type OptimizationResult = {
  ok: boolean;
  kind?: "lp" | "qp" | "nlp";
  status?: string;
  objective?: number;
  iterations?: number;
  x?: number[];
  trace?: string[];
  /** `z[row][col]` is the objective at `(x[col], y[row])`. */
  grid?: { x: number[]; y: number[]; z: number[][] };
  error?: string;
};

/** One problem to the Paperboat solver, over the launcher's bridge. */
export async function solveProblem(problem: unknown, grid = 41): Promise<OptimizationResult> {
  try {
    const response = await fetch("/__mx/optimize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ problem, grid }),
    });
    return (await response.json()) as OptimizationResult;
  } catch (error) {
    return { ok: false, error: `optimize bridge: ${String((error as Error).message ?? error)}` };
  }
}
