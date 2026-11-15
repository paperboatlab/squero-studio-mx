import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { identifier, importFile, parseDelimited, parseJson, sheetVariables, type Sheet } from "../src/workspace/importData.ts";
import { workspaceMat } from "../src/workspace/mat.ts";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/import/${name}`, import.meta.url)));
const byName = (sheets: Sheet[]): Record<string, Sheet> => Object.fromEntries(sheets.map((s) => [s.name, s]));

test("a CSV with a header becomes columns; text columns are left out", () => {
  const s = parseDelimited("log", "time,speed (m/s),label\n0,1.5,a\n0.5,\"2\",b\n1,,c\n", ".csv");
  assert.deepEqual(s.headers, ["time", "speed (m/s)"]);
  assert.deepEqual(s.rows.slice(0, 2), [[0, 1.5], [0.5, 2]]);
  assert.ok(Number.isNaN(s.rows[2][1]));
  assert.match(s.notes.join(), /label/);
  assert.deepEqual(sheetVariables(s, "columns").map((v) => v.name), ["time", "speed_m_s"]);
  assert.deepEqual(sheetVariables(s, "matrix")[0].name, "log");
});

test("tabs, semicolons and spaces are found; comments skipped; no header is a plain matrix", () => {
  assert.deepEqual(parseDelimited("a", "1\t2\n3\t4").rows, [[1, 2], [3, 4]]);
  assert.deepEqual(parseDelimited("a", "1;2\n3;4").rows, [[1, 2], [3, 4]]);
  const s = parseDelimited("a", "% from a logger\n  1   2.5  -Inf\n  3   4    NaN\n", ".txt");
  assert.equal(s.headers, null);
  assert.deepEqual(s.rows[0], [1, 2.5, -Infinity]);
  assert.deepEqual(sheetVariables(parseDelimited("v", "1\n2\n3"), "matrix")[0].value, [1, 2, 3]);
});

test("JSON: numbers, rows, records and objects of them", () => {
  const got = parseJson("data", JSON.stringify({ k: 2, v: [1, 2], A: [[1, 2], [3, 4]], recs: [{ t: 0, y: 1 }, { t: 1, y: 3 }], name: "x" }));
  const s = byName(got.sheets);
  assert.deepEqual(sheetVariables(s.k, "matrix")[0].value, 2);
  assert.deepEqual(sheetVariables(s.v, "matrix")[0].value, [1, 2]);
  assert.deepEqual(sheetVariables(s.A, "matrix")[0].value, [[1, 2], [3, 4]]);
  assert.deepEqual(sheetVariables(s.recs, "columns").map((v) => [v.name, v.value]), [["t", [0, 1]], ["y", [1, 3]]]);
  assert.match(got.notes.join(), /name/);
});

for (const file of ["v6.mat", "v7.mat"]) {
  test(`MAT v5 from Octave (${file}): numeric arrays, other classes named and left out`, async () => {
    const got = await importFile(file, fixture(file));
    const s = byName(got.sheets);
    assert.deepEqual(s.A.rows, [[1, 2, 3], [4, 5, 6]]);
    assert.deepEqual(sheetVariables(s.v, "matrix")[0].value, [10, 20, 30]);
    assert.deepEqual(sheetVariables(s.k, "matrix")[0].value, 7);
    assert.deepEqual(s.n.rows, [[-1, 2]]);
    if (file === "v7.mat") {
      assert.deepEqual(s.z.rows, [[1, 3]]);
      assert.match(s.z.notes.join(), /imaginary/);
      assert.match(got.notes.join(), /“s”: text/);
      assert.match(got.notes.join(), /“c”: cell array/);
      assert.match(got.notes.join(), /“st”: struct/);
    }
  });
}

test("MAT v4: Octave's and MX's own export read back", async () => {
  const octave = byName((await importFile("v4.mat", fixture("v4.mat"))).sheets);
  assert.deepEqual(octave.A.rows, [[1, 2, 3], [4, 5, 6]]);
  const ours = new Uint8Array(await workspaceMat([{ name: "M", shape: "2 × 2", type: "Matrix{Float64}", value: [[1, 2], [3, 4]] }]).arrayBuffer());
  assert.deepEqual((await importFile("ws.mat", ours)).sheets[0].rows, [[1, 2], [3, 4]]);
});

test("XLSX: every sheet, shared strings, headers, empty sheets noted", async () => {
  const got = await importFile("data.xlsx", fixture("data.xlsx"));
  const s = byName(got.sheets);
  assert.deepEqual(s["Run & 1"].headers, ["time", "speed (m/s)"]);
  assert.deepEqual(s["Run & 1"].rows.slice(0, 4), [[0, 0], [0.5, 1], [1, 4], [1.5, 9]]);
  assert.deepEqual(s.Matrix.rows, [[1, 2], [3, 4]]);
  assert.match(got.notes.join(), /Empty/);
});

test("a column never takes one of Julia's own names", () => {
  const s = parseDelimited("log", "time,sum,x\n1,2,3");
  assert.deepEqual(sheetVariables(s, "columns", "log", new Set(["time", "sum"])).map((v) => v.name), ["time_", "sum_", "x"]);
  assert.equal(sheetVariables(s, "matrix", "sum", new Set(["sum"]))[0].name, "sum_");
});

test("names are Julia identifiers", () => {
  assert.equal(identifier("Run & 1"), "Run_1");
  assert.equal(identifier("2x"), "_2x");
  assert.equal(identifier("  "), "data");
});
