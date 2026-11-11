// A height field as a Paperboat Station mesh entity. The 3D chart is not a second renderer:
// `SceneView` (the same code that draws the Station) draws this mesh, colours it by its field,
// and gives it the same camera, grid, view cube and theme.
import type { Entity, View } from "@paperboat/shared/protocol";

/** The camera the chart opens with: an isometric three-quarter view, slightly above the peak. */
export const chartView: View = {
  mode: "3d",
  grid: false,
  camera: { eye: [5.6, 3.2, 5.6], target: [0, 0.55, 0], fov: 45 },
};

/** `raw` is the height; returns a 0..1 field so the mesh's viridis colours are stable. */
function normalize(raw: readonly number[]): number[] {
  let lo = Infinity, hi = -Infinity;
  for (const v of raw) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const out = new Array<number>(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = (raw[i] - lo) / span;
  return out;
}

/**
 * A surface over [-1, 1] × [-1, 1] as a `mesh` entity: vertices, two triangles per cell,
 * and one field value per vertex. `n` is the cells per side; 64 is 4 225 vertices.
 */
function peaks(x: number, z: number): number {
  return (
    3 * (1 - x) ** 2 * Math.exp(-(x ** 2) - (z + 1) ** 2) -
    10 * (x / 5 - x ** 3 - z ** 5) * Math.exp(-(x ** 2) - z ** 2) -
    Math.exp(-((x + 1) ** 2) - z ** 2) / 3
  );
}

export function surfaceEntity(n = 64, id = "chart.surface"): Entity {
  const side = n + 1;
  const raw: number[] = new Array(side * side);
  const vertices: number[] = new Array(side * side * 3);
  let k = 0;
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const x = -2.2 + (4.4 * i) / n;
      const z = -2.2 + (4.4 * j) / n;
      // The classic MATLAB `peaks`: three lobes and a dip, familiar at a glance.
      raw[k] = peaks(x, z);
      vertices[k * 3] = x;
      vertices[k * 3 + 1] = raw[k];
      vertices[k * 3 + 2] = z;
      k++;
    }
  }
  const values = normalize(raw);
  for (let i = 0; i < raw.length; i++) vertices[i * 3 + 1] = values[i] * 1.25;
  const indices: number[] = new Array(n * n * 6);
  let t = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * side + j;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Counter-clockwise seen from +y.
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }
  return { id, shape: "mesh", pos: [0, 0, 0], vertices, indices, values, range: [0, 1], wireframe: true };
}

/** A set of points and a polyline, also drawn by `SceneView`, for a scatter/line chart. */
export function pointsEntity(points: readonly [number, number, number][], id = "chart.points"): Entity[] {
  return points.map((p, i) => ({
    id: `${id}.${i}`,
    shape: "sphere",
    pos: p,
    size: [0.018, 0.018, 0.018],
    color: "var(--signal)",
  }));
}

/** Coordinate axes at (0,0,0), drawn through the surface by the shared SceneView. */
export function chartAxes(): Entity[] {
  const out: Entity[] = [];
  const add = (id: string, from: [number, number, number], to: [number, number, number], color: string) =>
    out.push({ id, shape: "line", pos: from, to, color, overlay: true });
  const red = "#e5484d", green = "#30a46c", blue = "#3e63dd";
  const half = 2.2, up = 1.35, head = 0.12, tick = 0.07;

  add("axis.x", [-half, 0.002, 0], [half, 0.002, 0], red);
  add("axis.z", [0, 0.002, -half], [0, 0.002, half], blue);
  add("axis.y", [0, 0.002, 0], [0, up, 0], green);

  for (const t of [-2, -1, 0, 1, 2]) {
    add(`axis.x.${t}`, [t, 0.002, -tick], [t, 0.002, tick], red);
    add(`axis.z.${t}`, [-tick, 0.002, t], [tick, 0.002, t], blue);
  }
  for (const h of [0.5, 1]) add(`axis.y.${h}`, [-tick, h, 0], [tick, h, 0], green);

  // Arrowheads at the positive ends.
  add("axis.x.a1", [half, 0.002, 0], [half - head, 0.002 + tick, 0], red);
  add("axis.x.a2", [half, 0.002, 0], [half - head, 0.002 - tick, 0], red);
  add("axis.x.a3", [half, 0.002, 0], [half - head, 0.002, tick], red);
  add("axis.x.a4", [half, 0.002, 0], [half - head, 0.002, -tick], red);
  add("axis.z.a1", [0, 0.002, half], [tick, 0.002, half - head], blue);
  add("axis.z.a2", [0, 0.002, half], [-tick, 0.002, half - head], blue);
  add("axis.z.a3", [0, 0.002, half], [0, 0.002 + tick, half - head], blue);
  add("axis.z.a4", [0, 0.002, half], [0, 0.002 - tick, half - head], blue);
  add("axis.y.a1", [0, up, 0], [tick, up - head, 0], green);
  add("axis.y.a2", [0, up, 0], [-tick, up - head, 0], green);
  add("axis.y.a3", [0, up, 0], [0, up - head, tick], green);
  add("axis.y.a4", [0, up, 0], [0, up - head, -tick], green);
  return out;
}

