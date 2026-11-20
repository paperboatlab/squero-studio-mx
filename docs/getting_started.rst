Getting started
===============

Install and start Squero Studio MX from the Paperboat CLI:

.. code-block:: sh

   paperboat squero install squero-studio-mx
   paperboat squero start squero-studio-mx   # http://localhost:59202
   paperboat squero stop squero-studio-mx

The Squero Studios share the ``592xx`` port range (OM defaults to ``59201``, MX to ``59202``,
picking the next free port if taken). Installing ``squero-studio-mx`` also sets up
``squero-julia-kernel``, the pinned Julia environment MX runs scripts in.

Workbench layout
----------------

1. **Files rail (left)** — browses your workspace folder (``~/Documents/paperboat/squero-studio/mx``
   by default), creates or renames ``.jl`` scripts and folders, and shows Git status marks.
2. **Script editor (center-left)** — edits ``.jl`` files with Julia syntax highlighting, inline
   evaluated values next to each line, ``#%%`` cell execution, and breakpoint gutters.
3. **Figures stage (center-right)** — displays the active ``SqueroPlot`` 2D/3D figure with
   interactive pan, zoom, 3D orbit/view cube, export, and the Paperboat simulation run dock.
4. **Right pane** — switches between **workspace** (live bindings and functions), **debug** (call
   stack, locals, watches, breakpoints), and **figures** (grouped run history with thumbnails).
5. **Console (bottom)** — a live Julia REPL that also prints script ``stdout`` and solver logs.

Any side pane or the console can be collapsed to a standing tab using its header chevron or toggled
from the **View** menu.

Running, cells, and cancelling
------------------------------

- **Run** (editor header or **Run ▸ Run script**): executes the entire active script.
- ``Ctrl/Cmd+Enter``: runs the current ``#%%`` cell (or selection; runs the whole file if there are
  no cell markers).
- ``Shift+Enter``: runs the current line or selection.
- **Cancel** (replaces **Run** while busy, or ``Ctrl+C`` with no text selected, or **Run ▸ Cancel
  run**): interrupts running Julia code while keeping variables defined earlier in the session.

Runs do not time out automatically; **Cancel** is how you stop a long-running loop early.

Next steps
----------

- Walk through :doc:`tutorial` to try features unique to Squero Studio MX (the grid variable editor,
  Paperboat-backed optimization, and live station simulation).
- Browse the 12 built-in tutorial scripts in :doc:`examples` by typing ``examples`` or
  ``open_example(1)`` in the console.
- Press :kbd:`F1` at any time (or run ``help <name>`` in the console) to search MX and Paperboat
  documentation in the Help window.
