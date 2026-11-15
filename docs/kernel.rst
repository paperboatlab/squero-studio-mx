The Julia kernel
================

The kernel chip in the bar is a button (``julia · starting`` until the first probe answers, then
``julia <version> · kernel``, or ``julia · unavailable``): it opens a centred panel with the running Julia/kernel
versions, the **julia up** view, and the **registry** view. ``julia`` is the version juliaup has
selected; *Update* runs ``juliaup update``, the environment lists the workspace project's direct
packages and lets you add, remove, update or reload them.

The registry view opens on ten popular packages and searches the **General** registry as you
type (``Registry.toml`` from the Julia depot's ``General.tar.gz``, or the GitHub archive cached in
``~/.cache/squero-mx``). A result opens its ``Package.toml``, version history and dependencies, with
the description and stars from GitHub when available; **Add** on the row or in the detail card
installs it into the workspace project, with no separate ``pkg`` field to fill in. Package work
runs in the same native Julia or kernel container the scripts use, with the workspace mounted so
``Project.toml``, ``Manifest.toml`` and the workspace depot persist. The kernel puts that project on
``JULIA_LOAD_PATH``, so a package added here is available to a script.

The kernel
----------

``npm start`` (or ``bin/squero-mx``) serves ``dist/`` with the same default workspace and kernel bridge
the dev server uses. ``paperboat pkg install squero-studio-mx`` installs it from ``apps.toml``,
``paperboat start squero-studio-mx`` runs it on port 59202 (the Squero Studios share 592xx: OM 59201, MX 59202; the next free one if taken), and ``paperboat stop squero-studio-mx``
stops it — the same flow as Squero Studio OM. The manifest also installs
``squero-julia-kernel``, which builds the pinned image.

The kernel is ``squero-julia-kernel:1.11.6-r1``, a Julia container with ``--network=none`` that speaks
``squero-kernel/0`` on stdio; the launcher bridges it to ``/__mx/kernel`` (one process per WebSocket).
``SQUERO_JULIA=native`` runs a sibling ``squero-julia-kernel`` checkout instead. ``bin/doctor`` in that
repo reports native/container, Julia, the image and a ``hello``. Plotting and solving stay out of the
kernel: charts are shared Paperboat components and solvers live in Paperboat.
