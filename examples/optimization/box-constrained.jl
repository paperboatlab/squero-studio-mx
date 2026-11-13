# box-constrained.jl — two pumps with operating limits, solved by Paperboat through `optimize`.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] the bridge · [Paperboat] the solver
#
# Each pump runs between 0 and 1. The energy cost is quadratic and the task rewards running them;
# the unconstrained best is (2, 3), so the box clips it to (1, 1).
H = [1.0 0.0; 0.0 1.0]                      # [Julia]
f = [-2.0, -3.0]
problem = (H = H, f = f, lb = [0.0, 0.0], ub = [1.0, 1.0], x0 = [0.5, 0.5],
    options = (display = "iter", tol = 1e-8, max_iter = 5000))

optimize(problem)                           # [SqueroBase] → [Paperboat]: both pumps at 1

# The cost around the box: the unconstrained minimum lies outside, the answer at the corner.
cost(x, y) = 0.5 * (x^2 + y^2) - 2x - 3y    # [Julia]
xs = range(-0.5, 3; length = 120)
Z = [cost(x, y) for x in xs, y in xs]

fig = Figure(; size = (560, 500))           # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "pump cost", xlabel = "pump 1", ylabel = "pump 2", aspect = DataAspect())
cf = contourf!(ax, xs, xs, Z; levels = 14, colormap = :viridis)       # [SqueroPlot]
poly!(ax, [(0, 0), (1, 0), (1, 1), (0, 1)]; color = (:white, 0.25), strokecolor = :white, strokewidth = 2)  # [SqueroPlot] the box
scatter!(ax, [2.0], [3.0]; marker = :xcross, color = :white, strokecolor = :black, strokewidth = 1, markersize = 16, label = "unconstrained (2, 3)")
scatter!(ax, [1.0], [1.0]; color = :red, markersize = 14, label = "answer (1, 1)")
annotation!(ax, 2.2, 0.4, 1.0, 1.0; text = "clipped", color = :white)
axislegend(ax; position = :lt)
Colorbar(fig[1, 2], cf)
fig
