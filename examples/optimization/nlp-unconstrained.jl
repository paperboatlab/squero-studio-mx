# nlp-unconstrained.jl — the Rosenbrock valley, solved automatically by `optimize`.
#
# No bounds, no linear rows, no nonlinear constraints: just an objective and a
# start. The same `optimize` call takes the unconstrained NLP path (no Ipopt
# constraints needed).
fun = x -> (1 - x[1])^2 + 100 * (x[2] - x[1]^2)^2
x0 = [-1.2, 1.0]
options = (display = "iter", tol = 1e-10, max_iter = 800)
problem = (fun = fun, x0 = x0, options = options)

# Answer: the bottom of the valley, x = [1, 1], objective 0.
x_opt = optimize(problem)
f_opt = fun(x_opt)

# The curved valley and the minimum at its end.
xg = range(-2, 2, length=60)
yg = range(-1, 3, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = (1 .- Xg).^2 .+ 100 .* (Yg .- Xg.^2).^2
surf(Xg, Yg, Zg)
scatter([1.0], [1.0])
