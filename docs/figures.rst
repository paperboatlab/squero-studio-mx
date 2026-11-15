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

The browser supports Ctrl/Cmd-click to add/remove a figure and Shift-click for a range; ``Delete``
closes the selected figures (Ctrl/Cmd+A selects all). Export the selection, or the shown figure,
as **PNG, SVG, EPS or PDF**; several figures come as one ``mx-figures.zip``. PNG is a 2× capture of
the rendered page; the vector formats embed the same capture.

The repo's ``examples/`` folder is on disk and is copied to the default workspace; try
``subplots.jl``, ``subplot-scatter.jl``, ``lines.jl`` and ``surfaces.jl``.
