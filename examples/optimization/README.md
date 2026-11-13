# Optimization examples

One `optimize(problem)` call handles every kind; the fields pick the solver.

| File | Solver picked | Real use case | Answer |
| --- | --- | --- | --- |
| `lp.jl` | **LP** | furniture workshop plan | 3 chairs, 2 tables, profit 13 |
| `qp.jl` | **QP** | two-asset portfolio, 12% return floor | 60/40, risk 1.58% |
| `box-constrained.jl` | **QP, bounds only** | two pumps at 0–1 limits | both at 1 |
| `nlp.jl` | **NLP, constrained** | sensor on a walkway inside a circle | (1, 1), distance² 1 |
| `nlp-unconstrained.jl` | **NLP, unconstrained** | Rosenbrock valley | (1, 1), objective 0 |

The MATLAB-style printing option is part of the problem:

```julia
options = (display = "iter", tol = 1e-8, max_iter = 500)
```

- `"iter"` prints the solver's iteration table (OSQP or Ipopt)
- `"final"` prints one summary line with the objective, iterations and `x`
- `"off"` prints nothing

When a problem has two variables, the app asks the kernel to draw Paperboat's grid of the objective as a SqueroPlot
3D surface with the optimum marked, and keeps it in the figure history. Each script also draws its own
view of the problem with SqueroPlot (constraints, levels, the answer), and the app binds `x_opt`/`f_opt`.
