Figures and subplot
===================

``subplot(m, n, p)`` followed by ``plot``, ``surf``, ``mesh``, ``imagesc`` or ``scatter`` adds a **figure**
to the Figures browser, with a grid of shared tiles: line tiles are the Scope, surface tiles the
Station SceneView, heat/scatter small canvases. A run adds one figure, newest first, with its
script, time and plot count; click a row to show it, ``×`` closes it. Clicking a ``→ chart`` token
in the editor shows the matching figure and outlines its tile. ``Edit ▸ Clear figures`` empties
the browser.

3D surfaces draw one origin frame through (0, 0, 0) in muted grey: x, y and z run in both
directions past the data, with the ground grid on y = 0. A bottom-left triad and the top-right
wireframe view cube carry the live x/y/z direction; the cube turns with the camera and its axes
sit on one vertex. The optimization cost plot uses the same in-scene frame, sized to the decision
box, and draws the objective's height to that box (lowest value on the floor, highest at 0.6 of its
width), so a small cost over a large box is not flat; the camera fits the whole surface and the
returned optimum is a red sphere with a drop line to its footprint.

The browser groups figures by run (newest run first), supports Ctrl/Cmd-click to add/remove a
figure and Shift-click for a range; ``Delete`` closes the selected figures (Ctrl/Cmd+A selects
all). ``Export…`` exports the selection (or the shown figure), and ``Export run…`` exports the
latest version of every figure from the selected run as **PNG, SVG, EPS or PDF** (or HTML);
several figures come as one ``mx-figures.zip``. PNG is a 2× capture of the rendered page; the
vector formats embed the same capture.

When a Paperboat backend is attached and the workspace defines ``A, B, C, D, x0`` (or an ODE
``f``), the floating simulation dock at the bottom of the stage sends ``graph.run`` to
Paperboat's ``control/state_space`` or ``control/rhs`` block and charts the returned signals
here.

Open any script in the **examples** rail tab (or run ``open_example(1)``..``open_example(11)``)
to inspect ``01-signals.jl``, ``03-surfaces.jl``, ``05-layouts-and-themes.jl`` and
``06-history-and-export.jl``.
