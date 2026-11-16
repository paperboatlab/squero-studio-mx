// The MX simulation run dock: reuses `@paperboat/shared/components` `Dock` to send `graph.run`
// (`control/state_space` or `control/rhs`) to an attached Paperboat backend and report progress.
import { Dock, NumberField } from "@paperboat/shared/components";
import type { Solver } from "./stateSpace.ts";

const DEFAULT_SOLVERS: Solver[] = ["auto", "rk4", "rk45", "rk2", "euler", "discrete", "cvode", "ida"];

export function SimRunDock({
  canRun,
  whyNot,
  running,
  progress,
  statusText,
  solvers,
  solver,
  step,
  duration,
  modelLabel,
  onSolver,
  onStep,
  onDuration,
  onRun,
  onCancel,
}: {
  canRun: boolean;
  whyNot?: string;
  running: boolean;
  progress: number | null;
  statusText?: string;
  solvers: readonly string[];
  solver: Solver;
  step: number;
  duration: number;
  modelLabel: string | null;
  onSolver: (solver: Solver) => void;
  onStep: (dt: number) => void;
  onDuration: (duration: number) => void;
  onRun: () => void;
  onCancel: () => void;
}) {
  const options = solvers.length > 0 ? ["auto", ...solvers.filter((s) => s !== "auto")] : DEFAULT_SOLVERS;
  const status = running ? "running" : statusText ? "done" : undefined;
  const shownStatus = running
    ? (progress !== null ? `${Math.round(progress * 100)}%` : "running…")
    : statusText;

  return (
    <div className="sim-dock-wrap">
      <Dock
        canRun={canRun}
        whyNot={whyNot}
        running={running}
        status={status}
        statusText={shownStatus}
        onRun={onRun}
        onCancel={onCancel}
        optionsSlot={
          // The shared dock's run options: muted labels, values in wells (plates.css).
          <span className="run-options" title={modelLabel ? `Simulates ${modelLabel} in the attached Paperboat backend` : whyNot}>
            solver
            <select value={solver} onChange={(e) => onSolver(e.target.value as Solver)} disabled={running} aria-label="Simulation solver">
              {options.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            dt
            <NumberField className="sim-num" value={step} valid={(v) => v > 0} onChange={onStep} disabled={running} aria-label="Step size (s)" />
            for
            <NumberField className="sim-num" value={duration} valid={(v) => v > 0} onChange={onDuration} disabled={running} aria-label="Duration (s)" />
            s
          </span>
        }
      />
    </div>
  );
}
