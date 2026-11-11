# nlp.jl — a sensor on a walkway, solved automatically by `optimize`.
#
# A sensor must stay on the walkway x1 + x2 = 2 and inside the circular
# coverage of radius √2 around the origin. Put it as close as possible to the
# target (1, 2): both the objective and the circle are nonlinear, so the same
# `optimize` call routes to the NLP block (Ipopt).
fun = x -> (x[1] - 1)^2 + (x[2] - 2)^2
x0 = [0.5, 1.5]
Aeq = [1.0 1.0]
beq = [2.0]
lb = [0.0, 0.0]
ub = [2.0, 2.0]
nonlcon = x -> [x[1]^2 + x[2]^2 - 2]   # inside the circle: c(x) <= 0
options = (display = "iter", tol = 1e-8, max_iter = 400)
problem = (fun = fun, x0 = x0, Aeq = Aeq, beq = beq, lb = lb, ub = ub, nonlcon = nonlcon, options = options)

# Answer: the sensor sits at (1, 1), distance² = 1 from the target.
x_opt = optimize(problem)   # [1, 1]
f_opt = fun(x_opt)          # 1

# The distance surface, the walkway intersection, and the sensor.
xg = range(0, 2, length=60)
yg = range(0, 2, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = (Xg .- 1) .^ 2 .+ (Yg .- 2) .^ 2
surf(Xg, Yg, Zg)
scatter([1.0], [1.0])
