import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axis2dToPlotProps,
  axis3CameraFor,
  axis3ToSceneData,
  cameraToAzEl,
  isCameraAtHome,
  sceneYUpToXYZ,
  unpackScene,
  type SceneAxis2D,
  type SceneAxis3D,
} from "../src/plot/scene.ts";

test("unpackScene decodes inline nulls as NaN and little-endian binary buffers", () => {
  // Build binary buffer containing 3 float32s (offset 0) and 3 uint32s (offset 16, 4-byte aligned)
  const buf = new ArrayBuffer(32);
  const dv = new DataView(buf);
  dv.setFloat32(0, 1.5, true);
  dv.setFloat32(4, 2.5, true);
  dv.setFloat32(8, -0.5, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 1, true);
  dv.setUint32(24, 2, true);
  const rawBytes = new Uint8Array(buf);

  const rawScene = {
    id: "figure-1",
    title: "Test",
    width: 600,
    height: 450,
    background: "#ffffff",
    layout: {
      kind: "grid",
      nrows: 1,
      ncols: 2,
      colgap: 12,
      rowgap: 12,
      cols: [{ kind: "fr", value: 1 }, { kind: "fr", value: 1 }],
      rows: [{ kind: "fr", value: 1 }],
      items: [
        {
          row: 1,
          rowEnd: 2,
          col: 1,
          colEnd: 2,
          block: {
            kind: "axis",
            index: 1,
            title: "2D",
            subtitle: "",
            titlealign: "center",
            xlabel: "x",
            ylabel: "y",
            limits: [0, 2, -1, 3],
            xscale: "linear",
            yscale: "linear",
            xreversed: false,
            yreversed: false,
            yaxisposition: "left",
            xaxisposition: "bottom",
            backgroundcolor: "#ffffff",
            xgridvisible: true,
            ygridvisible: true,
            xticksvisible: true,
            yticksvisible: true,
            xticklabelsvisible: true,
            yticklabelsvisible: true,
            xticks: [0, 1, 2],
            xticklabels: ["0", "1", "2"],
            yticks: [-1, 1, 3],
            yticklabels: ["-1", "1", "3"],
            topspinevisible: true,
            rightspinevisible: true,
            leftspinevisible: true,
            bottomspinevisible: true,
            linkX: 1,
            linkY: null,
            aspect: null,
            legends: [],
            plots: [
              {
                kind: "lines",
                label: "gap",
                x: [0, 1, 2],
                y: [1.0, null, 2.0],
                color: "#0072BD",
                linewidth: 1.5,
                linestyle: "solid",
              },
            ],
          },
        },
        {
          row: 1,
          rowEnd: 2,
          col: 2,
          colEnd: 3,
          block: {
            kind: "axis3",
            index: 2,
            title: "3D",
            xlabel: "x",
            ylabel: "y",
            zlabel: "z",
            limits: [0, 1, 0, 1, -1, 1],
            half: [1, 1, 1],
            azimuth: 1.25,
            elevation: 0.45,
            perspectiveness: 0.5,
            backgroundcolor: "#ffffff",
            xticks: [0, 1],
            xticklabels: ["0", "1"],
            yticks: [0, 1],
            yticklabels: ["0", "1"],
            zticks: [-1, 1],
            zticklabels: ["-1", "1"],
            xgridvisible: true,
            ygridvisible: true,
            zgridvisible: true,
            legends: [],
            plots: [
              {
                kind: "wireframe",
                label: "wf",
                positions: { buf: true, dtype: "f32", offset: 0, length: 3 },
                indices: { buf: true, dtype: "u32", offset: 16, length: 3 },
                color: "#262626",
                linewidth: 1,
              },
            ],
          },
        },
      ],
    },
  };

  const scene = unpackScene(rawScene, rawBytes);
  assert.equal(scene.layout.items.length, 2);

  const ax2 = scene.layout.items[0].block as SceneAxis2D;
  assert.equal(ax2.kind, "axis");
  const line = ax2.plots[0];
  assert.equal(line.kind, "lines");
  if (line.kind === "lines") {
    assert.equal(line.y[0], 1.0);
    assert.ok(Number.isNaN(line.y[1]));
    assert.equal(line.y[2], 2.0);
  }

  const twinx: SceneAxis2D = { ...ax2, index: 3, ylabel: "y2", yaxisposition: "right", limits: [0, 2, 10, 20] };
  const props2 = axis2dToPlotProps(ax2, twinx);
  assert.equal(props2.axes.ylabel2?.text, "y2");
  assert.deepEqual(props2.axes.y2lim, [10, 20]);
  assert.equal(props2.layers[1].secondaryY, true);

  const ax3 = scene.layout.items[1].block as SceneAxis3D;
  const wf = ax3.plots[0];
  assert.equal(wf.kind, "wireframe");
  if (wf.kind === "wireframe") {
    assert.deepEqual(Array.from(wf.positions), [1.5, 2.5, -0.5]);
    assert.deepEqual(Array.from(wf.indices), [0, 1, 2]);
  }
});

test("3D spherical Z-up <-> Y-up camera mapping and Axis3 scene geometry", () => {
  const ax3: SceneAxis3D = {
    kind: "axis3",
    index: 1,
    title: "Surface",
    xlabel: "x",
    ylabel: "y",
    zlabel: "z",
    limits: [0, 2, 0, 2, 0, 4],
    half: [1, 1, 1],
    azimuth: -2.27765,
    elevation: 0.3927,
    perspectiveness: 0.5,
    backgroundcolor: "#ffffff",
    xticks: [0, 1, 2],
    xticklabels: ["0", "1", "2"],
    yticks: [0, 1, 2],
    yticklabels: ["0", "1", "2"],
    zticks: [0, 2, 4],
    zticklabels: ["0", "2", "4"],
    xgridvisible: true,
    ygridvisible: true,
    zgridvisible: true,
    legends: [],
    plots: [
      {
        kind: "stem",
        label: "pts",
        positions: new Float32Array([1, 1, 4]),
        color: "#D95319",
        linewidth: 1,
        markersize: 6,
        offset: 0,
      },
    ],
  };

  const cam = axis3CameraFor(ax3);
  assert.equal(cam.projection, "persp");
  assert.ok(isCameraAtHome(cam, cam));

  const roundTrip = cameraToAzEl(cam.eye, cam.target);
  assert.ok(Math.abs(roundTrip.azimuth - ax3.azimuth) < 1e-4);
  assert.ok(Math.abs(roundTrip.elevation - ax3.elevation) < 1e-4);

  const rotated = axis3CameraFor(ax3, 0.8, 0.25);
  assert.equal(isCameraAtHome(rotated, cam), false);

  const withGrid = axis3ToSceneData(ax3, true, false);
  const noGrid = axis3ToSceneData(ax3, false, false);
  assert.ok(withGrid.layers.length > noGrid.layers.length);
  assert.ok(withGrid.labels.length >= 6);

  // Center point (1, 1, 4) in [0..2, 0..2, 0..4] maps to Y-up (0, +1, 0)
  const stemPts = withGrid.layers.find((l) => l.kind === "points");
  assert.ok(stemPts);
  assert.deepEqual(Array.from(stemPts.positions), [0, 1, 0]);
  const gridLayer = withGrid.layers.find((l) => l.id.endsWith(":grid"));
  assert.equal(gridLayer?.pickable, false);
  assert.deepEqual(sceneYUpToXYZ([0, 1, 0], ax3.limits, ax3.half), [1, 1, 4]);
  const [rx, ry, rz] = sceneYUpToXYZ([0.6, 0.2, 0], [0, 2, 0, 5, -1, 1], [1.2, 1.0, 0.8]);
  assert.ok(Math.abs(rx - 1.5) < 1e-6 && Math.abs(ry - 2.5) < 1e-6 && Math.abs(rz - 0.25) < 1e-6);
});
