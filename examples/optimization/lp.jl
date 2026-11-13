# lp.jl — a furniture workshop plan, solved by Paperboat through `optimize`.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] the optimization bridge
#   [Paperboat] the solver (it runs in Paperboat, not in Julia)
#
# Make chairs (x1) and tables (x2). A chair earns 3, a table 2; maximize the profit, which is the
# same as minimizing its negative.
f = [-3.0, -2.0]                            # [Julia]

# Assembly: 2 h per chair + 1 h per table <= 8 h
# Finishing: 1 h per chair + 2 h per table <= 8 h
# Wood:      1 unit per chair + 1 per table <= 5 units
A = [2.0 1.0; 1.0 2.0; 1.0 1.0]
b = [8.0, 8.0, 5.0]
lb = [0.0, 0.0]                             # no negative furniture
options = (display = "iter", tol = 1e-8, max_iter = 5000)   # [Julia] a NamedTuple
problem = (f = f, A = A, b = b, lb = lb, x0 = [0.0, 0.0], options = options)

# [SqueroBase] queue the problem; [Paperboat] solves it. The app prints the iterations, binds
# x_opt and f_opt, and adds a SqueroPlot surface of the objective with the optimum marked.
optimize(problem)

# Our own view of the problem: the profit over the plane, the constraints and the feasible corner.
xs = range(0, 5; length = 120)              # [Julia]
profit = [3x + 2y for x in xs, y in xs]     # [Julia]
corners = [(0, 0), (4, 0), (3, 2), (2, 3), (0, 4)]   # [Julia] where the constraints meet
@assert all(all(A * [p...] .<= b .+ 1e-9) for p in corners)   # [Julia] each corner is feasible

fig = Figure(; size = (620, 500))           # [SqueroPlot]
ax = Axis(fig[1, 1]; title = "workshop plan", xlabel = "chairs x₁", ylabel = "tables x₂",
    limits = (0, 5, 0, 5), aspect = DataAspect())
cf = contourf!(ax, xs, xs, profit; levels = 12, colormap = :Blues)             # [SqueroPlot] profit levels
poly!(ax, corners; color = (:gold, 0.45), label = "feasible")   # [SqueroPlot] its edges are the constraint lines below
for (i, name) in enumerate(("assembly", "finishing", "wood"))                  # [Julia]
    ablines!(ax, b[i] / A[i, 2], -A[i, 1] / A[i, 2]; label = name, linewidth = 2)   # [SqueroPlot] a₁x₁ + a₂x₂ = b
end
scatter!(ax, [3.0], [2.0]; color = :red, markersize = 14, marker = :star5, label = "optimum (3, 2)")  # [SqueroPlot]
axislegend(ax; position = :rt)
Colorbar(fig[1, 2], cf; label = "profit")  # [SqueroPlot]
fig
