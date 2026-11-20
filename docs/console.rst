Console
=======

The bottom **console** is a live Julia REPL connected to the active session, as well as the stdout
and solver log sink for scripts run from the editor. Matrices keep column alignment, and Julia
errors print in red.

- Type ``\pi`` (or any LaTeX symbol) and press :kbd:`Tab` for Unicode characters.
- Use :kbd:`Arrow Up` and :kbd:`Arrow Down` to recall previous commands.
- Press ``Ctrl+C`` (with no text selected) to cancel a running evaluation.

Built-in commands
-----------------

Anything that does not match a UI command below is evaluated directly in Julia:

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Command
     - What it does
   * - ``help name``, ``doc name``, ``?name``
     - Opens the Help window for ``name`` (same as pressing :kbd:`F1` on a word in the editor).
   * - ``examples``
     - Lists all 12 shipped tutorial scripts with their index and title.
   * - ``open_example([n | "name"])``
     - Opens a shipped tutorial script read-only in the editor (defaults to ``1``).
   * - ``openvar A``
     - Opens variable ``A`` in the grid Variable Editor.
   * - ``whos``
     - Prints the current workspace variables, shapes, and types.
   * - ``clear`` / ``clear A``
     - Resets the kernel session and clears the workspace, or removes just ``A``. Figures in
       history are preserved.
   * - ``clc``
     - Clears the console output log without affecting workspace variables.
   * - ``run``
     - Runs the currently open script.
   * - ``attach`` / ``detach``
     - Connects to or disconnects from running Paperboat stations.
   * - ``version``
     - Prints the frontend, Julia, and kernel versions.

Console settings
----------------

Click the sliders icon on the right side of the console header to toggle command echoing,
REPL-style result echoing, auto-scroll, and console font size.
