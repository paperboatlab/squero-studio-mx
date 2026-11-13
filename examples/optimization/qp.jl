# qp.jl — a two-asset portfolio, solved by Paperboat through `optimize`.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] the bridge · [Paperboat] the solver
#
# Minimize risk ½ wᵀΣw. The budget is fully invested (Σw = 1), the expected return must be at
# least 12 %, and shorting is not allowed.
Sigma = [0.040 0.006; 0.006 0.090]          # [Julia] covariance of the two assets
mu = [0.10, 0.15]                           # expected returns
problem = (H = Sigma, f = [0.0, 0.0],
    A = [-0.10 -0.15], b = [-0.12],         # -return <= -0.12  →  return >= 12 %
    Aeq = [1.0 1.0], beq = [1.0],
    lb = [0.0, 0.0], ub = [1.0, 1.0], x0 = [0.5, 0.5],
    options = (display = "iter", tol = 1e-8, max_iter = 5000))

optimize(problem)                           # [SqueroBase] → [Paperboat]: 60 % / 40 %, risk 1.58 %

# The efficient frontier, computed in Julia along the budget line w₂ = 1 - w₁.
w1 = range(0, 1; length = 201)              # [Julia]
risk = [sqrt([w, 1 - w]' * Sigma * [w, 1 - w]) for w in w1]   # [Julia] σ of the portfolio
ret = [mu' * [w, 1 - w] for w in w1]        # [Julia]

fig = Figure(; size = (760, 380))           # [SqueroPlot]
ax1 = Axis(fig[1, 1]; title = "risk vs return", xlabel = "σ (risk)", ylabel = "expected return",
    xtickformat = "{:.2f}", ytickformat = vs -> ["$(round(Int, 100v)) %" for v in vs])  # [SqueroPlot] tick formats
lines!(ax1, risk, ret; color = :gray, label = "budget line")                   # [SqueroPlot]
hlines!(ax1, [0.12]; color = :red, linestyle = :dash, label = "12 % floor")    # [SqueroPlot]
scatter!(ax1, [sqrt([0.6, 0.4]' * Sigma * [0.6, 0.4])], [0.12]; color = :red, markersize = 12, label = "optimum")
axislegend(ax1; position = :lt)
ax2 = Axis(fig[1, 2]; title = "allocation", xticks = (1:2, ["asset 1", "asset 2"]), ylabel = "weight")
barplot!(ax2, 1:2, [0.6, 0.4]; color = [:steelblue, :orange])                  # [SqueroPlot]
text!(ax2, [1, 2], [0.6, 0.4]; text = ["60 %", "40 %"], align = (:center, :bottom), offset = (0, 4))  # [SqueroPlot]
ylims!(ax2, 0, 0.75)                        # [SqueroPlot]
fig
