# MX Tutorial Examples

An 11-step progressive tutorial for **`SqueroPlot.jl`** and **`SqueroBase.jl`**, shipped read-only
with **Squero Studio MX**. Open any example in one of three ways:

1. Switch to the **examples** tab in the left rail and click a script.
2. Call `open_example(1)`..`open_example(11)` or `open_example("signals")` / `open_example(:signals)` in the Julia console.
3. Use **Copy to workspace** in the script header to save an editable copy in your workspace folder.

Every call in the scripts is tagged with where it comes from:

| Tag | Meaning |
| --- | --- |
| `[Julia]` | Base Julia or a standard library (`LinearAlgebra`, `Statistics`) |
| `[SqueroPlot]` | the plotting library: `Figure`, `Axis`, `Axis3`, `lines!`, `surface!`, `save`, … |
| `[SqueroBase]` | the session layer: `clear`, `clc`, `open_example`, `optimize`, `simulate` |
| `[Paperboat]` | runs in Paperboat, not in Julia: the solver, the simulation blocks |

The kernel loads `SqueroPlot` and `SqueroBase` into every session, so scripts need no `using`.

| # | File | Topic | Key APIs |
| --- | --- | --- | --- |
| 1 | `01-signals.jl` | Basic 2D plotting | `Figure`, `Axis`, `lines!`, `stem!`, `stairs!`, `scatter!`, `hlines!`, `axislegend` |
| 2 | `02-lorenz.jl` | Linked 2D & 3D axes | `Axis3`, 3D `lines!`, `linkxaxes!`, `hidexdecorations!`, `colsize!` |
| 3 | `03-surfaces.jl` | 2D fields, surfaces & meshes | `surface!`, `wireframe!`, `mesh!`, `heatmap!`, `contourf!`, `contour!`, `Colorbar`, `Label` |
| 4 | `04-board.jl` | Statistics, bands & twin/log axes | `barplot!`, `errorbars!`, `hist!`, `band!`, `area!`, `twinx`, `scatterlines!`, log `stem!` |
| 5 | `05-layouts-and-themes.jl` | Layouts, themes, legends & text | `GridLayout`, `with_theme(theme_dark())`, `Legend`, `series!`, `linesegments!`, `rich`, `superscript`, `subscript` |
| 6 | `06-history-and-export.jl` | Cells, snapshots & export | `#%%` cells, `snapshot`, `save`, `to_html(; interactive = true)`, `render`, `poly!` |
| 7 | `07-session-and-workspace.jl` | Session & workspace control | `clear(:x)`, `clear()`, `clc()`, `open_example(...)` |
| 8 | `08-simulation.jl` | Dynamical systems & simulation | `simulate(graph; duration, dt, solver, variables)`, `control/state_space` |
| 9 | `09-optimization-lp.jl` | Linear optimization (LP) | `optimize(problem)` with `f, A, b, lb`, `ablines!`, `contourf!` |
| 10 | `10-optimization-qp.jl` | Quadratic optimization (QP) | `optimize(problem)` with `H, Aeq, beq`, `barplot!`, custom tick formats |
| 11 | `11-optimization-nlp.jl` | Nonlinear optimization (NLP) | `optimize(problem)` with `fun, nonlcon`, `band!`, `annotation!` |
