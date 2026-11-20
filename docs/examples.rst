Shipped examples
================

Squero Studio MX ships a **12-part progressive tutorial** covering **SqueroPlot.jl** (2D/3D
plotting, layouts, themes, snapshots, and export) and **SqueroBase.jl** / **Paperboat** (session
control, optimization, and dynamical simulation). Because both packages are preloaded into every
kernel session, every example runs as written with no extra ``using`` boilerplate.

Opening and running examples
----------------------------

Shipped examples open **read-only** so the built-in curriculum stays intact:

1. Type ``examples`` in the console to list all 12 scripts, then open one with
   ``open_example(ref)`` by 1-based index, filename, slug, or symbol:

   .. code-block:: julia

      open_example()            # opens example 1 (01-signals.jl)
      open_example(3)           # opens 03-surfaces.jl
      open_example("lorenz")    # opens 02-lorenz.jl
      open_example(:simulation) # opens 08-simulation.jl

2. Run the read-only script directly (**Run**, ``Ctrl/Cmd+Enter`` for cells, or ``Shift+Enter``
   for lines), or click **Copy to workspace** in the editor header to save an editable copy in your
   workspace folder.

SqueroPlot.jl curriculum (1–6)
------------------------------

.. list-table::
   :header-rows: 1
   :widths: 6 28 66

   * - #
     - Example
     - What it teaches
   * - 1
     - ``01-signals.jl``
     - Continuous ``lines!``, discrete ``stem!``, zero-order hold ``stairs!``, ``scatter!``,
       ``hlines!``, and ``axislegend``.
   * - 2
     - ``02-lorenz.jl``
     - Base-Julia RK4 integration, 3D ``Axis3`` trajectory coloured by time, linked 2D axes
       (``linkxaxes!``, ``hidexdecorations!``), and ``colsize!``.
   * - 3
     - ``03-surfaces.jl``
     - 2D comprehensions with ``surface!``, ``wireframe!``, vertex-coloured ``mesh!``, ``heatmap!``,
       ``contourf!``/``contour!``, ``Colorbar``, and ``Label`` title rows.
   * - 4
     - ``04-board.jl``
     - Statistical views: ``barplot!``, ``errorbars!``, ``hist!``, ``band!``, ``area!``, twin y
       axes (``twinx``), and log-scale ``stem!``.
   * - 5
     - ``05-layouts-and-themes.jl``
     - ``with_theme(theme_dark())``, nested ``GridLayout``, external ``Legend``
       (``LineElement``, ``MarkerElement``, ``PolyElement``), ``series!``, ``linesegments!``, and
       ``rich`` text.
   * - 6
     - ``06-history-and-export.jl``
     - Cell execution (``#%%``), immutable ``snapshot`` before edits, and exporting
       PNG/SVG/PDF/interactive HTML (``save``, ``render``, ``to_html``).

SqueroBase.jl & Paperboat curriculum (7–12)
-------------------------------------------

.. list-table::
   :header-rows: 1
   :widths: 6 28 66

   * - #
     - Example
     - What it teaches
   * - 7
     - ``07-session-and-workspace.jl``
     - Selective clearing with ``clear(:scratch_a, :scratch_b)``, ``clear()``, ``clc()``, and
       navigating examples with ``open_example``.
   * - 8
     - ``08-simulation.jl``
     - State-space pole analysis in ``LinearAlgebra`` plus queuing a ``graph.run``
       (``control/state_space``) to attached Paperboat stations via ``simulate``.
   * - 9
     - ``09-optimization-lp.jl``
     - Linear programming via ``optimize(problem)`` (``f``, ``A``, ``b``, ``lb``), feasible polygon
       ``poly!``, constraints via ``ablines!``, and ``contourf!``.
   * - 10
     - ``10-optimization-qp.jl``
     - Quadratic portfolio optimization via ``optimize(problem)`` (``H``, ``Aeq``, ``beq``),
       efficient frontier plotting, and custom tick formatters.
   * - 11
     - ``11-optimization-nlp.jl``
     - Constrained nonlinear optimization via ``optimize(problem)`` (expression string ``fun`` and
       nonlinear inequality ``nonlcon`` routed to Ipopt) with ``annotation!``.
   * - 12
     - ``12-state-space.jl``
     - Populating ``A, B, C, D, x0`` and nonlinear ``f`` for ``control/rhs`` and driving runs
       directly from the Figures stage simulation run dock.

Quick API reference
-------------------

.. code-block:: julia

   # Session control without losing figure history
   clear(:tmp)                 # drop only `tmp` from the workspace
   clc()                       # clear the console log
   open_example("signals")     # inspect a tutorial example read-only

   # Optimization and simulation bridges to Paperboat
   optimize((f = [-3.0, -2.0], A = [2.0 1.0; 1.0 2.0], b = [8.0, 8.0], lb = [0.0, 0.0]))
   simulate(graph; duration = 10, dt = 0.01, solver = :rk45, variables = (x0 = [1.0, 0.0],))
