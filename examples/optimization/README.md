# Optimization examples

One `optimize(problem)` call handles all three kinds; it picks the solver from the fields:

| File | Type | Fields that pick it | Result |
| --- | --- | --- | --- |
| `lp.jl` | LP | `f`, `A`, `b`, `lb` | `[3, 2]`, profit 13 |
| `qp.jl` | QP | `H` (plus `f`) | `[0.75, 0.25]` |
| `nlp.jl` | NLP | `fun`, `nonlcon` | `[1, 1]` |

There is no separate `linprog`/`quadprog`/`fmincon`: `optimize` dispatches to Paperboat's
`optimization/lp`, `optimization/qp` or `optimization/nlp` block. Each script also plots its
objective (`surf`) and solution (`scatter`) in the Figures tab.
