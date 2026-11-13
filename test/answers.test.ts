import test from "node:test";
import assert from "node:assert/strict";
import { computeLineAnswers, formatScalar, shortTypeName, type AnswerVariable } from "../src/editor/answers.ts";

test("comments outside strings are stripped while # inside strings stays intact", () => {
  const answers = computeLineAnswers([
    "fs = 8.0 # [Julia] sample rate, Hz",
    'label = "band #1" # note',
    "#= Figure()",
    "   save(\"x.svg\", fig)",
    "=#",
    "steps = 4000",
  ], [
    { name: "fs", type: "Float64", shape: "1", value: 8 },
    { name: "label", type: "String", shape: "text", value: "band #1" },
    { name: "steps", type: "Int64", shape: "1", value: 4000 },
  ]);

  assert.equal(answers[0]?.text, "8.0");
  assert.equal(answers[1]?.text, '"band #1"');
  assert.equal(answers[2], null);
  assert.equal(answers[3], null);
  assert.equal(answers[4], null);
  assert.equal(answers[5]?.text, "4000");
});

test("surfaces script shows function, range vectors, comprehended matrix, tuple destructuring, and plot calls accurately", () => {
  const Z = [
    [-1.0, 0.0, 1.0],
    [0.0, 2.0, -6.5511],
  ];
  const workspace: AnswerVariable[] = [
    { name: "peaks", type: "Function", shape: "—" },
    { name: "xs", type: "Vector{Float64}", shape: "60", value: Array.from({ length: 60 }, (_, i) => -3 + (6 * i) / 59) },
    { name: "ys", type: "Vector{Float64}", shape: "60", value: Array.from({ length: 60 }, (_, i) => -3 + (6 * i) / 59) },
    { name: "Z", type: "Matrix{Float64}", shape: "60 × 60", value: Z },
    { name: "zmin", type: "Float64", shape: "1", value: -6.5511 },
    { name: "at", type: "CartesianIndex{2}", shape: "—" },
    { name: "fig", type: "Figure", shape: "900 × 720" },
    { name: "ax1", type: "Axis3", shape: "—" },
    { name: "s", type: "Surface{Tuple{Vector{Float64}, Vector{Float64}, Matrix{Float32}}}", shape: "—" },
  ];

  const lines = [
    "peaks(x, y) = 3 * (1 - x)^2 * exp(-x^2 - (y + 1)^2) -",
    "    10 * (x / 5 - x^3 - y^5) * exp(-x^2 - y^2) -",
    "    1/3 * exp(-(x + 1)^2 - y^2)",
    "xs = range(-3, 3; length = 60)             # [Julia]",
    "Z = [peaks(x, y) for x in xs, y in ys]",
    "zmin, at = findmin(Z)",
    "fig = Figure(; size = (900, 720))",
    "ax1 = Axis3(fig[1, 1];",
    '    title = "surface")',
    "s = surface!(ax1, xs, ys, Z)",
    'save("peaks_surfaces.svg", fig)',
    "fig",
  ];

  const answers = computeLineAnswers(lines, workspace);
  assert.equal(answers[0]?.text, "function");
  assert.equal(answers[1], null);
  assert.equal(answers[2], null);

  assert.equal(answers[3]?.text, "60");
  assert.equal(answers[3]?.kind, "spark");
  assert.ok(Array.isArray(answers[3]?.data));
  assert.equal((answers[3]?.data as number[]).length, 60);

  assert.equal(answers[4]?.text, "60 × 60");
  assert.equal(answers[4]?.kind, "heat");
  assert.deepEqual(answers[4]?.data, Z);

  assert.equal(answers[5]?.text, "-6.551, CartesianIndex{2}");
  assert.match(answers[5]?.title ?? "", /zmin :: Float64.*at :: CartesianIndex\{2\}/);

  assert.equal(answers[6]?.text, "→ figure");
  assert.equal(answers[6]?.figureLine, 7);
  assert.equal(answers[7]?.text, "→ figure");
  assert.equal(answers[8], null); // keyword argument inside Axis3(...)
  assert.equal(answers[9]?.text, "→ figure");
  assert.equal(answers[10]?.text, "→ file");
  assert.equal(answers[11]?.text, "→ figure");
  assert.equal(answers[11]?.figureLine, 12);
});

test("eliminates inaccurate hardcoded fallbacks (Int64 on Float64, grid on hypot/A, fake sel)", () => {
  const answers = computeLineAnswers([
    "n = 10",
    "r = hypot(3, 4)",
    "m, c, k = 1.0, 0.6, 4.0",
    "A = [0.0 1.0; -k/m -c/m]",
    "sel = 42",
    "dt = 0.01",
    'msg = "Figure() and save()"',
  ], []);

  assert.equal(answers[0]?.text, "10");
  assert.equal(answers[1]?.text, "5");
  assert.equal(answers[2]?.text, "1.0, 0.6, 4.0");
  assert.equal(answers[3]?.text, "2 × 2");
  assert.equal(answers[3]?.kind, "heat");
  assert.equal(answers[4]?.text, "42");
  assert.equal(answers[5]?.text, "0.01");
  assert.equal(answers[6], null); // string msg isn't in empty workspace, and definitely not `→ figure` or `→ file`!
});

test("edits override stale workspace values and loop/tuple fields stay isolated", () => {
  const workspace: AnswerVariable[] = [
    { name: "xs", type: "Vector{Float64}", shape: "60", value: Array.from({ length: 60 }, (_, i) => i) },
    { name: "s", type: "Surface{Any}", shape: "—" },
    { name: "problem", type: "@NamedTuple{fun::String, Aeq::Matrix{Float64}}", shape: "—" },
    { name: "Aeq", type: "Matrix{Float64}", shape: "1 × 2" },
    { name: "σ", type: "Float64", shape: "1", value: 10 },
    { name: "ρ", type: "Float64", shape: "1", value: 28 },
    { name: "β", type: "Float64", shape: "1", value: 8 / 3 },
  ];

  const answers = computeLineAnswers([
    "xs = range(0, 4π; length = 200)",
    "problem = (fun = fun,",
    "    Aeq = [1.0 1.0])",
    "σ, ρ, β = 10.0, 28.0, 8 / 3",
    "for k in 2:10",
    "    s = X[:, k - 1]",
    "end",
    "X[:, 1] = [1.0, 1.0, 1.0]",
  ], workspace);

  assert.equal(answers[0]?.text, "200");
  assert.equal(answers[1]?.text, "NamedTuple");
  assert.equal(answers[2], null); // Aeq inside (...) must not show stale workspace Aeq
  assert.equal(answers[3]?.text, "10.0, 28.0, 2.667");
  assert.equal(answers[4], null);
  assert.equal(answers[5], null); // loop-local s must not show stale Surface `s`
  assert.equal(answers[6], null);
  assert.equal(answers[7], null); // indexed assignment is not a declaration
});

test("scalar and type helpers format consistently", () => {
  assert.equal(formatScalar(8, "Float64"), "8.0");
  assert.equal(formatScalar(4000, "Int64"), "4000");
  assert.equal(formatScalar(1e-8, "Float64"), "1.0e-8");
  assert.equal(shortTypeName("@NamedTuple{a::Float64}"), "NamedTuple");
  assert.equal(shortTypeName("CartesianIndex{2}"), "CartesianIndex{2}");
  assert.equal(shortTypeName("SqueroPlot.Surface{Tuple{Vector{Float64}}}"), "Surface");
});
