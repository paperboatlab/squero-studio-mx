# nlp-unconstrained.jl — an unconstrained nonlinear program.
#
# With only `fun` and `x0`, `optimize` picks the unconstrained NLP path (no
# bounds, no A/b, no Aeq/beq, no nonlcon). The Rosenbrock function:
fun = x -> (1 - x[1])^2 + 100 * (x[2] - x[1]^2)^2
x0 = [-1.2, 1.0]
problem = (fun = fun, x0 = x0)

# The minimum is x = [1, 1], objective 0.
x = optimize(problem)

# The valley, and the minimum on it.
xg = range(-2, 2, length=60)
yg = range(-1, 3, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = (1 .- Xg).^2 .+ 100 .* (Yg .- Xg.^2).^2
surf(Xg, Yg, Zg)
scatter([1.0], [1.0])
