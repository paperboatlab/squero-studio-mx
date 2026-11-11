// A figure page: a subplot grid of the shared components. A line tile is the Scope; a surface
// tile is the Station SceneView; heat and scatter are small canvases.
import { useMemo } from "react";
import { Heatmap, Scatter, Scope } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import { chartAxes, chartView, surfaceEntity } from "../chart/surface.ts";
import { heatSamples, sampled, sampled2, scatterPoints, times } from "../chart/samples.ts";
import type { Entity } from "@paperboat/shared/protocol";
import type { Figure, FigureTile } from "./figure.ts";

/** The solver's objective grid as a Station mesh with a red optimum marker. */
function OptimizationSurface({ data }: { data: NonNullable<FigureTile["surface"]> }) {
  const { entities, view } = useMemo(() => {
    const { x, y, z, point } = data;
    const nx = x.length, ny = y.length;
    const vertices: number[] = [];
    const values: number[] = [];
    let lo = Infinity, hi = -Infinity;
    for (const row of z) for (const value of row) { if (value < lo) lo = value; if (value > hi) hi = value; }
    const span = hi - lo || 1;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        vertices.push(x[i], z[j][i], y[j]);
        values.push((z[j][i] - lo) / span);
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const xspan = Math.max(...x) - Math.min(...x) || 1;
    const yspan = Math.max(...y) - Math.min(...y) || 1;
    const zspan = hi - lo || 1;
    const across = Math.max(xspan, yspan, 1);
    const surface: Entity = {
      id: "objective", shape: "mesh", pos: [0, 0, 0], vertices, indices, values,
      range: [0, 1], wireframe: true,
    };
    const marker: Entity | null = point ? {
      id: "optimum", shape: "sphere", pos: point, size: [across * 0.05, across * 0.05, across * 0.05],
      color: "#e5484d",
    } : null;
    const cx = (Math.min(...x) + Math.max(...x)) / 2;
    const cz = (Math.min(...y) + Math.max(...y)) / 2;
    const mid = (lo + hi) / 2;
    return {
      entities: (marker ? { surface, marker } : { surface }) as Record<string, Entity>,
      view: {
        mode: "3d" as const,
        grid: true,
        floor: lo - across * 0.15,
        camera: {
          eye: [cx + across * 0.95, hi + Math.max(zspan, across) * 0.85, cz + across * 0.95] as [number, number, number],
          target: [cx, mid, cz] as [number, number, number],
          fov: 45,
        },
      },
    };
  }, [data]);
  return <SceneView entities={entities} view={view} grid axes={false} />;
}

const HEAT = heatSamples();
const SCATTER = scatterPoints();

function Tile({ tile, focus, headless }: { tile: FigureTile; focus?: string | null; headless?: boolean }) {
  const entities = useMemo(() => {
    if (tile.kind !== "surface") return null;
    const list = chartAxes();
    return Object.fromEntries([["surface", surfaceEntity(48, `fig.${tile.row}.${tile.col}`)], ...list.map((e) => [e.id, e])]);
  }, [tile.kind, tile.row, tile.col]);
  return (
    <div className={`figure-tile${focus === tile.title ? " focus" : ""}`}>
      {!headless && <div className="figure-head"><span>{tile.row},{tile.col}</span><b>{tile.kind}</b><span className="sp" /><span className="tag">{tile.title.slice(0, 34)}</span></div>}
      <div className="figure-body">
        {tile.kind === "line" && (() => {
          const series = tile.series?.filter((one) => one.x?.length && one.y?.length) ?? [];
          const channels = series.length
            ? series.map((one, index) => ({
              id: `s${index}`,
              label: one.label?.trim() || (series.length > 1 ? `y${index + 1}` : "y"),
              unit: "–",
              buf: { times: one.x as number[], values: one.y as number[] },
            }))
            : [
              { id: "a", label: "y", unit: "–", buf: { times, values: sampled } },
              { id: "b", label: "y₂", unit: "–", buf: { times, values: sampled2 } },
            ];
          return <Scope name={tile.title} channels={channels} version={1} live={false} settings={{ window: 5, grid: true }} small />;
        })()}
        {tile.kind === "surface" && tile.surface && <OptimizationSurface data={tile.surface} />}
        {tile.kind === "surface" && !tile.surface && entities && <SceneView entities={entities} view={chartView} grid axes />}
        {tile.kind === "heat" && <Heatmap values={tile.heat ?? HEAT} />}
        {tile.kind === "scatter" && <Scatter points={tile.points ?? SCATTER} color="#3e63dd" />}
      </div>
    </div>
  );
}

export function FigureView({ figure, focus }: { figure: Figure; focus?: string | null }) {
  const single = figure.rows === 1 && figure.cols === 1;
  return (
    <div className={`figure-grid${single ? " single" : ""}`} style={{ gridTemplateColumns: `repeat(${figure.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${figure.rows}, minmax(0, 1fr))` }}>
      {Array.from({ length: figure.rows * figure.cols }, (_, n) => {
        const row = Math.floor(n / figure.cols) + 1;
        const col = (n % figure.cols) + 1;
        const tile = figure.tiles.find((t) => t.row === row && t.col === col);
        return tile ? <Tile key={`${row}.${col}`} tile={tile} focus={focus} headless={single} /> : (
          <div className="figure-tile empty" key={`${row}.${col}`}><span>{row},{col}</span></div>
        );
      })}
    </div>
  );
}
