import test from "node:test";
import assert from "node:assert/strict";
import { parseJuliaupStatus, parseProject, validPackageName } from "../server/julia.mjs";
import { explainRunFailure } from "../server/kernel.mjs";

const STATUS = ` Default  Channel  Version                 Update
--------------------------------------------------
       *  release  1.11.6+0.x64.linux.gnu  1.13.3
          nightly  1.13.0-DEV.1+0.x64.linux.gnu
`;

test("juliaup status becomes channels", () => {
  assert.deepEqual(parseJuliaupStatus(STATUS), [
    { channel: "release", version: "1.11.6+0.x64.linux.gnu", update: "1.13.3", default: true },
    { channel: "nightly", version: "1.13.0-DEV.1+0.x64.linux.gnu", update: "", default: false },
  ]);
});

test("Project.toml and Manifest.toml give direct deps with resolved versions", () => {
  const project = [
    'name = "ws"',
    "[deps]",
    'JSON3 = "0f8b85d8-7281-11e9-16c2-39a750bddbf1"',
    'LinearAlgebra = "37e2e46d-f89d-539d-b4ee-838fcccc9c8e"',
    "[compat]",
    'JSON3 = "1"',
  ].join("\n");
  const manifest = [
    'julia_version = "1.11.6"',
    "[[deps.JSON3]]",
    'deps = ["Dates"]',
    'uuid = "0f8b85d8-7281-11e9-16c2-39a750bddbf1"',
    'version = "1.14.1"',
    "    [deps.JSON3.extensions]",
    '    version = "9.9.9"',
    "[[deps.Parsers]]",
    'version = "2.8.0"',
  ].join("\n");
  assert.deepEqual(parseProject(project, manifest), {
    julia: "1.11.6",
    packages: [
      { name: "JSON3", uuid: "0f8b85d8-7281-11e9-16c2-39a750bddbf1", version: "1.14.1" },
      { name: "LinearAlgebra", uuid: "37e2e46d-f89d-539d-b4ee-838fcccc9c8e", version: "" },
    ],
  });
  assert.deepEqual(parseProject("", ""), { julia: "", packages: [] });
});

test("package names and add specs are validated", () => {
  assert.equal(validPackageName("Example"), true);
  assert.equal(validPackageName("SparseArrays"), true);
  assert.equal(validPackageName("Example@0.5.3", true), true);
  assert.equal(validPackageName("../evil"), false);
  assert.equal(validPackageName("Example@0.5", false), false);
  assert.equal(validPackageName("http://example.com/x.jl", true), false);
  assert.equal(validPackageName(""), false);
});

test("a container that cannot mount the workspace is explained, other errors keep their last line", () => {
  assert.match(explainRunFailure("Error: crun: cannot stat `self/fd/5`: Permission denied: OCI permission denied"), /MX_WORKSPACE/);
  assert.equal(explainRunFailure("pulling\nError: image not known\n"), "Error: image not known");
  assert.match(explainRunFailure('ERROR: LoadError: IOError: readdir("/workspace"): permission denied (EACCES)\nin expression starting at /opt/kernel.jl:335'), /MX_WORKSPACE/);
  assert.equal(explainRunFailure("ERROR: LoadError: UndefVarError: x\nStacktrace:\n in expression starting at k.jl:1"), "ERROR: LoadError: UndefVarError: x");
});
