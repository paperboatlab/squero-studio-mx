# lp.jl — a linear program in MATLAB's fmincon shape.
#
# Paperboat's optimization/lp block reads the same fields from a problem file:
#   min f'x   s.t.  A x <= b,   lb <= x <= ub
f = [-3.0, -2.0]
A = [2.0 1.0; 1.0 2.0; 1.0 1.0]
b = [8.0, 8.0, 5.0]
lb = [0.0, 0.0]
x0 = [0.0, 0.0]
options = (tol = 1e-8, max_iter = 500)

# fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options)
# Paperboat solves it as an optimization/lp step; the answer is x = [3, 2].
fun = x -> f' * x
x = fmincon(fun, x0, A, b, [], [], lb, [], [], options)
