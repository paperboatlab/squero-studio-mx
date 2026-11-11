# qp.jl — a two-asset portfolio, solved automatically by `optimize`.
#
# Minimize risk 1/2 w'Σw. The budget is fully invested (Σw = 1), the expected
# return must be at least 12%, and shorting is not allowed.
Sigma = [0.040 0.006; 0.006 0.090]   # covariance of the two assets
mu = [0.10, 0.15]                   # expected returns
H = Sigma
f = [0.0, 0.0]
A = [-mu[1] -mu[2]]                 # -return <= -0.12  ->  return >= 12%
b = [-0.12]
Aeq = [1.0 1.0]
beq = [1.0]
lb = [0.0, 0.0]
ub = [1.0, 1.0]
x0 = [0.5, 0.5]
options = (display = "iter", tol = 1e-8, max_iter = 500)
problem = (H = H, f = f, A = A, b = b, Aeq = Aeq, beq = beq, lb = lb, ub = ub, x0 = x0, options = options)

# Answer: 60% in the first asset, 40% in the second; risk 0.01584 (1.58%).
x_opt = optimize(problem)   # [0.60, 0.40]
f_opt = 0.5 * x_opt' * H * x_opt

# The risk surface and the chosen portfolio.
xg = range(0, 1, length=60)
yg = range(0, 1, length=60)
Xg, Yg = meshgrid(xg, yg)
Zg = 0.5 .* (Sigma[1,1] .* Xg.^2 .+ 2 .* Sigma[1,2] .* Xg .* Yg .+ Sigma[2,2] .* Yg.^2)
surf(Xg, Yg, Zg)
scatter([0.60], [0.40])
