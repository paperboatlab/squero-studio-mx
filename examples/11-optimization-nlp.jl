# 11-optimization-nlp.jl — Nonlinear programming with `SqueroBase.optimize`: constrained sensor placement.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] `optimize` bridge · [Paperboat] Ipopt solver
#
# Place a sensor (x₁, x₂) on the walkway `x₁ + x₂ = 2` inside circular coverage `x₁² + x₂² <= 2`,
# as close as possible to the target (1, 2). Providing `fun` and `nonlcon` selects Paperboat's
# Ipopt NLP solver automatically through the same `optimize(problem)` bridge.

fun = "(x1 - 1)^2 + (x2 - 2)^2"             # [Julia] objective expression string parsed by Paperboat
problem = (
    fun = fun, x0 = [0.5, 1.5],
    Aeq = [1.0 1.0], beq = [2.0],           # walkway equality x₁ + x₂ = 2
    lb = [0.0, 0.0], ub = [2.0, 2.0],
    nonlcon = (c = ["x1^2 + x2^2 - 2"],),   # circular coverage: c(x) <= 0
    options = (display = "iter", tol = 1e-8, max_iter = 400),
)

optimize(problem)                           # [SqueroBase] → [Paperboat]: sensor at (1, 1), objective = 1

# Plot objective level curves, feasible circular disc, walkway line, and annotation arrow.
xs = range(0, 2; length = 150)
dist2 = [(x - 1)^2 + (y - 2)^2 for x in xs, y in xs]
θ = range(0, π / 2; length = 100)

fig = Figure(; size = (580, 520), title = "NLP: sensor placement")   # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "sensor placement", xlabel = "x₁", ylabel = "x₂",
    aspect = DataAspect(), limits = (0, 2, 0, 2))
contour!(ax, xs, xs, dist2; levels = 10, colormap = :grays)
lines!(ax, sqrt(2) .* cos.(θ), sqrt(2) .* sin.(θ); color = :teal, linewidth = 2, label = "coverage |x| = √2")
band!(ax, sqrt(2) .* cos.(θ), zeros(100), sqrt(2) .* sin.(θ); color = (:teal, 0.12))
ablines!(ax, 2.0, -1.0; color = :orange, linewidth = 2, label = "walkway x₁ + x₂ = 2")
scatter!(ax, [1.0], [2.0]; marker = :xcross, markersize = 14, color = :black, label = "target")
scatter!(ax, [1.0], [1.0]; color = :crimson, markersize = 12, label = "sensor (1, 1)")
annotation!(ax, 1.45, 0.45, 1.0, 1.0; text = "distance² = 1")
axislegend(ax; position = :lb)
fig
