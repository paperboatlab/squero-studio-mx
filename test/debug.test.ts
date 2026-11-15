import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import {
  flattenBreakpoints,
  formatDebugValue,
  removeBreakpoint,
  setBreakpointCondition,
  setBreakpointEnabled,
  toggleBreakpointList,
  type BreakpointMap,
} from "../src/debug/state.ts";
import {
  bpField,
  debugExtension,
  pausedLineField,
  setBreakpointsEffect,
  setPausedLineEffect,
} from "../src/editor/debugGutter.ts";

test("toggleBreakpointList adds sorted breakpoints, toggles off, and prunes empty files", () => {
  let map: BreakpointMap = {};
  map = toggleBreakpointList(map, "main.jl", 12);
  map = toggleBreakpointList(map, "main.jl", 4);
  assert.deepEqual(map["main.jl"], [
    { line: 4, enabled: true },
    { line: 12, enabled: true },
  ]);

  map = toggleBreakpointList(map, "main.jl", 4);
  assert.deepEqual(map["main.jl"], [{ line: 12, enabled: true }]);

  map = toggleBreakpointList(map, "main.jl", 12);
  assert.equal("main.jl" in map, false);
});

test("setBreakpointEnabled, setBreakpointCondition, and removeBreakpoint update targeted entries", () => {
  let map: BreakpointMap = { "sim.jl": [{ line: 8, enabled: true }] };
  map = setBreakpointEnabled(map, "sim.jl", 8, false);
  assert.equal(map["sim.jl"][0]?.enabled, false);

  map = setBreakpointCondition(map, "sim.jl", 8, "  k == 4  ");
  assert.equal(map["sim.jl"][0]?.condition, "k == 4");

  map = setBreakpointCondition(map, "sim.jl", 8, "   ");
  assert.equal(map["sim.jl"][0]?.condition, undefined);

  map = removeBreakpoint(map, "sim.jl", 8);
  assert.equal("sim.jl" in map, false);
});

test("flattenBreakpoints returns breakpoints sorted by file then line", () => {
  const flat = flattenBreakpoints({
    "z.jl": [{ line: 9, enabled: true }],
    "a.jl": [
      { line: 15, enabled: false },
      { line: 3, enabled: true, condition: "i > 2" },
    ],
  });
  assert.deepEqual(flat, [
    { file: "a.jl", line: 3, enabled: true, condition: "i > 2" },
    { file: "a.jl", line: 15, enabled: false },
    { file: "z.jl", line: 9, enabled: true },
  ]);
});

test("formatDebugValue formats scalars, arrays, text fallbacks, and empty placeholders", () => {
  assert.equal(formatDebugValue({ name: "a", type: "Int64", shape: "1", value: 42 }), "42");
  assert.equal(formatDebugValue({ name: "x", type: "Float64", shape: "1", value: 3.14159 }), "3.142");
  assert.equal(formatDebugValue({ name: "int_big", type: "Int64", shape: "1", value: 25000 }), "25000");
  assert.equal(formatDebugValue({ name: "big", type: "Float64", shape: "1", value: 25000.5 }), "2.5e+4");
  assert.equal(formatDebugValue({ name: "flag", type: "Bool", shape: "1", value: true }), "true");
  assert.equal(formatDebugValue({ name: "v", type: "Vector{Int64}", shape: "4", preview: [1, 2, 3, 4] }), "[1, 2, 3, …]");
  assert.equal(formatDebugValue({ name: "s", type: "Custom", shape: "1", text: "CustomStruct(1, 2)\nextra" }), "CustomStruct(1, 2)");
  assert.equal(formatDebugValue({ name: "n", type: "Nothing" }), "—");
});

test("debugExtension updates CodeMirror breakpoint and paused-line fields via effects", () => {
  let state = EditorState.create({
    doc: "a = 1\nb = 2\nc = 3",
    extensions: [debugExtension(() => () => {})],
  });
  assert.deepEqual(state.field(bpField), []);
  assert.equal(state.field(pausedLineField), null);

  state = state.update({
    effects: [
      setBreakpointsEffect.of([{ line: 2, enabled: true }]),
      setPausedLineEffect.of(2),
    ],
  }).state;
  assert.deepEqual(state.field(bpField), [{ line: 2, enabled: true }]);
  assert.equal(state.field(pausedLineField), 2);
});
