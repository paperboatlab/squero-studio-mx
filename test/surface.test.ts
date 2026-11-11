import test from "node:test";
import assert from "node:assert/strict";
import { surfaceEntity } from "../src/chart/surface.ts";

test("a surface is a valid mesh entity", () => {
  const n = 16;
  const e = surfaceEntity(n);
  const side = n + 1;
  assert.equal(e.shape, "mesh");
  assert.equal((e.vertices as number[]).length, side * side * 3);
  assert.equal((e.indices as number[]).length, n * n * 6);
  assert.equal((e.values as number[]).length, side * side);
  assert.deepEqual(e.range, [0, 1]);
});

test("every vertex and index is in range", () => {
  const n = 8;
  const e = surfaceEntity(n);
  const vertices = e.vertices as number[];
  const indices = e.indices as number[];
  for (const v of vertices) assert.ok(Number.isFinite(v), "finite vertex");
  for (const i of indices) assert.ok(i >= 0 && i < vertices.length / 3, "index in range");
  for (const v of e.values as number[]) assert.ok(v >= 0 && v <= 1, "field in 0..1");
});
