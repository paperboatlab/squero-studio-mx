import test from "node:test";
import assert from "node:assert/strict";
import {
  addEntries,
  createRunToken,
  entryForLine,
  entryFrom,
  entryLabel,
  figureFileName,
  groupFiguresByRun,
  latestRunFigures,
  MIME,
} from "../src/plot/history.ts";
import { FIGURE_FORMATS, type FigureMeta } from "../src/kernel/protocol.ts";

const meta = (id: string, version: string, extra: Partial<FigureMeta> = {}): FigureMeta => ({
  id, version, title: "Waves", width: 600, height: 450, plots: 2, axes: 1,
  formats: ["eps", "pdf", "png", "svg"], lines: [3, 4], ...extra,
});

test("a version enters the history once; newer entries come first", () => {
  const first = addEntries([], [entryFrom(meta("figure-1", "a"), "waves.jl", 1)]);
  const again = addEntries(first, [entryFrom(meta("figure-1", "a"), "waves.jl", 2)]);
  assert.equal(again.length, 1, "the same drawing is not a new entry");
  const changed = addEntries(again, [entryFrom(meta("figure-1", "b"), "waves.jl", 3)]);
  assert.deepEqual(changed.map((e) => e.key), ["figure-1@b", "figure-1@a"]);
});

test("every figure of one run is kept, in the order drawn (last on top)", () => {
  const run = [entryFrom(meta("figure-2", "x"), "a.jl"), entryFrom(meta("figure-3", "y"), "a.jl")];
  assert.deepEqual(addEntries([], run).map((e) => e.figure), ["figure-3", "figure-2"]);
});

test("→ figure finds the entry a line drew into, else the file's latest", () => {
  const history = addEntries([], [
    entryFrom(meta("figure-1", "a", { lines: [2] }), "one.jl"),
    entryFrom(meta("figure-2", "b", { lines: [7] }), "one.jl"),
    entryFrom(meta("figure-3", "c", { lines: [2] }), "two.jl"),
  ]);
  assert.equal(entryForLine(history, "one.jl", 2)?.figure, "figure-1");
  assert.equal(entryForLine(history, "one.jl", 99)?.figure, "figure-2");
  assert.equal(entryForLine(history, "none.jl", 2), undefined);
});

test("file names come from the title and are numbered in a zip", () => {
  const entry = entryFrom(meta("figure-1", "a", { title: "Bode: |H(jω)|" }), "dir/bode.jl");
  assert.equal(figureFileName(entry, "pdf", 0, 1), "Bode-H-j.pdf");
  assert.equal(figureFileName(entry, "svg", 1, 3), "02-Bode-H-j.svg");
  const untitled = entryFrom(meta("figure-1", "a", { title: "" }), "dir/bode.jl");
  assert.equal(figureFileName(untitled, "png", 0, 1), "bode.png");
  assert.equal(entryLabel(untitled), "bode.jl");
});

test("every export format has a MIME type", () => {
  assert.deepEqual(FIGURE_FORMATS, ["png", "svg", "pdf", "eps", "html"]);
  for (const format of FIGURE_FORMATS) assert.ok(MIME[format]);
});

test("groupFiguresByRun separates interleaved runs and omits empty runs", () => {
  const run1 = createRunToken("lorenz.jl", "file", 1000);
  const run2 = createRunToken("waves.jl", "cell", 2000);
  const emptyRun = createRunToken("empty.jl", "file", 3000);
  assert.equal(emptyRun.source, "empty.jl");

  let history = addEntries([], [entryFrom(meta("figure-1", "v1"), "lorenz.jl", 1010, run1)]);
  history = addEntries(history, [entryFrom(meta("figure-2", "v1"), "waves.jl", 2010, run2)]);
  history = addEntries(history, [entryFrom(meta("figure-3", "v1"), "lorenz.jl", 1020, run1)]);

  const groups = groupFiguresByRun(history);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, run2.id);
  assert.deepEqual(groups[0].entries.map((e) => e.figure), ["figure-2"]);
  assert.equal(groups[1].id, run1.id);
  assert.deepEqual(groups[1].entries.map((e) => e.figure), ["figure-3", "figure-1"]);
});

test("latestRunFigures dedupes redrawn figures to their latest version", () => {
  const run = createRunToken("lorenz.jl", "debug", 1000);
  let history = addEntries([], [
    entryFrom(meta("figure-1", "v1"), "lorenz.jl", 1010, run),
    entryFrom(meta("figure-2", "v1"), "lorenz.jl", 1020, run),
  ]);
  history = addEntries(history, [entryFrom(meta("figure-1", "v2"), "lorenz.jl", 1030, run)]);

  const exported = latestRunFigures(history, run.id);
  assert.deepEqual(exported.map((e) => e.key), ["figure-2@v1", "figure-1@v2"]);
});
