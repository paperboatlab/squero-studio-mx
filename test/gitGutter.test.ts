import { test } from "node:test";
import assert from "node:assert/strict";
import { gitMarks, textOf } from "../src/editor/gitGutter.ts";

test("git gutter marks added, modified and deleted lines", () => {
  const base = textOf("a\nb\nc\nd\ne");
  assert.deepEqual(gitMarks(base, textOf("a\nb\nc\nd\ne")), []);
  assert.deepEqual(gitMarks(base, textOf("a\nB\nc\nd\ne")), [[2, "mod"]]);
  assert.deepEqual(gitMarks(base, textOf("a\nb\nnew\nnew2\nc\nd\ne")), [[3, "add"], [4, "add"]]);
  assert.deepEqual(gitMarks(base, textOf("a\nb\nd\ne")), [[3, "del"]]);
  assert.deepEqual(gitMarks(base, textOf("a\nb\nc\nd")), [[4, "del"]]);
  assert.deepEqual(gitMarks(base, textOf("a\nb\nc\nd\ne\nf")), [[6, "add"]]);
  assert.deepEqual(gitMarks(base, textOf("a\r\nb\r\nc\r\nd\r\ne")), []);
});
