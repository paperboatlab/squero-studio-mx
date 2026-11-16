import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSimModel,
  figureEntryFromSignals,
  figureSceneFromSignals,
  matrixParamText,
  rhsRunRequest,
  runRequest,
  stateSpaceRunRequest,
} from "../src/sim/stateSpace.ts";

test("stateSpaceRunRequest builds a control/state_space graph.run message", () => {
  const msg = stateSpaceRunRequest({
    model: {
      A: [[0, 1], [-4, -0.6]],
      B: [[0], [1]],
      C: [[1, 0]],
      D: [[0]],
      x0: [1, 0],
    },
    solver: "rk45",
    step: 0.01,
    duration: 10,
  });
  assert.equal(msg.type, "graph.run");
  assert.equal(msg.settings?.solver, "rk45");
  assert.equal(msg.settings?.dt, 0.01);
  assert.equal(msg.settings?.duration, 10);
  const plant = msg.graph.nodes.find((n) => n.id === "plant");
  assert.equal(plant?.type, "state_space");
  assert.equal(plant?.params?.A, "0 1; -4 -0.6");
  assert.equal(plant?.params?.x0, "1; 0");
  assert.equal(msg.graph.edges.length, 2);
  assert.deepEqual(runRequest({
    model: { A: [[0]], B: [[1]], C: [[1]], D: [[0]], x0: [0] },
    solver: "rk4",
    step: 0.02,
    duration: 2,
  }).graph.nodes[0]?.type, "state_space");
});

test("rhsRunRequest builds a control/rhs graph.run message", () => {
  const msg = rhsRunRequest({
    f: "x2; -4 * x1 - 0.6 * x2",
    x0: [1, 0],
    solver: "rk4",
    step: 0.02,
    duration: 5,
  });
  assert.equal(msg.type, "graph.run");
  assert.equal(msg.graph.nodes[0]?.type, "rhs");
  assert.equal(msg.graph.nodes[0]?.params?.f, "x2; -4 * x1 - 0.6 * x2");
  assert.equal(msg.graph.nodes[0]?.params?.x0, "1; 0");
});

test("detectSimModel finds state_space matrices or rhs f in workspace", () => {
  const ss = detectSimModel([
    { name: "A", type: "Matrix{Float64}", shape: "2×2", value: [[0, 1], [-4, -0.6]] },
    { name: "B", type: "Matrix{Float64}", shape: "2×1", value: [[0], [1]] },
    { name: "C", type: "Matrix{Float64}", shape: "1×2", value: [[1, 0]] },
    { name: "x0", type: "Vector{Float64}", shape: "2", value: [1, 0] },
  ]);
  assert.equal(ss?.kind, "state_space");

  const rhs = detectSimModel([
    { name: "f", type: "String", shape: "1", value: "-x" },
    { name: "x0", type: "Float64", shape: "1", value: 2 },
  ]);
  assert.equal(rhs?.kind, "rhs");
  if (rhs?.kind === "rhs") assert.deepEqual(rhs.x0, [2]);
  assert.equal(matrixParamText([[1, 2], [3, 4]]), "1 2; 3 4");
});

test("figureSceneFromSignals and figureEntryFromSignals convert signal stream to 2D scene", () => {
  const samples = [
    { node: "y_plot", t: 0, v: [1] },
    { node: "y_plot", t: 0.5, v: [0.6] },
    { node: "y_plot", t: 1.0, v: [0.36] },
  ];
  const scene = figureSceneFromSignals(samples, "State-space y(t)");
  assert.ok(scene);
  const entry = figureEntryFromSignals(samples, "08-simulation.jl", "State-space y(t)");
  assert.ok(entry?.scene);
  assert.equal(entry?.plots, 1);
});
