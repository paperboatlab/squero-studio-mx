// The MX simulation run dock: reuses `@paperboat/shared/components` `Dock` to send `graph.run`
// (`control/state_space` or `control/rhs`) to an attached Paperboat backend and report progress.
import { Dock } from "@paperboat/shared/components";
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
          <div className="sim-dock-opts" title={modelLabel ?? whyNot ?? "Simulation settings"}>
            {modelLabel && <span className="sim-model-tag">{modelLabel}</span>}
            <label className="sim-opt">
              <span>solver</span>
              <select
                value={solver}
                onChange={(e) => onSolver(e.target.value as Solver)}
                disabled={running}
                aria-label="Simulation solver"
              >
                {options.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="sim-opt">
              <span>dt</span>
              <input
                type="number"
                min="0.0001"
                step="0.005"
                value={step}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) onStep(v);
                }}
                disabled={running}
                aria-label="Step size (s)"
              />
            </label>
            <label className="sim-opt">
              <span>T</span>
              <input
                type="number"
                min="0.01"
                step="1"
                value={duration}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) onDuration(v);
                }}
                disabled={running}
                aria-label="Duration (s)"
              />
            </label>
          </div>
        }
      />
    </div>
  );
}
