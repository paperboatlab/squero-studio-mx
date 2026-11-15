The workspace
=============

Like MATLAB's, the workspace is **the session**, not the open file: a run adds/overwrites its
variables, other variables stay until ``clear``, and switching scripts does not change it. ``clear``
empties it, ``clear x`` removes one binding and ``clc`` only clears the console. In a script,
``clear()`` takes effect between statements, so what the script defines after it stays
``07-session-and-workspace.jl`` shows ``clear(:scratch_gain, :scratch_matrix)`` leaving the
intended bindings intact). Functions are listed too (``ƒ``) but stay in MX. The filter searches
name, shape and type. Each card shows the value on the right (a scalar, or an array's first
entries); the dot is the automatic broadcast to Paperboat.

``File ▸ Export workspace (.mat)…`` writes a MAT v4 file (double matrices/vectors/scalars) that
MATLAB and Octave load directly.

Every variable is **broadcast by default** to every running Paperboat backend: the launcher
discovers them with ``paperboat list --json`` (``/__mx/backends``), MX connects to each one and sends
its whole workspace with ``variables.set`` when it changes. There is no URL to pick and no shared
page; the two conventional local ports are tried when the CLI is not installed. Scalars are
numbers. Arrays are ``matrix`` variables: MX fetches each one whole from the kernel (``get``, a
binary Float64 frame) after a run and sends its rows, a vector as a column (``1; 2; 3``). An array
of more than 4096 values is sent without a value and with a note (shape, count, the limit, and
to share a slice such as ``B[1:10, 1:10]``); a Paperboat run that uses it stops with that note.
A preview is never sent as if it were the matrix.

The variable editor
-------------------

Double-click a workspace card (or ``openvar A``) to open it as a grid.

- Arrows move; type a number, press ``Enter`` or ``F2`` to edit; ``Enter`` and ``Tab`` commit and move on; ``Esc`` drops the edit.
- Paste a block copied from a spreadsheet: it lands at the selected cell and grows the array.
- ``+ row``, ``+ column``, ``− row``, ``− column`` change the shape. Every change goes to the kernel at once.
