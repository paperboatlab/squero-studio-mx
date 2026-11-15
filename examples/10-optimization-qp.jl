# 10-optimization-qp.jl — Quadratic programming with `SqueroBase.optimize`: two-asset portfolio.
#   [Julia] Base Julia · [SqueroPlot] plotting · [SqueroBase] `optimize` bridge · [Paperboat] OSQP solver
#
# Minimize risk ½ wᵀΣw where weights sum to 1 (`Aeq * w = beq`), expected return reaches at least
# 12 % (`-mu' * w <= -0.12`), and short selling is forbidden (`0 <= w <= 1`).
# Same `optimize(problem)` function as LP: including `H` selects the QP solver automatically.

Sigma = [0.040 0.006; 0.006 0.090]          # [Julia] asset return covariance matrix
mu = [0.10, 0.15]                           # [Julia] expected returns
problem = (
    H = Sigma, f = [0.0, 0.0],
    A = [-0.10 -0.15], b = [-0.12],         # return >= 12 %
    Aeq = [1.0 1.0], beq = [1.0],           # budget sum = 1
    lb = [0.0, 0.0], ub = [1.0, 1.0], x0 = [0.5, 0.5],
    options = (display = "iter", tol = 1e-8, max_iter = 5000),
)

optimize(problem)                           # [SqueroBase] → [Paperboat]: 60 % / 40 %, risk 1.58 %

# Efficient frontier along w₂ = 1 - w₁ and the resulting asset allocation.
w1 = range(0, 1; length = 201)
risk = [sqrt([w, 1 - w]' * Sigma * [w, 1 - w]) for w in w1]
ret = [mu' * [w, 1 - w] for w in w1]

fig = Figure(; size = (780, 380), title = "QP: portfolio allocation")   # [SqueroPlot]
ax1 = Axis(fig[1, 1]; title = "risk vs return", xlabel = "σ (risk)", ylabel = "expected return",
    xtickformat = "{:.2f}", ytickformat = vs -> ["$(round(Int, 100v)) %" for v in vs])
lines!(ax1, risk, ret; color = :gray, linewidth = 2, label = "budget line")
hlines!(ax1, [0.12]; color = :red, linestyle = :dash, label = "12 % floor")
scatter!(ax1, [sqrt([0.6, 0.4]' * Sigma * [0.6, 0.4])], [0.12]; color = :red, markersize = 12, label = "optimum")
axislegend(ax1; position = :lt)

ax2 = Axis(fig[1, 2]; title = "allocation", xticks = (1:2, ["asset 1", "asset 2"]), ylabel = "weight")
barplot!(ax2, 1:2, [0.6, 0.4]; color = [:steelblue, :orange])
text!(ax2, [1, 2], [0.6, 0.4]; text = ["60 %", "40 %"], align = (:center, :bottom), offset = (0, 4))
ylims!(ax2, 0, 0.75)
fig
