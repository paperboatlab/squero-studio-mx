import test from "node:test";
import assert from "node:assert/strict";
import { demoWorkspaces } from "../src/chart/samples.ts";
import { mergeShared, setMessage, toPaperboat } from "../src/paperboat/variables.ts";

test("scalars are shareable; matrices and vectors are not", () => {
  const rows = mergeShared(demoWorkspaces["surface.jl"], []);
  assert.equal(rows.find((r) => r.name === "k")?.shareable, true);
  assert.equal(rows.find((r) => r.name === "A")?.shareable, false);
  assert.equal(rows.find((r) => r.name === "x")?.shareable, false);
  assert.equal(rows.find((r) => r.name === "k")?.shared, true);
});

test("sharing a scalar overrides the Paperboat value by name", () => {
  const out = toPaperboat(demoWorkspaces["surface.jl"], [{ name: "k", type: "number", value: 1 }, { name: "m", type: "number", value: 2 }]);
  assert.deepEqual(out.find((v) => v.name === "k"), { name: "k", type: "number", value: 0.42 });
  assert.deepEqual(out.find((v) => v.name === "m"), { name: "m", type: "number", value: 2 });
});

test("every scalar overrides Paperboat by name by default", () => {
  const out = toPaperboat(demoWorkspaces["surface.jl"], [{ name: "k", type: "number", value: 1 }]);
  assert.deepEqual(out.find((v) => v.name === "k"), { name: "k", type: "number", value: 0.42 });
});

test("the set message carries the whole list", () => {
  const msg = setMessage(demoWorkspaces["surface.jl"], [{ name: "m", type: "number", value: 2 }]);
  assert.equal(msg.type, "variables.set");
  assert.equal(msg.variables.length, 2);
});
