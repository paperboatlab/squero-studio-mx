# nlp.jl — a nonlinear program, solved automatically by `optimize`.
#
# `fun` and `nonlcon` make it nonlinear, so the same call goes to the
# optimization/nlp block (Ipopt): min fun(x), c(x) <= 0, ceq(x) = 0.
fun = x -> (x[1] - 1)^2 + (x[2] - 2)^2
x0 = [0.5, 1.5]
Aeq = [1.0 1.0]
beq = [2.0]
lb = [0.0, 0.0]
ub = [2.0, 2.0]
nonlcon = x -> [x[1]^2 + x[2]^2 - 2]
problem = (fun = fun, x0 = x0, Aeq = Aeq, beq = beq, lb = lb, ub = ub, nonlcon = nonlcon)

# The closest point to (1, 2) is x = [1, 1], objective 1.
x = optimize(problem)

# The objective surface and the solution.
xg = range(0, 2, length=60)
yg = range(0, 2, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = (Xg .- 1) .^ 2 .+ (Yg .- 2) .^ 2
surf(Xg, Yg, Zg)
scatter([1.0], [1.0])
