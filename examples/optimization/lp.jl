# lp.jl — a furniture workshop plan, solved automatically by `optimize`.
#
# Make chairs (x1) and tables (x2). A chair earns 3, a table 2; maximize the
# profit, which is the same as minimizing its negative.
f = [-3.0, -2.0]

# Assembly: 2 h per chair + 1 h per table <= 8 h
# Finishing: 1 h per chair + 2 h per table <= 8 h
# Wood:      1 unit per chair + 1 per table <= 5 units
A = [2.0 1.0; 1.0 2.0; 1.0 1.0]
b = [8.0, 8.0, 5.0]

lb = [0.0, 0.0]          # you cannot build a negative number of chairs
x0 = [0.0, 0.0]
options = (display = "iter", tol = 1e-8, max_iter = 500)
problem = (f = f, A = A, b = b, lb = lb, x0 = x0, options = options)

# Answer: 3 chairs and 2 tables, for a profit of 13.
# `display = "iter"` prints the solver's steps; "final" prints one line; "off" is silent.
x_opt = optimize(problem)   # [3, 2]
f_opt = f' * x_opt          # -13 (profit 13)

# The profit over the feasible box, and the plan on it.
xg = range(0, 4, length=60)
yg = range(0, 4, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = 3 .* Xg .+ 2 .* Yg
surf(Xg, Yg, Zg)
scatter([3.0], [2.0])
