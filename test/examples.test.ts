import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildExamplesCatalog, resolveExample } from "../src/examples/match.ts";

const EXAMPLES_DIR = join(import.meta.dirname, "..", "examples");

function loadDiskExamples() {
  const files: Record<string, string> = {};
  for (const name of readdirSync(EXAMPLES_DIR)) {
    if (!name.endsWith(".jl")) continue;
    files[`../../examples/${name}`] = readFileSync(join(EXAMPLES_DIR, name), "utf-8");
  }
  return buildExamplesCatalog(files);
}

test("shipped examples catalog is ordered, 1-indexed, and has titles", () => {
  const examples = loadDiskExamples();
  assert.ok(examples.length >= 10);
  examples.forEach((one, i) => {
    assert.equal(one.index, i + 1);
    assert.ok(one.title.length > 0, `${one.path} missing title`);
    assert.ok(one.content.length > 0, `${one.path} is empty`);
  });
  assert.equal(examples[0]?.name, "01-signals.jl");
});

test("resolveExample matches by index, filename, stem, slug, and unique prefix", () => {
  const examples = loadDiskExamples();
  assert.equal(resolveExample(examples, { index: 1 })?.name, "01-signals.jl");
  assert.equal(resolveExample(examples, { index: 7 })?.name, "07-session-and-workspace.jl");
  assert.equal(resolveExample(examples, { name: "01-signals.jl" })?.index, 1);
  assert.equal(resolveExample(examples, { name: "01-signals" })?.index, 1);
  assert.equal(resolveExample(examples, { name: "signals" })?.index, 1);
  assert.equal(resolveExample(examples, { name: "SIGNaLS" })?.index, 1);
  assert.equal(resolveExample(examples, { name: "08" })?.name, "08-simulation.jl");
  assert.equal(resolveExample(examples, { name: "simulation" })?.index, 8);
  assert.equal(resolveExample(examples, { name: "optimization-lp" })?.index, 9);
  assert.equal(resolveExample(examples, { index: 999 }), null);
  assert.equal(resolveExample(examples, { name: "" }), null);
  assert.equal(resolveExample(examples, { name: "optimization-" }), null);
  assert.equal(resolveExample(examples, { name: "does-not-exist" }), null);
});
