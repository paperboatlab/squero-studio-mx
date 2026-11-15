The editor
==========

The script editor is the Studio editor Squero Studio OM uses too, with Julia added: highlighting
that tells macros, symbols, type annotations, standard calls, definitions and string interpolation
apart; line numbers, history, rectangular selection, bracket matching and closing, and a lint
gutter. Completions include the live workspace, functions, keywords, builtins, snippets and
LaTeX-style symbols, each tagged ``fn``, ``var``, ``kw``, ``snp`` or ``λ``.

Running code
------------

``Ctrl/Cmd+Enter`` runs the current cell (a ``#%%`` section, or the selection; the whole file when
there is no cell). ``Shift+Enter`` runs the selection, or the current line. Both also parse a
``subplot`` figure from what ran.

Settings
--------

The sliders key opens settings for theme (``ui`` follows the main UI: paper when light, ink when
dark; or paper, ink, sepia, harbor, contrast and your own), font (Geist/System/Serif), size, line
height, tab size, wrapping, autocomplete, brackets and lint. They live in the user config file
``squero.toml``, shared with Squero Studio OM: ``~/.config/paperboat/`` (``$XDG_CONFIG_HOME``) on Linux
and macOS, ``%APPDATA%\paperboat\`` on Windows. The first run writes it with every key commented;
the popover rewrites just the keys it changes, a hand edit is read when the window regains focus,
and ``[themes.<name>]`` adds a theme on top of a built-in. Without the server they stay in
``localStorage``. ``\pi`` then Tab becomes π in both the editor and the console.
When viewing a shipped script from the **examples** tab (or via ``open_example(...)``), the editor
switches to **read-only** mode so the built-in tutorial stays unchanged; use **Copy to workspace**
in the script header whenever you want to edit and save your own copy.

A small habit linter flags ``%`` comments (Julia uses ``#``).
