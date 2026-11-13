# MX examples

A real folder to try the editor, the kernel and the figure history. In MX:

1. Click the folder key next to `mx-workspace` in the Files rail, or choose
   `File ▸ Open workspace folder…`, and pick this `examples/` folder.
2. Open a script and press `Ctrl/Cmd+Enter` (cell) or run the file.
3. Figures appear on the stage and in the **Figures** tab; select one or several and export
   PNG, SVG, PDF, EPS or HTML (several become `mx-figures.zip`).

Every call in the scripts is tagged with where it comes from:

| Tag | Meaning |
| --- | --- |
| `[Julia]` | Base Julia or a standard library (`LinearAlgebra`, `Statistics`) |
| `[SqueroPlot]` | the plotting library: `Figure`, `Axis`, `Axis3`, `lines!`, `surface!`, `save`, … |
| `[SqueroBase]` | the session layer: `clear`, `clc`, `optimize`, `simulate` |
| `[Paperboat]` | runs in Paperboat, not in Julia: the solver, the simulation blocks |

The kernel loads SqueroPlot and SqueroBase into every session, so the scripts need no `using`.

| File | What it shows |
| --- | --- |
| `01-signals.jl` | `lines!`, `stem!`, `stairs!`, `hlines!`, a legend |
| `02-lorenz.jl` | a Base-Julia RK4 loop; a 3D line coloured by time, linked 2D axes, column sizes |
| `03-surfaces.jl` | `surface!`, `wireframe!`, `heatmap!`, `contourf!`/`contour!`, colour bars, a title row |
| `04-dashboard.jl` | bars + error bars, a histogram, a band, a twin y axis, a log axis with stems |
| `05-history.jl` | run it cell by cell: one history entry per changed figure; `clear()`/`clc()` keep the history |
| `06-export.jl` | `save` to SVG/PDF/PNG/HTML from a script; a `snapshot` that outlives later changes |
| `optimization/*.jl` | `optimize` (LP, QP, NLP) solved by Paperboat; the app draws the objective as a SqueroPlot surface with the optimum, and each script draws its own view of the problem |
| `simulation/state-space.jl` | poles with SqueroPlot; the model sent to a Paperboat backend with `simulate` |

See `optimization/README.md` for the optimization problems and their answers.
