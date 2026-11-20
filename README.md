# Squero Studio MX

Interactive Julia workbench for [Paperboat](https://github.com/paperboatlab/paperboat): scripts,
matrices, a live variable workspace, 2D scopes and 3D surface plots that share live variables and
state-space models with Paperboat runs. Squero Studio MX is not a MATLAB compatibility product (it
does not run `.m` files), and it does not integrate simulation runs itself: simulation and solving
stay in Paperboat.

**Docs:** <https://paperboatlab.github.io/apps/squero-studio-mx/> (sources in [`docs/`](docs/), also
in the Help window (F1))

![3D surface plot rendered on the shared Station stage in Squero Studio MX](docs/scaffold-3d.jpg)

## Layout

```text
../paperboat/            Paperboat engine, CLI and web app
../paperboat-shared/     @paperboat/shared, the shared UI kit
../squero-julia-kernel/  containerised Julia session speaking squero-kernel/0
squero-studio-mx/        this repository
  src/                   React + TypeScript workbench (editor, workspace, figures, Paperboat link)
  server/                Node launcher, Julia kernel bridge and workspace file server
  docs/                  Sphinx manual sources
  test/                  unit tests for figures, variables, MAT import/export and completions
```

## Run

Install and launch with the `paperboat` CLI (or the Paperboat Launcher desktop app):

```sh
paperboat squero start squero-studio-mx
```

From a checkout (requires Node.js 22, `../paperboat-shared` next to this folder, and either
Podman/Docker for the Julia kernel image or Julia 1.11+):

```sh
(cd ../paperboat-shared && npm install)
npm install
npm run dev
```

Opens at `http://localhost:59202` (`http://localhost:3049` under `npm run dev`).

## Check

```sh
npm run typecheck
npm test
npm run build
```

## CI

[![ci](https://github.com/paperboatlab/squero-studio-mx/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/paperboatlab/squero-studio-mx/actions/workflows/ci.yml?query=branch%3Adev) runs typecheck, unit tests and the production bundle build on `dev`.

## Status

- Shared 2D and 3D plotting refinements in `@paperboat/shared/plot` (`pb#312`).
- Julia station host (`paperboat new --julia`, `pb#323`) integration with `SqueroBase.jl`.
- Shared `StationPanel` and `StationGraph` extraction into `@paperboat/shared/station`.

## Licence

GNU General Public License version 3 (see [LICENSE](LICENSE)).
