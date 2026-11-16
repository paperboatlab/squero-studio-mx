# 12-state-space.jl — State-space and ODE `rhs` simulation via Paperboat's run dock.
#   [Julia] setup (A, B, C, D, x0, f) · [Paperboat] state_space / rhs blocks + solvers
#
# Run this script to populate A, B, C, D, x0 (or `f` for nonlinear ODEs) in the workspace,
# attach a Paperboat backend (`paperboat start`), and press Run in the bottom stage dock.

A = [0.0 1.0; -4.0 -0.6]
B = [0.0; 1.0;;]
C = [1.0 0.0]
D = [0.0;;]
x0 = [1.0, 0.0]

# Nonlinear Van der Pol / damped oscillator right-hand side for the `rhs` block:
# (Set `f` and `x0`, or clear A/B/C/D to let the run dock pick `rhs` automatically.)
f = "x2; -4 * x1 - 0.6 * x2"

graph = (
    nodes = [
        (id = "ode", type = "rhs", params = (f = f, x0 = "1; 0", solver = "rk45")),
        (id = "x_plot", type = "graph", params = NamedTuple()),
    ],
    edges = [(from = ["ode", "x"], to = ["x_plot", "in"])],
)
sim_rhs = simulate(graph; duration = 10, dt = 0.01, solver = :rk45)
println("Workspace ready for Paperboat simulation (", size(A, 1), " states).")
