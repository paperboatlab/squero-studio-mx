# Optimization examples

One `optimize(problem)` call handles every kind; the fields pick the solver.

| File | Solver picked | What makes it that case |
| --- | --- | --- |
| `lp.jl` | **LP** | linear `f`, inequality `A`/`b`, bounds |
| `qp.jl` | **QP** | quadratic `H`, equality `Aeq`/`beq`, bounds |
| `box-constrained.jl` | **QP, bounds only** | `H`/`f` and `lb`/`ub`, no rows |
| `nlp.jl` | **NLP, constrained** | nonlinear `fun` plus `nonlcon` |
| `nlp-unconstrained.jl` | **NLP, unconstrained** | only `fun` and `x0` |

That is the whole matrix: linear vs quadratic, with or without constraint rows, and nonlinear
with or without constraints. `optimize` routes each to Paperboat's `optimization/lp`,
`optimization/qp` or `optimization/nlp` block — no separate `linprog`, `quadprog` or `fmincon`
call. Each script also plots its objective (`surf`) and solution (`scatter`) in the Figures tab.
