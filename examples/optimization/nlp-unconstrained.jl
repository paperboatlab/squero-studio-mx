# nlp-unconstrained.jl — the Rosenbrock valley, solved by Paperboat through `optimize`.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] the bridge · [Paperboat] the solver
#
# No bounds and no constraints: an objective and a start. With two variables the app also draws
# Paperboat's grid of the objective as a SqueroPlot surface with the optimum marked.
problem = (fun = "(1 - x1)^2 + 100 * (x2 - x1^2)^2", x0 = [-1.2, 1.0],
    options = (display = "iter", tol = 1e-10, max_iter = 800))

optimize(problem)                           # [SqueroBase] → [Paperboat]: x = [1, 1], objective 0

# The valley on a log colour scale, from Julia's own evaluation of the same function.
rosen(x, y) = (1 - x)^2 + 100 * (y - x^2)^2  # [Julia]
xs = range(-2, 2; length = 160)
ys = range(-1, 3; length = 160)
L = [log10(rosen(x, y) + 1e-3) for x in xs, y in ys]   # [Julia] log10 so the valley floor shows

fig = Figure(; size = (900, 420))           # [SqueroPlot]
ax1 = Axis(fig[1, 1]; title = "log₁₀ f", xlabel = "x₁", ylabel = "x₂")
hm = heatmap!(ax1, xs, ys, L; colormap = :inferno)                    # [SqueroPlot]
contour!(ax1, xs, ys, L; levels = 12, color = (:white, 0.5), linewidth = 0.6)
scatter!(ax1, [-1.2], [1.0]; color = :white, strokecolor = :black, strokewidth = 1, markersize = 10, label = "start")
scatter!(ax1, [1.0], [1.0]; color = :cyan, marker = :star5, markersize = 16, label = "minimum")
axislegend(ax1; position = :lb, backgroundcolor = (:white, 0.8))
Colorbar(fig[1, 2], hm; label = "log₁₀ f")
ax2 = Axis3(fig[1, 3]; title = "the valley", zlabel = "log₁₀ f", azimuth = 1.35π, elevation = 0.18π)   # [SqueroPlot]
surface!(ax2, xs[1:4:end], ys[1:4:end], L[1:4:end, 1:4:end]; colormap = :inferno)
fig
