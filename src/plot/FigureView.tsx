// A figure page: a subplot grid of the shared components. A line tile is the Scope; a surface
// tile is the Station SceneView; heat and scatter are small canvases.
import { useMemo } from "react";
import { Heatmap, Scatter, Scope } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import { chartAxes, chartView, surfaceEntity } from "../chart/surface.ts";
import { heatSamples, sampled, sampled2, scatterPoints, times } from "../chart/samples.ts";
import type { Figure, FigureTile } from "./figure.ts";

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
        {tile.kind === "line" && (
          <Scope
            name={tile.title}
            channels={[
              { id: "a", label: "y", unit: "–", buf: { times, values: sampled } },
              { id: "b", label: "y₂", unit: "–", buf: { times, values: sampled2 } },
            ]}
            version={1}
            live={false}
            settings={{ window: 5, grid: true }}
            small
          />
        )}
        {tile.kind === "surface" && entities && <SceneView entities={entities} view={chartView} grid axes />}
        {tile.kind === "heat" && <Heatmap values={HEAT} />}
        {tile.kind === "scatter" && <Scatter points={SCATTER} color="#3e63dd" />}
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
