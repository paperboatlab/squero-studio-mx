# lp.jl — a linear program, solved automatically by `optimize`.
#
# One `optimize` call picks the solver from the problem: a linear objective
# goes to the optimization/lp block, a quadratic one (with H) to qp, and a
# nonlinear `fun`/`nonlcon` to nlp. There is no separate linprog/quadprog call.
f = [-3.0, -2.0]
A = [2.0 1.0; 1.0 2.0; 1.0 1.0]
b = [8.0, 8.0, 5.0]
lb = [0.0, 0.0]
x0 = [0.0, 0.0]
problem = (f = f, A = A, b = b, lb = lb, x0 = x0)

# The answer is x = [3, 2], objective -13 (a profit of 13).
x = optimize(problem)

# The objective over the feasible box, and the optimum on it.
xg = range(0, 4.5, length=60)
yg = range(0, 4.5, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = 3 .* Xg .+ 2 .* Yg
surf(Xg, Yg, Zg)
scatter([3.0], [2.0])
