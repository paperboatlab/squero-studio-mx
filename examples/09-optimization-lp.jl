# 09-optimization-lp.jl — Linear programming with `SqueroBase.optimize`: furniture workshop plan.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] `optimize` bridge · [Paperboat] OSQP solver
#
# Make chairs (x₁) and tables (x₂). Each chair earns 3, each table earns 2; maximizing profit is
# equivalent to minimizing fᵀx = -3x₁ - 2x₂ subject to A x <= b and x >= 0.
# The app invokes Paperboat's optimizer asynchronously, binds `x_opt` and `f_opt`, and adds the
# objective surface figure to your history alongside the constraint geometry drawn below.

f = [-3.0, -2.0]                            # [Julia] negative profit coefficients
A = [2.0 1.0; 1.0 2.0; 1.0 1.0]             # [Julia] assembly, finishing, wood constraints
b = [8.0, 8.0, 5.0]
lb = [0.0, 0.0]                             # no negative furniture
options = (display = "iter", tol = 1e-8, max_iter = 5000)   # [Julia] NamedTuple options
problem = (f = f, A = A, b = b, lb = lb, x0 = [0.0, 0.0], options = options)

optimize(problem)                           # [SqueroBase] → [Paperboat]: x_opt ≈ [3, 2], profit = 13

# Visualize profit contours, feasible polygon corners, and half-plane constraint lines.
xs = range(0, 5; length = 120)
profit = [3x + 2y for x in xs, y in xs]
corners = [(0, 0), (4, 0), (3, 2), (2, 3), (0, 4)]

fig = Figure(; size = (640, 500), title = "LP: workshop plan")   # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "workshop plan", xlabel = "chairs x₁", ylabel = "tables x₂",
    limits = (0, 5, 0, 5), aspect = DataAspect())
cf = contourf!(ax, xs, xs, profit; levels = 12, colormap = :Blues)
poly!(ax, corners; color = (:gold, 0.45), label = "feasible region")
for (i, name) in enumerate(("assembly", "finishing", "wood"))
    ablines!(ax, b[i] / A[i, 2], -A[i, 1] / A[i, 2]; label = name, linewidth = 2)
end
scatter!(ax, [3.0], [2.0]; color = :red, markersize = 14, marker = :star5, label = "optimum (3, 2)")
axislegend(ax; position = :rt)
Colorbar(fig[1, 2], cf; label = "profit")
fig
