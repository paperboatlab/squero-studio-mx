Julia kernel and packages
===========================

The kernel status pill in the top-right bar (``julia <version> · kernel``) shows the live Julia
runtime and opens the **Kernel** management panel when clicked (also available under **View ▸
Kernel…**).

Managing Julia versions and packages
------------------------------------

Inside the Kernel panel you can:

- **Inspect the active session**: see the Julia version, kernel protocol/image digest, and
  preloaded packages (``SqueroBase``, ``SqueroPlot``).
- **Manage toolchains (`juliaup`)**: view installed Julia channels and run ``juliaup update``.
- **Browse the General registry**: search Julia's General registry by package name, inspect
  ``Package.toml`` metadata, version history, and dependencies, and click **Add** to install a
  package directly into the current workspace's ``Project.toml`` and ``Manifest.toml``.

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
