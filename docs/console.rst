The console
===========

The bottom console is a real Julia REPL and the script stdout sink. Anything that is not a UI
command is evaluated in the kernel session and prints its value as Julia's REPL does (a matrix
keeps its columns) or its Julia error in red; scripts run from the editor print their stdout here
too.


.. code-block:: text

   help · whos · clear [name] · clc · open_example · attach · detach
   run · version


``clear`` resets the kernel session and the workspace; ``clear x`` removes one binding from the
workspace; ``clc`` clears the console; ``open_example(1)`` or ``open_example("signals")`` opens
a shipped tutorial example read-only in the editor. ``\pi`` then Tab becomes π. Arrow Up/Arrow Down recall history.
The scratch line under the workspace still evaluates simple expressions locally until a kernel is
attached.

Optimization specs go to the launcher's ``/__mx/optimize``, which runs
``paperboat optimize <problem> --json --grid 41`` (the checkout's CLI, or ``$PAPERBOAT_BIN``; it runs
asynchronously, so a long solve never stalls the launcher): the same readers, OSQP/Ipopt solver and
``options.display`` trace the Paperboat blocks use. An NLP needs a Paperboat built with Ipopt. The app binds ``x_opt``/``f_opt`` and draws the
optimum on the objective surface.

Commands
--------

Anything else is Julia.

- ``help name``, ``doc name`` or ``?name`` open this window on a name; ``F1`` looks up the selected word.
- ``openvar A`` opens a variable in the variable editor.
- ``whos`` lists the workspace; ``clear`` empties it, ``clear A`` drops one; ``clc`` clears the console.
- ``open_example(1)`` or ``open_example("signals")`` opens a shipped tutorial example read-only in the editor.
- ``run`` runs the open script; ``attach`` and ``detach`` find or leave Paperboat backends; ``version`` prints the versions.
