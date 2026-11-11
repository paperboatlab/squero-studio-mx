# nlp.jl — a nonlinear program in MATLAB's fmincon shape.
#
# Paperboat's optimization/nlp block reads the same fields and solves with Ipopt:
#   min fun(x)   s.t.  A x <= b,  Aeq x = beq,  lb <= x <= ub,  c(x) <= 0
fun = x -> (x[1] - 1)^2 + (x[2] - 2)^2
x0 = [0.5, 1.5]
Aeq = [1.0 1.0]
beq = [2.0]
lb = [0.0, 0.0]
ub = [2.0, 2.0]
nonlcon = x -> [x[1]^2 + x[2]^2 - 2]   # c(x) <= 0
options = (tol = 1e-8, max_iter = 400)

# fmincon(fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options)
# The closest point to (1, 2) is x = [1, 1], objective 1.
x = fmincon(fun, x0, [], [], Aeq, beq, lb, ub, nonlcon, options)
