Getting started
===============

Install and start it from the Paperboat CLI:


.. code-block:: sh

   paperboat pkg install squero-studio-mx
   paperboat start squero-studio-mx   # http://localhost:59202
   paperboat stop squero-studio-mx


The Squero Studios share the 592xx ports: OM 59201, MX 59202, or the next free one if taken. The
install also builds ``squero-julia-kernel``, the pinned Julia image MX runs scripts in.

First steps
-----------

MX runs Julia scripts in a kernel and keeps what they define in the workspace on the right.

- ``Run`` runs the whole script; ``Ctrl+Enter`` runs the ``#%%`` cell at the cursor; ``Shift+Enter`` runs the line or the selection.
- The console is the kernel's REPL: type an expression and press Enter.
- Figures drawn with SqueroPlot (``lines``, ``surface``, ``heatmap``…) land in the figure pane and its history.
- Paperboat sees every workspace number, vector and matrix as a live variable while it's attached.

Running and cancelling
----------------------

While a run is busy the run strip says what it's doing (evaluating, solving, plotting) and for how long.

- While a run is busy the editor's ``Run`` key is ``Cancel``, and the run strip has one too; ``Ctrl+C`` (with no text selected) and Run › Cancel run do the same.
- Cancel stops the running Julia code; the workspace keeps what was defined before it.
- A run never times out by itself: Cancel is how it ends early.

Shipped tutorial examples live in the **examples** tab of the left rail and open read-only; start
with ``01-signals.jl``, ``02-lorenz.jl``, ``03-surfaces.jl`` and ``07-session-and-workspace.jl``, or run
``open_example(1)`` in the console (see :doc:`examples`).
