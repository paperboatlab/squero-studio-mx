Julia kernel and packages
===========================

The kernel status pill in the top-right bar (``julia <version> · kernel``) shows the live Julia
runtime. Clicking it opens the **kernel** tab of the right pane (also **View ▸ Kernel and
packages**). The tab sits beside workspace, debug and figures, so MX stays usable while a package
installs.

The session
-----------

The top of the tab shows the kernel's state (idle, running, starting, unavailable), its Julia
version, image and protocol, and two keys:

- **Interrupt** (while code runs) stops the running code; the session and its variables stay.
- **Restart** (also **Run ▸ Restart kernel**) starts a fresh Julia session. Every variable is
  cleared and packages are loaded again; use it after removing or updating a package.

Managing packages
-----------------

Below the session:

- **environment** lists the workspace project's direct packages and their resolved versions, read
  straight from its ``Project.toml`` and ``Manifest.toml``, so it shows at once.
- **registry** searches Julia's General registry. Open a package to see its description, versions
  and dependencies, pick a version (the newest is a plain add), and click **Add** to install it
  into the workspace's ``Project.toml`` and ``Manifest.toml``. Pkg's output streams into the tab
  while it resolves and precompiles.
- **juliaup** channels and ``juliaup update`` are shown only for a native kernel
  (``SQUERO_JULIA=native``): a container kernel brings its own Julia.

Packages installed for a workspace persist in that workspace's environment and are immediately
importable via ``using <Package>`` in your scripts and console.

Containerized and native runtimes
---------------------------------

By default, MX runs the pinned ``squero-julia-kernel`` container image with ``--network=none`` via
Podman or Docker, pulling the pinned digest automatically on first launch if absent.

- Override the container image with ``SQUERO_KERNEL_IMAGE``.
- To run against a local Julia installation and sibling ``squero-julia-kernel`` checkout instead of
  a container, set ``SQUERO_JULIA=native``.
- Run ``bin/doctor`` in ``squero-julia-kernel`` to verify the detected runtime, Julia version, and
  kernel ``hello`` handshake.
