# Optimization examples

The three kinds of Paperboat optimization problem, written in MATLAB's **fmincon** shape.
The matrices build in the MX workspace; the `fmincon(...)` line is the hand-off to
Paperboat's `optimization/lp`, `optimization/qp` or `optimization/nlp` block (Ipopt for NLP).

| File | Type | Problem |
| --- | --- | --- |
| `lp.jl` | linear program | production plan, `x = [3, 2]`, profit 13 |
| `qp.jl` | quadratic program | beam sizing, `x = [0.75, 0.25]` |
| `nlp.jl` | nonlinear program | closest point to `(1,2)`, `x = [1, 1]` |

fmincon's arguments are `fun, x0, A, b, Aeq, beq, lb, ub, nonlcon, options`; the same field
names are used in the JSON problem file the Paperboat block reads. Run the script to load
`H`, `f`, `A`, `b`, `Aeq`, `beq`, `lb`, `ub` and `x0` into the workspace; the `fmincon` line
is marked `→ optimize`.
