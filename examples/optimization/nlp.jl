# nlp.jl — a sensor on a walkway, solved by Paperboat (Ipopt) through `optimize`.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] the bridge · [Paperboat] the solver
#
# A sensor must stay on the walkway x1 + x2 = 2 and inside the circular coverage of radius √2
# around the origin. Put it as close as possible to the target (1, 2). The objective and the
# circle are nonlinear, so the same `optimize` call routes to the NLP solver.
fun = "(x1 - 1)^2 + (x2 - 2)^2"             # an expression string: Paperboat parses it, not Julia
problem = (fun = fun, x0 = [0.5, 1.5],
    Aeq = [1.0 1.0], beq = [2.0],
    lb = [0.0, 0.0], ub = [2.0, 2.0],
    nonlcon = (c = ["x1^2 + x2^2 - 2"],),   # inside the circle: c(x) <= 0
    options = (display = "iter", tol = 1e-8, max_iter = 400))

optimize(problem)                           # [SqueroBase] → [Paperboat]: the sensor at (1, 1)

# The geometry, drawn with SqueroPlot: distance levels, the circle, the walkway and the answer.
xs = range(0, 2; length = 150)              # [Julia]
dist2 = [(x - 1)^2 + (y - 2)^2 for x in xs, y in xs]
θ = range(0, π / 2; length = 100)

fig = Figure(; size = (560, 520))           # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "sensor placement", xlabel = "x₁", ylabel = "x₂", aspect = DataAspect(),
    limits = (0, 2, 0, 2))
contour!(ax, xs, xs, dist2; levels = 10, colormap = :grays)                   # [SqueroPlot] iso-distance
lines!(ax, sqrt(2) .* cos.(θ), sqrt(2) .* sin.(θ); color = :teal, linewidth = 2, label = "coverage |x| = √2")
band!(ax, sqrt(2) .* cos.(θ), zeros(100), sqrt(2) .* sin.(θ); color = (:teal, 0.12))   # [SqueroPlot] the allowed disc
ablines!(ax, 2.0, -1.0; color = :orange, linewidth = 2, label = "walkway x₁ + x₂ = 2")
scatter!(ax, [1.0], [2.0]; marker = :xcross, markersize = 14, color = :black, label = "target")
scatter!(ax, [1.0], [1.0]; color = :red, markersize = 12, label = "sensor (1, 1)")
annotation!(ax, 1.45, 0.45, 1.0, 1.0; text = "distance² = 1")                 # [SqueroPlot] an arrow and a note
axislegend(ax; position = :lb)
fig
