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
  return { id, shape: "mesh", pos: [0, 0, 0], vertices, indices, values, range: [0, 1] };
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

/** Three axes and their ticks, drawn by the same SceneView as the surface. */
export function chartAxes(): Entity[] {
  const out: Entity[] = [];
  const add = (id: string, from: [number, number, number], to: [number, number, number], color: string) =>
    out.push({ id, shape: "line", pos: from, to, color });
  const ink = "#55554f";
  add("axis.x", [-2.2, 0.002, 2.2], [2.2, 0.002, 2.2], ink);
  add("axis.z", [-2.2, 0.002, 2.2], [-2.2, 0.002, -2.2], ink);
  add("axis.y", [-2.2, 0.002, 2.2], [-2.2, 1.35, 2.2], "#ff5a1f");
  for (const t of [-2, -1, 0, 1, 2]) {
    add(`axis.x.${t}`, [t, 0.002, 2.2], [t, 0.002, 2.05], ink);
    add(`axis.z.${t}`, [-2.2, 0.002, t], [-2.05, 0.002, t], ink);
  }
  for (const h of [0.5, 1]) add(`axis.y.${h}`, [-2.2, h, 2.2], [-2.05, h, 2.2], "#ff5a1f");
  return out;
}
