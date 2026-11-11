# box-constrained.jl — a quadratic program with only bounds.
#
# `lb`/`ub` alone are enough: `optimize` uses the bound-constrained QP path,
# with no A/b or Aeq/beq rows.
H = [1.0 0.0; 0.0 1.0]
f = [-2.0, -3.0]
lb = [0.0, 0.0]
ub = [1.0, 1.0]
x0 = [0.5, 0.5]
problem = (H = H, f = f, lb = lb, ub = ub, x0 = x0)

# The unconstrained optimum would be [2, 3]; the box clips it to [1, 1].
x = optimize(problem)

xg = range(0, 1, length=60)
yg = range(0, 1, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = 0.5 .* (Xg.^2 .+ Yg.^2) .- 2 .* Xg .- 3 .* Yg
surf(Xg, Yg, Zg)
scatter([1.0], [1.0])
