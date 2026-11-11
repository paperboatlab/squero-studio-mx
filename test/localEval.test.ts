import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, variableFrom } from "../src/kernel/localEval.ts";

test("a number and an assignment value", () => {
  const r = evaluate("3", {});
  assert.ok(r.ok);
  assert.equal(r.value, 3);
});

test("ranges and arithmetic", () => {
  const r = evaluate("1:5", {});
  assert.ok(r.ok);
  assert.deepEqual(r.value, [1, 2, 3, 4, 5]);
  const s = evaluate("2 + 3 * 4", {});
  assert.ok(s.ok);
  assert.equal(s.value, 14);
});

test("variables and elementwise vectors", () => {
  const r = evaluate("x + 1", { x: [1, 2, 3] });
  assert.ok(r.ok);
  assert.deepEqual(r.value, [2, 3, 4]);
});

test("matrix builders", () => {
  const r = evaluate("zeros(2, 3)", {});
  assert.ok(r.ok);
  assert.deepEqual(r.value, [[0, 0, 0], [0, 0, 0]]);
  const e = variableFrom("Z", r.value);
  assert.equal(e.type, "Matrix{Float64}");
  assert.equal(e.shape, "2 × 3");
});

test("anything else says so", () => {
  const r = evaluate("plot(x)", {});
  assert.equal(r.ok, false);
});
