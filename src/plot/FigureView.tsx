// Interactive multi-panel 2D/3D figure renderer on the stage.
// Drives @paperboat/shared Plot2D (pan, box-zoom, wheel-zoom, hover readout, dual cursors A/B,
// linked axes, twinx) and @paperboat/shared/station SceneView (OrbitControls, CAD viewCube,
// home reset, Persp/Iso, 3D grids & surface wireframes) while emitting ViewState for export.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Colorbar, formatCoord, Plot2D, TexText, type PlotViewLimits, type PlotViewState } from "@paperboat/shared/plot";
import { SceneView, type SceneCameraState, type ScenePlotPick } from "@paperboat/shared/station";
import type { ViewAxisState, ViewState } from "../kernel/protocol.ts";
import { entryLabel, type FigureEntry } from "./history.ts";
import {
  axis2dToPlotProps,
  axis3CameraFor,
  axis3ToSceneData,
  cameraToAzEl,
  isCameraAtHome,
  sceneYUpToXYZ,
  type SceneAxis2D,
  type SceneAxis3D,
  type SceneBlock,
  type SceneColorbar,
  type SceneGridBlock,
  type SceneLabelBlock,
  type SceneLayoutItem,
  type SceneLegend,
  type SceneTrack,
} from "./scene.ts";

function isDarkHex(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
}

const cssTracks = (tracks: readonly SceneTrack[]) =>
  tracks.map((t) => {
    if (t.kind === "fixed") return `${t.value}px`;
    if (t.kind === "relative") return `${(t.value * 100).toFixed(2)}%`;
    if (t.kind === "auto") return "auto";
    return `minmax(0, ${Math.max(0.05, t.value)}fr)`;
  }).join(" ");

function LegendCell({ legend }: { legend: SceneLegend }) {
  const horiz = legend.orientation === "horizontal";
  const showBg = legend.backgroundcolor && legend.backgroundcolor !== "transparent";
  return (
    <div
      className={`fig-legend-cell${horiz ? " horiz" : ""}${legend.framevisible ? " framed" : ""}`}
      style={{
        background: showBg ? legend.backgroundcolor : undefined,
        borderColor: legend.framevisible && legend.framecolor !== "transparent" ? legend.framecolor : undefined,
      }}
    >
      {legend.title ? <div className="fig-legend-title"><TexText text={legend.title} /></div> : null}
      <div className="fig-legend-items">
        {legend.entries.map((entry, idx) => (
          <div className="fig-legend-entry" key={idx}>
            <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden>
              {entry.patch && (
                <rect
                  x="2" y="2" width="18" height="8" rx="1"
                  fill={entry.patch.color}
                  stroke={entry.patch.strokecolor && entry.patch.strokecolor !== "transparent" ? entry.patch.strokecolor : undefined}
                  strokeWidth={entry.patch.strokewidth ?? 1}
                />
              )}
              {entry.line && (
                <line
                  x1="1" y1="6" x2="21" y2="6"
                  stroke={entry.line.color}
                  strokeWidth={Math.max(1, entry.line.linewidth ?? 1.5)}
                  strokeDasharray={entry.line.linestyle === "dashed" ? "5 3" : entry.line.linestyle === "dotted" ? "2 3" : entry.line.linestyle === "dashdot" ? "6 2 2 2" : undefined}
                />
              )}
              {entry.marker && (
                <circle
                  cx="11" cy="6" r="3"
                  fill={entry.marker.color}
                  stroke={entry.marker.strokecolor && entry.marker.strokecolor !== "transparent" ? entry.marker.strokecolor : entry.marker.color}
                  strokeWidth={entry.marker.strokewidth ?? 1}
                />
              )}
            </svg>
            <TexText text={entry.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Axis2DCell({
  ax,
  twinx,
  resetKey,
  linkedX,
  linkedY,
  onLinkX,
  onLinkY,
  onAxisViewChange,
}: {
  ax: SceneAxis2D;
  twinx?: SceneAxis2D;
  resetKey: number;
  linkedX?: [number, number];
  linkedY?: [number, number];
  onLinkX: (groupId: number, lim: [number, number] | null) => void;
  onLinkY: (groupId: number, lim: [number, number] | null) => void;
  onAxisViewChange: (patches: ViewAxisState[], modified: boolean) => void;
}) {
  const { layers, axes } = useMemo(() => axis2dToPlotProps(ax, twinx), [ax, twinx]);
  const lastViewKey = useRef("");
  const viewLimits = useMemo<PlotViewLimits | undefined>(() => {
    if (ax.linkX == null && ax.linkY == null) return undefined;
    const out: PlotViewLimits = {};
    if (ax.linkX != null) out.x = linkedX ?? null;
    if (ax.linkY != null) out.y = linkedY ?? null;
    return out;
  }, [ax.linkX, ax.linkY, linkedX, linkedY]);

  const handleViewChange = useCallback((st: PlotViewState) => {
    const key = `${st.limits.join(",")}|${st.y2lim?.join(",") ?? ""}|${st.gridVisible}|${st.atHome}`;
    if (key === lastViewKey.current) return;
    lastViewKey.current = key;

    if (ax.linkX != null) onLinkX(ax.linkX, st.atHome ? null : [st.limits[0], st.limits[1]]);
    if (ax.linkY != null) onLinkY(ax.linkY, st.atHome ? null : [st.limits[2], st.limits[3]]);

    const patches: ViewAxisState[] = [{
      index: ax.index,
      limits: st.limits,
      xgridvisible: st.gridVisible,
      ygridvisible: st.gridVisible,
    }];
    if (twinx) {
      patches.push({
        index: twinx.index,
        limits: [
          st.limits[0],
          st.limits[1],
          st.y2lim ? st.y2lim[0] : twinx.limits[2],
          st.y2lim ? st.y2lim[1] : twinx.limits[3],
        ],
      });
    }
    onAxisViewChange(patches, !st.atHome);
  }, [ax.index, ax.linkX, ax.linkY, onAxisViewChange, onLinkX, onLinkY, twinx]);

  return (
    <div className="fig-axis-cell">
      <Plot2D
        key={`${ax.index}:${resetKey}`}
        series={[]}
        layers={layers}
        axes={axes}
        interactive
        viewLimits={viewLimits}
        onViewChange={handleViewChange}
      />
    </div>
  );
}

function Axis3Cell({
  ax,
  background,
  globalResetKey,
  onAxisViewChange,
}: {
  ax: SceneAxis3D;
  background: string;
  globalResetKey: number;
  onAxisViewChange: (patches: ViewAxisState[], modified: boolean) => void;
}) {
  const homeCam = useMemo(() => axis3CameraFor(ax), [ax]);
  const initialGrid = ax.xgridvisible || ax.ygridvisible || ax.zgridvisible;
  const [projection, setProjection] = useState<"persp" | "iso">(homeCam.projection);
  const [grid, setGrid] = useState(initialGrid);
  const [localReset, setLocalReset] = useState(0);
  const [picked3d, setPicked3d] = useState<{ scene: [number, number, number]; data: [number, number, number] } | null>(null);
  const angleTextRef = useRef<HTMLSpanElement>(null);
  const lastCamRef = useRef<SceneCameraState>({ eye: homeCam.eye, target: homeCam.target });

  useEffect(() => {
    setProjection(homeCam.projection);
    setGrid(initialGrid);
    setPicked3d(null);
    lastCamRef.current = { eye: homeCam.eye, target: homeCam.target };
    if (angleTextRef.current) {
      const deg = (r: number) => `${Math.round((r * 180) / Math.PI)}°`;
      angleTextRef.current.textContent = `az ${deg(ax.azimuth)} · el ${deg(ax.elevation)}`;
    }
  }, [ax.azimuth, ax.elevation, globalResetKey, homeCam, initialGrid, localReset]);

  const bgColor = ax.backgroundcolor !== "transparent" ? ax.backgroundcolor : background;
  const darkBg = isDarkHex(bgColor);
  const sceneData = useMemo(() => axis3ToSceneData(ax, grid, darkBg), [ax, grid, darkBg]);
  const viewSpec = useMemo(() => ({
    mode: "3d" as const,
    camera: { fov: homeCam.fov, eye: homeCam.eye, target: homeCam.target },
  }), [homeCam]);

  const emitState = useCallback((cam: SceneCameraState, proj: "persp" | "iso", grd: boolean) => {
    const { azimuth, elevation } = cameraToAzEl(cam.eye, cam.target);
    const modified = !isCameraAtHome(cam, homeCam) || proj !== homeCam.projection || grd !== initialGrid;
    onAxisViewChange(
      [{
        index: ax.index,
        azimuth,
        elevation,
        perspectiveness: proj === "iso" ? 0 : (ax.perspectiveness > 0.05 ? ax.perspectiveness : 0.5),
        xgridvisible: grd,
        ygridvisible: grd,
        zgridvisible: grd,
      }],
      modified,
    );
  }, [ax.index, ax.perspectiveness, homeCam, initialGrid, onAxisViewChange]);

  const handleCameraChange = useCallback((cam: SceneCameraState) => {
    lastCamRef.current = cam;
    if (angleTextRef.current) {
      const { azimuth, elevation } = cameraToAzEl(cam.eye, cam.target);
      const deg = (r: number) => `${Math.round((r * 180) / Math.PI)}°`;
      angleTextRef.current.textContent = `az ${deg(azimuth)} · el ${deg(elevation)}`;
    }
    emitState(cam, projection, grid);
  }, [emitState, grid, projection]);

  const toggleProj = () => {
    const next = projection === "persp" ? "iso" : "persp";
    setProjection(next);
    emitState(lastCamRef.current, next, grid);
  };
  const toggleGrid = () => {
    const next = !grid;
    setGrid(next);
    emitState(lastCamRef.current, projection, next);
  };
  const reset3d = () => {
    setPicked3d(null);
    setLocalReset((n) => n + 1);
    onAxisViewChange(
      [{
        index: ax.index,
        azimuth: ax.azimuth,
        elevation: ax.elevation,
        perspectiveness: ax.perspectiveness,
        xgridvisible: initialGrid,
        ygridvisible: initialGrid,
        zgridvisible: initialGrid,
      }],
      false,
    );
  };
  const handlePlotPick = useCallback((pick: ScenePlotPick | null) => {
    if (!pick) {
      setPicked3d(null);
      return;
    }
    setPicked3d({
      scene: pick.point,
      data: sceneYUpToXYZ(pick.point, ax.limits, ax.half),
    });
  }, [ax.limits, ax.half]);

  return (
    <div className="fig-ax3-cell">
      {ax.title ? (
        <div className="fig-ax3-title"><TexText text={ax.title} /></div>
      ) : null}
      <div className="fig-ax3-stage">
        <div className="scene-wrap">
          <SceneView
            key={`${ax.index}:${globalResetKey}:${localReset}`}
            entities={{}}
            view={viewSpec}
            grid={grid}
            projection={projection}
            cube="compact"
            floorGrid={false}
            axes={false}
            background={bgColor !== "transparent" ? bgColor : "#ffffff"}
            labels={sceneData.labels}
            plots={sceneData.layers}
            pickedPoint={picked3d?.scene ?? null}
            onCameraChange={handleCameraChange}
            onPlotPick={handlePlotPick}
          />
        </div>
      </div>
      <div className="pb-plot2d-foot fig-ax3-foot">
        <div className="fig-ax3-tools">
          <button
            type="button"
            className={`pb-plot2d-btn${projection === "iso" ? " on" : ""}`}
            onClick={toggleProj}
            title="Toggle perspective / orthographic projection"
          >
            {projection === "iso" ? "Iso" : "Persp"}
          </button>
          <button
            type="button"
            className={`pb-plot2d-btn${grid ? " on" : ""}`}
            onClick={toggleGrid}
            title="Toggle 3D grid lines"
          >
            Grid
          </button>
          <button
            type="button"
            className="pb-plot2d-btn"
            onClick={reset3d}
            title="Reset 3D camera"
          >
            ⌂
          </button>
        </div>
        <div className={`pb-plot2d-readout${picked3d ? " pinned" : ""}`}>
          {picked3d ? (
            <span className="fig-ax3-pick">
              <i className="pb-plot2d-pin-dot" aria-hidden />
              <span>x={formatCoord(picked3d.data[0])}</span>
              <span>y={formatCoord(picked3d.data[1])}</span>
              <span>z={formatCoord(picked3d.data[2])}</span>
              <button
                type="button"
                className="pb-plot2d-pin-clear"
                title="Clear picked 3D point"
                aria-label="Clear picked 3D point"
                onClick={() => setPicked3d(null)}
              >
                ×
              </button>
            </span>
          ) : null}
          <span className="fig-ax3-angles" ref={angleTextRef} hidden={Boolean(picked3d)} />
          <span className="pb-plot2d-help-tag" aria-label="3D controls help">?</span>
        </div>
        <div className="pb-plot2d-help" role="note">
          drag orbit · wheel zoom · right-drag pan · click pick · cube snap
        </div>
      </div>
    </div>
  );
}

export function FigureView({
  entry,
  resetSeq,
  onViewStateChange,
}: {
  entry: FigureEntry;
  resetSeq: number;
  onViewStateChange: (entryKey: string, state: ViewState | null, modified: boolean) => void;
}) {
  const scene = entry.scene;
  const [linkedX, setLinkedX] = useState<Record<number, [number, number]>>({});
  const [linkedY, setLinkedY] = useState<Record<number, [number, number]>>({});
  const axisStatesRef = useRef<Map<number, { patch: ViewAxisState; modified: boolean }>>(new Map());

  useEffect(() => {
    setLinkedX({});
    setLinkedY({});
    axisStatesRef.current.clear();
    onViewStateChange(entry.key, null, false);
  }, [entry.key, resetSeq, onViewStateChange]);

  const handleLinkX = useCallback((groupId: number, lim: [number, number] | null) => {
    setLinkedX((prev) => {
      if (lim === null) {
        if (!(groupId in prev)) return prev;
        const next = { ...prev };
        delete next[groupId];
        return next;
      }
      const cur = prev[groupId];
      if (cur && cur[0] === lim[0] && cur[1] === lim[1]) return prev;
      return { ...prev, [groupId]: lim };
    });
  }, []);

  const handleLinkY = useCallback((groupId: number, lim: [number, number] | null) => {
    setLinkedY((prev) => {
      if (lim === null) {
        if (!(groupId in prev)) return prev;
        const next = { ...prev };
        delete next[groupId];
        return next;
      }
      const cur = prev[groupId];
      if (cur && cur[0] === lim[0] && cur[1] === lim[1]) return prev;
      return { ...prev, [groupId]: lim };
    });
  }, []);

  const handleAxisViewChange = useCallback((patches: ViewAxisState[], modified: boolean) => {
    for (const patch of patches) {
      axisStatesRef.current.set(patch.index, { patch, modified });
    }
    const all = Array.from(axisStatesRef.current.values());
    const anyModified = all.some((x) => x.modified);
    onViewStateChange(
      entry.key,
      anyModified ? { axes: all.map((x) => x.patch) } : null,
      anyModified,
    );
  }, [entry.key, onViewStateChange]);

  if (!scene) {
    return (
      <div className="figure-stage">
        {entry.preview
          ? <img src={entry.preview} alt={entryLabel(entry)} width={entry.width} height={entry.height} />
          : <span className="figure-wait">loading interactive scene…</span>}
      </div>
    );
  }

  const paperBg = scene.background !== "transparent" ? scene.background : "#ffffff";

  type ColorbarPair = { side: "left" | "right"; pull: number; axis?: SceneAxis2D };

  const renderBlock = (blk: SceneBlock, key: string, twinx?: SceneAxis2D, cbPair?: ColorbarPair) => {
    if (blk.kind === "grid") return renderGrid(blk, key);
    if (blk.kind === "axis") {
      return (
        <Axis2DCell
          key={key}
          ax={blk}
          twinx={twinx}
          resetKey={resetSeq}
          linkedX={blk.linkX != null ? linkedX[blk.linkX] : undefined}
          linkedY={blk.linkY != null ? linkedY[blk.linkY] : undefined}
          onLinkX={handleLinkX}
          onLinkY={handleLinkY}
          onAxisViewChange={handleAxisViewChange}
        />
      );
    }
    if (blk.kind === "axis3") {
      return (
        <Axis3Cell
          key={key}
          ax={blk}
          background={paperBg}
          globalResetKey={resetSeq}
          onAxisViewChange={handleAxisViewChange}
        />
      );
    }
    if (blk.kind === "colorbar") {
      const cb = blk as SceneColorbar;
      const cellStyle: CSSProperties | undefined = cb.vertical ? (() => {
        const ax = cbPair?.axis;
        const top = ax
          ? Math.max(cb.label ? 22 : 8, 8 + (ax.title ? 20 : 0) + (ax.subtitle ? 16 : 0))
          : (cb.label ? 24 : 20);
        const bottom = ax
          ? 24 + (ax.xticklabelsvisible ? 24 : 10) + (ax.xlabel ? 18 : 0)
          : 28;
        return {
          justifyContent: cbPair?.side === "right" ? "flex-end" : "flex-start",
          paddingTop: `${top}px`,
          paddingBottom: `${bottom}px`,
          ...(cbPair?.side === "left" && cbPair.pull > 0 ? { marginLeft: `-${cbPair.pull}px` } : {}),
          ...(cbPair?.side === "right" && cbPair.pull > 0 ? { marginRight: `-${cbPair.pull}px` } : {}),
        };
      })() : undefined;
      return (
        <div key={key} className={`fig-colorbar-cell${cb.vertical ? " vert" : " horiz"}`} style={cellStyle}>
          <Colorbar
            range={cb.limits}
            colormap={cb.colormap}
            ticks={cb.ticks}
            ticklabels={cb.ticklabels}
            label={cb.label || undefined}
            vertical={cb.vertical}
            interpreter="tex"
          />
        </div>
      );
    }
    if (blk.kind === "label") {
      const lbl = blk as SceneLabelBlock;
      const rotated = Math.abs(Math.abs(lbl.rotation) - Math.PI / 2) < 0.25;
      return (
        <div
          key={key}
          className={`fig-label-cell${rotated ? " rotated" : ""}`}
          style={{
            fontSize: `${Math.max(11, Math.min(18, lbl.fontsize))}px`,
            fontWeight: lbl.bold ? 600 : 400,
            color: lbl.color && lbl.color !== "transparent" ? lbl.color : undefined,
          }}
        >
          <TexText text={lbl.text} />
        </div>
      );
    }
    if (blk.kind === "legend") {
      return <LegendCell key={key} legend={blk as SceneLegend} />;
    }
    return null;
  };

  const renderGrid = (grid: SceneGridBlock, prefix: string) => {
    // Coalesce overlaid right-hand twinx axes in the exact same grid cell into one interactive Plot2D.
    const slotKey = (it: SceneLayoutItem) => `${it.row}:${it.rowEnd}:${it.col}:${it.colEnd}`;
    const bySlot = new Map<string, SceneLayoutItem[]>();
    for (const it of grid.items) {
      const k = slotKey(it);
      const list = bySlot.get(k);
      if (list) list.push(it);
      else bySlot.set(k, [it]);
    }

    const colGap = Math.max(4, Math.round(grid.colgap * 0.5));
    const rowGap = Math.max(4, Math.round(grid.rowgap * 0.55));
    const slots = Array.from(bySlot.entries());
    const cells: React.ReactNode[] = [];
    for (const [sKey, items] of slots) {
      const first = items[0];
      const cellStyle: CSSProperties = {
        gridRow: `${first.row} / ${first.rowEnd}`,
        gridColumn: `${first.col} / ${first.colEnd}`,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      };
      if (items.length === 2 && items[0].block.kind === "axis" && items[1].block.kind === "axis") {
        const a = items[0].block as SceneAxis2D;
        const b = items[1].block as SceneAxis2D;
        if (b.yaxisposition === "right" && a.yaxisposition !== "right") {
          cells.push(
            <div key={`${prefix}:${sKey}`} className="fig-grid-cell" style={cellStyle}>
              {renderBlock(a, `${prefix}:${sKey}:ax`, b)}
            </div>,
          );
          continue;
        }
        if (a.yaxisposition === "right" && b.yaxisposition !== "right") {
          cells.push(
            <div key={`${prefix}:${sKey}`} className="fig-grid-cell" style={cellStyle}>
              {renderBlock(b, `${prefix}:${sKey}:ax`, a)}
            </div>,
          );
          continue;
        }
      }
      if (items.length === 1) {
        let cbPair: ColorbarPair | undefined;
        if (first.block.kind === "colorbar" && first.block.vertical) {
          const preferLeft = first.block.flipaxis;
          const adjSide = (side: "left" | "right") => slots.find(([, sItems]) => {
            const sf = sItems[0];
            if (Math.max(sf.row, first.row) >= Math.min(sf.rowEnd, first.rowEnd)) return false;
            const adjacentCol = side === "left" ? sf.colEnd === first.col : sf.col === first.colEnd;
            return adjacentCol && sItems.some((it) => it.block.kind === "axis" || it.block.kind === "axis3");
          });
          const leftAdj = adjSide("left");
          const rightAdj = adjSide("right");
          const chosen = preferLeft
            ? (leftAdj ? { side: "left" as const, slot: leftAdj } : rightAdj ? { side: "right" as const, slot: rightAdj } : null)
            : (rightAdj ? { side: "right" as const, slot: rightAdj } : leftAdj ? { side: "left" as const, slot: leftAdj } : null);
          if (chosen) {
            const axItem = chosen.slot[1].find((it) => it.block.kind === "axis" && it.block.yaxisposition !== "right")
              ?? chosen.slot[1].find((it) => it.block.kind === "axis");
            cbPair = {
              side: chosen.side,
              pull: Math.max(0, colGap - 2),
              axis: axItem?.block.kind === "axis" ? axItem.block : undefined,
            };
          }
        }
        cells.push(
          <div key={`${prefix}:${sKey}`} className="fig-grid-cell" style={cellStyle}>
            {renderBlock(first.block, `${prefix}:${sKey}:0`, undefined, cbPair)}
          </div>,
        );
      } else {
        cells.push(
          <div key={`${prefix}:${sKey}`} className="fig-grid-cell stacked" style={{ ...cellStyle, position: "relative" }}>
            {items.map((it, idx) => renderBlock(it.block, `${prefix}:${sKey}:${idx}`))}
          </div>,
        );
      }
    }

    return (
      <div
        className="fig-grid"
        style={{
          gridTemplateColumns: cssTracks(grid.cols),
          gridTemplateRows: cssTracks(grid.rows),
          columnGap: `${colGap}px`,
          rowGap: `${rowGap}px`,
        }}
      >
        {cells}
      </div>
    );
  };

  return (
    <div
      className="figure-interactive-stage"
      style={{ background: paperBg }}
    >
      {renderGrid(scene.layout, entry.key)}
    </div>
  );
}
