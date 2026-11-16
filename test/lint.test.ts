import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findMatlabPercentComments } from "../src/editor/lint.ts";

test("findMatlabPercentComments skips # comments, #=...=# block comments, strings, and chars", () => {
  const src = [
    "# 55 % comment",
    "x = 1 # inline 12 % comment",
    "#= multi\nline 80 % block\ncomment =#",
    's = "60 % and 40 %"',
    'triple = """\n100 %\n"""',
    "c = '%'",
    "-mu' * w # after transpose 12 %",
    "y = 2 % matlab inline",
    "  % matlab leading",
  ].join("\n");
  const hits = findMatlabPercentComments(src);
  assert.equal(hits.length, 2);
  assert.equal(src.slice(hits[0], hits[0] + 16), "% matlab inline\n");
  assert.equal(src.slice(hits[1]), "% matlab leading");
});

test("shipped examples produce zero MATLAB % comment false positives", () => {
  const dir = join(import.meta.dirname, "..", "examples");
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jl")) continue;
    const text = readFileSync(join(dir, name), "utf-8");
    assert.deepEqual(findMatlabPercentComments(text), [], `${name} triggered false % comment lint`);
  }
});
