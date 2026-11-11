# qp.jl — a quadratic program in MATLAB's fmincon shape.
#
# Paperboat's optimization/qp block reads the same fields:
#   min 1/2 x'Hx + f'x   s.t.  Aeq x = beq,   lb <= x <= ub
H = [2.0 0.0; 0.0 2.0]
f = [-2.0, -1.0]
Aeq = [1.0 1.0]
beq = [1.0]
lb = [0.0, 0.0]
ub = [1.0, 1.0]
x0 = [0.5, 0.5]
options = (tol = 1e-8, max_iter = 500)

# fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options)
# The answer is x = [0.75, 0.25].
fun = x -> 0.5 * x' * H * x + f' * x
x = fmincon(fun, x0, [], [], Aeq, beq, lb, ub, [], options)
