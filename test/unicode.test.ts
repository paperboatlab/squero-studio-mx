import test from "node:test";
import assert from "node:assert/strict";
import { LATEX_SYMBOLS, latexSymbol, replaceLatexAtCaret } from "../src/editor/unicode.ts";

test("the common Julia symbols are in the map", () => {
  assert.equal(latexSymbol("pi"), "π");
  assert.equal(latexSymbol("alpha"), "α");
  assert.equal(latexSymbol("infty"), "∞");
  assert.equal(latexSymbol("le"), "≤");
  assert.equal(LATEX_SYMBOLS.Gamma, "Γ");
  assert.equal(latexSymbol("notASymbol"), undefined);
});

test("a LaTeX token before the caret becomes one character", () => {
  assert.deepEqual(replaceLatexAtCaret("x = \\pi", 7), { value: "x = π", caret: 5 });
  assert.deepEqual(replaceLatexAtCaret("\\alpha + 1", 6), { value: "α + 1", caret: 1 });
  assert.equal(replaceLatexAtCaret("\\pie", 4), null);
  assert.equal(replaceLatexAtCaret("pi", 2), null);
});

test("only the token at the caret is replaced", () => {
  assert.deepEqual(replaceLatexAtCaret("a \\pi + b", 5), { value: "a π + b", caret: 3 });
  assert.equal(replaceLatexAtCaret("\\pi + b", 4), null);
});
