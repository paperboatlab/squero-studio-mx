# qp.jl — a quadratic program, solved automatically by `optimize`.
#
# `H` makes the objective quadratic: 1/2 x'Hx + f'x. The same `optimize`
# call routes it to the optimization/qp block; bounds are just more fields.
H = [2.0 0.0; 0.0 2.0]
f = [-2.0, -1.0]
Aeq = [1.0 1.0]
beq = [1.0]
lb = [0.0, 0.0]
ub = [1.0, 1.0]
x0 = [0.5, 0.5]
problem = (H = H, f = f, Aeq = Aeq, beq = beq, lb = lb, ub = ub, x0 = x0)

# The answer is x = [0.75, 0.25].
x = optimize(problem)

# A contour-like surface of the objective and the solution.
xg = range(0, 1, length=60)
yg = range(0, 1, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = Xg .^ 2 .+ Yg .^ 2 .- 2 .* Xg .- Yg
surf(Xg, Yg, Zg)
scatter([0.75], [0.25])
