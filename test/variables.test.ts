import test from "node:test";
import assert from "node:assert/strict";
import { demoWorkspaces, type WorkspaceVariable } from "../src/workspace/samples.ts";
import { mergeShared, setMessage, toPaperboat } from "../src/paperboat/variables.ts";

test("every variable is broadcast by default", () => {
  const rows = mergeShared(demoWorkspaces["surface.jl"], []);
  for (const name of ["A", "x", "t", "k"]) {
    assert.equal(rows.find((r) => r.name === name)?.shareable, true);
    assert.equal(rows.find((r) => r.name === name)?.shared, true);
  }
});

test("scalars are numbers; whole arrays are matrix rows, vectors a column", () => {
  const ws: WorkspaceVariable[] = [
    { name: "k", shape: "1", type: "Float64", value: 0.42 },
    { name: "M", shape: "2 × 3", type: "Matrix{Float64}", value: [[1, 2, 3], [4, 5, 6]] },
    { name: "v", shape: "3", type: "Vector{Float64}", value: [1, 2, 3] },
  ];
  assert.deepEqual(toPaperboat(ws), [
    { name: "k", type: "number", value: 0.42 },
    { name: "M", type: "matrix", value: "1 2 3; 4 5 6" },
    { name: "v", type: "matrix", value: "1; 2; 3" },
  ]);
});

test("a preview is never sent as the matrix: a large one says why", () => {
  const out = toPaperboat(demoWorkspaces["surface.jl"]);
  const A = out.find((v) => v.name === "A");
  assert.equal(A?.type, "matrix");
  assert.equal(A?.value, undefined);
  assert.match(A?.note ?? "", /512 × 512.*too large to share live \(262144 values, limit 4096\)/);
});

test("only MX's own variables travel; Paperboat's stay Paperboat's", () => {
  const msg = setMessage(demoWorkspaces["surface.jl"]);
  assert.equal(msg.type, "variables.set");
  assert.equal(msg.source, "mx");
  assert.deepEqual(msg.variables.map((v) => v.name), ["A", "x", "t", "k"]);
});

test("functions and opaque objects are listed in MX but not broadcast", () => {
  const ws: WorkspaceVariable[] = [
    { name: "f", shape: "—", type: "Function" },
    { name: "opts", shape: "—", type: "@NamedTuple{tol::Float64}" },
    { name: "t", shape: "1", type: "Int64", value: 5 },
  ];
  assert.deepEqual(toPaperboat(ws).map((v) => v.name), ["t"]);
  assert.equal(mergeShared(ws, []).find((v) => v.name === "f")?.shared, false);
  assert.equal(mergeShared(ws, []).find((v) => v.name === "opts")?.shared, false);
});
