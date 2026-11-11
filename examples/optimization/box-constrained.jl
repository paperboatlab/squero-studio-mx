# box-constrained.jl — two pumps with operating limits, solved by `optimize`.
#
# Each pump runs between 0 and 1. The energy cost is quadratic, and the task
# rewards running them; the unconstrained best is [2, 3], so the box clips it.
H = [1.0 0.0; 0.0 1.0]
f = [-2.0, -3.0]
lb = [0.0, 0.0]
ub = [1.0, 1.0]
x0 = [0.5, 0.5]
options = (display = "iter", tol = 1e-8, max_iter = 5000)
problem = (H = H, f = f, lb = lb, ub = ub, x0 = x0, options = options)

# Answer: both pumps at their limit, x = [1, 1].
x_opt = optimize(problem)

xg = range(0, 1, length=60)
yg = range(0, 1, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = 0.5 .* (Xg.^2 .+ Yg.^2) .- 2 .* Xg .- 3 .* Yg
surf(Xg, Yg, Zg)
scatter([1.0], [1.0])
