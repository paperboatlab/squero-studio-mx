import test from "node:test";
import assert from "node:assert/strict";
import { demoVariables } from "../src/chart/samples.ts";
import { mergeShared, setMessage, toPaperboat } from "../src/paperboat/variables.ts";

test("scalars are shareable; matrices and vectors are not", () => {
  const rows = mergeShared(demoVariables, [], new Set(["k"]));
  assert.equal(rows.find((r) => r.name === "k")?.shareable, true);
  assert.equal(rows.find((r) => r.name === "A")?.shareable, false);
  assert.equal(rows.find((r) => r.name === "x")?.shareable, false);
  assert.equal(rows.find((r) => r.name === "k")?.shared, true);
});

test("sharing a scalar overrides the Paperboat value by name", () => {
  const out = toPaperboat(demoVariables, [{ name: "k", type: "number", value: 1 }, { name: "m", type: "number", value: 2 }], new Set(["k"]));
  assert.deepEqual(out.find((v) => v.name === "k"), { name: "k", type: "number", value: 0.42 });
  assert.deepEqual(out.find((v) => v.name === "m"), { name: "m", type: "number", value: 2 });
});

test("an unshared scalar leaves Paperboat alone", () => {
  const out = toPaperboat(demoVariables, [{ name: "k", type: "number", value: 1 }], new Set());
  assert.deepEqual(out.find((v) => v.name === "k"), { name: "k", type: "number", value: 1 });
});

test("the set message carries the whole list", () => {
  const msg = setMessage(demoVariables, [{ name: "m", type: "number", value: 2 }], new Set(["k"]));
  assert.equal(msg.type, "variables.set");
  assert.equal(msg.variables.length, 2);
});
