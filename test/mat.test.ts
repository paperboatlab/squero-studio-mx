import test from "node:test";
import assert from "node:assert/strict";
import { demoWorkspaces } from "../src/workspace/samples.ts";
import { workspaceMat } from "../src/workspace/mat.ts";

test("MAT v4 has a double header, a NUL name and column-major data", async () => {
  const buf = await workspaceMat(demoWorkspaces["export.jl"]).arrayBuffer();
  const dv = new DataView(buf);
  assert.equal(dv.getInt32(0, true), 0);   // double
  assert.equal(dv.getInt32(4, true), 1);   // A is exported as a 1 x n preview row
  assert.equal(dv.getInt32(12, true), 0);  // real
  const nameLen = dv.getInt32(16, true);
  const name = new TextDecoder().decode(new Uint8Array(buf, 20, nameLen - 1));
  assert.equal(name, "A");
  assert.equal(new Uint8Array(buf, 20 + nameLen - 1, 1)[0], 0);
  const first = dv.getFloat64(20 + nameLen, true);
  assert.ok(Number.isFinite(first));
});

test("a scalar is a 1 x 1 double", async () => {
  const buf = await workspaceMat([{ name: "k", shape: "1", type: "Float64", value: 0.42 }]).arrayBuffer();
  const dv = new DataView(buf);
  assert.equal(dv.getInt32(4, true), 1);
  assert.equal(dv.getInt32(8, true), 1);
  const nameLen = dv.getInt32(16, true);
  assert.equal(dv.getFloat64(20 + nameLen, true), 0.42);
});

test("an empty workspace is an empty blob", () => {
  assert.equal(workspaceMat([]).size, 0);
});
