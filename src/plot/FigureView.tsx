// A figure page: a subplot grid of the shared components. A line tile is the Scope; a surface
// tile is the Station SceneView; heat and scatter are small canvases.
import { useEffect, useMemo, useRef } from "react";
import { Scope } from "@paperboat/shared/plot";
import { SceneView } from "@paperboat/shared/station";
import { chartAxes, chartView, surfaceEntity } from "../chart/surface.ts";
import { sampled, sampled2, times } from "../chart/samples.ts";
import type { Figure, FigureTile } from "./figure.ts";

function HeatTile() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * 2; cv.height = h * 2;
    const g = cv.getContext("2d")!;
    g.scale(2, 2);
    const n = 48;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i / n) * 4 - 2, z = (j / n) * 4 - 2;
      const v = (Math.sin(x * 1.4) * Math.cos(z * 1.2) + 1) / 2;
      g.fillStyle = `hsl(${250 - v * 190}, ${60 + v * 20}%, ${20 + v * 45}%)`;
      g.fillRect((i * w) / n, (j * h) / n, w / n + 1, h / n + 1);
    }
  }, []);
  return <canvas ref={ref} className="figure-canvas" />;
}

function ScatterTile() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * 2; cv.height = h * 2;
    const g = cv.getContext("2d")!;
    g.scale(2, 2);
    for (let i = 0; i < 180; i++) {
      const t = i / 180;
      g.fillStyle = `hsl(${20 + t * 40}, 80%, 55%)`;
      g.beginPath();
      g.arc((0.15 + t * 0.7) * w + Math.sin(i * 2.1) * 12, (0.5 + Math.cos(i * 1.7) * 0.28) * h, 2, 0, Math.PI * 2);
      g.fill();
    }
  }, []);
  return <canvas ref={ref} className="figure-canvas" />;
}

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
        {tile.kind === "heat" && <HeatTile />}
        {tile.kind === "scatter" && <ScatterTile />}
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
