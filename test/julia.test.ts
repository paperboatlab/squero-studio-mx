import test from "node:test";
import assert from "node:assert/strict";
import { juliaVersion, parseJuliaupStatus, parsePackages, validPackageName } from "../server/julia.mjs";

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

test("package rows ignore Pkg chatter and keep versions", () => {
  const text = [
    "JULIA\t1.11.6",
    "  Resolving package versions...",
    "PKG\tJSON3\tabc\t1.14.1",
    "PKG\tLinearAlgebra\tdef\t",
  ].join("\n");
  assert.deepEqual(parsePackages(text), [
    { name: "JSON3", uuid: "abc", version: "1.14.1" },
    { name: "LinearAlgebra", uuid: "def", version: "" },
  ]);
  assert.equal(juliaVersion(text), "1.11.6");
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
