// Export dialog: defaults to scripted framing and script dimensions, offers size presets,
// optional "Current view" framing from interactive pan/zoom/orbit, and shows a live Cairo
// true-vector SVG preview before downloading single files or a ZIP archive.
import { useEffect, useMemo, useRef, useState } from "react";
import { FIGURE_FORMATS, type FigureFormat, type ViewState } from "../kernel/protocol.ts";
import { figureArtifact, figureExportSized } from "../kernel/client.ts";
import { bufferOf, downloadBlob, SIZE_PRESETS, zipFiles } from "./export.ts";
import { entryLabel, figureFileName, MIME, type FigureEntry } from "./history.ts";

export function ExportModal({
  entries,
  initialFormat,
  viewStates,
  onSaveArtifacts,
  onSay,
  onClose,
}: {
  entries: FigureEntry[];
  initialFormat: FigureFormat;
  viewStates: Readonly<Record<string, { state: ViewState; modified: boolean }>>;
  onSaveArtifacts: (key: string, got: Partial<Record<FigureFormat, Uint8Array>>) => void;
  onSay: (text: string, level?: "info" | "ok" | "warn" | "err") => void;
  onClose: () => void;
}) {
  const primary = entries[0];
  const primaryView = primary ? viewStates[primary.key] : undefined;
  const canUseCurrentView = entries.length === 1 && Boolean(primaryView?.modified && primaryView.state);

  const [format, setFormat] = useState<FigureFormat>(initialFormat);
  const [presetId, setPresetId] = useState<string>("script");
  const [customW, setCustomW] = useState<number>(primary?.width ?? 600);
  const [customH, setCustomH] = useState<number>(primary?.height ?? 450);
  const [useCurrentView, setUseCurrentView] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);
  const lastBlobUrl = useRef<string | null>(null);

  const preset = SIZE_PRESETS.find((p) => p.id === presetId) ?? SIZE_PRESETS[0];
  const targetSize = useMemo(() => {
    if (!primary) return { width: 600, height: 450 };
    if (presetId === "script") return { width: primary.width, height: primary.height };
    if (presetId === "custom") {
      return {
        width: Math.max(120, Math.min(6000, Math.round(Number(customW) || primary.width))),
        height: Math.max(90, Math.min(6000, Math.round(Number(customH) || primary.height))),
      };
    }
    return { width: preset.width ?? primary.width, height: preset.height ?? primary.height };
  }, [customH, customW, preset.height, preset.width, presetId, primary]);

  // Keep custom inputs initialized cleanly when selecting a preset.
  const selectPreset = (id: string) => {
    setPresetId(id);
    const p = SIZE_PRESETS.find((x) => x.id === id);
    if (p?.width && p?.height) {
      setCustomW(p.width);
      setCustomH(p.height);
    } else if (id === "script" && primary) {
      setCustomW(primary.width);
      setCustomH(primary.height);
    }
  };

  useEffect(() => {
    if (!canUseCurrentView && useCurrentView) setUseCurrentView(false);
  }, [canUseCurrentView, useCurrentView]);

  // Revoke displayed blob URL only when replacing it or when the modal unmounts,
  // so the previous preview stays visible while a resized/reframed SVG renders.
  useEffect(() => {
    return () => {
      if (lastBlobUrl.current) {
        URL.revokeObjectURL(lastBlobUrl.current);
        lastBlobUrl.current = null;
      }
    };
  }, []);

  const primaryKey = primary?.key;
  const primaryFigure = primary?.figure;
  const primaryVersion = primary?.version;
  const sameAsScripted = presetId === "script" && !useCurrentView;
  const scriptedSvg = sameAsScripted ? primary?.artifacts.svg : undefined;

  // Live vector Cairo SVG preview of `primary` at target dimensions & framing.
  useEffect(() => {
    if (!primaryKey || !primaryFigure || primaryVersion == null) return;
    const revoking = () => {
      if (lastBlobUrl.current) {
        URL.revokeObjectURL(lastBlobUrl.current);
        lastBlobUrl.current = null;
      }
    };

    const seq = ++previewSeq.current;
    if (sameAsScripted && scriptedSvg) {
      revoking();
      const url = URL.createObjectURL(new Blob([bufferOf(scriptedSvg)], { type: MIME.svg }));
      lastBlobUrl.current = url;
      setPreviewUrl(url);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const timer = window.setTimeout(async () => {
      const reply = await figureExportSized(
        primaryFigure,
        primaryVersion,
        "svg",
        targetSize.width,
        targetSize.height,
        useCurrentView && canUseCurrentView,
        primaryView?.state,
      );
      if (cancelled || seq !== previewSeq.current) return;
      setPreviewLoading(false);
      if (!reply.ok || !reply.bytes) {
        setPreviewError(reply.error ?? "kernel cannot re-render preview (stored snapshots still export)");
        return;
      }
      revoking();
      const url = URL.createObjectURL(new Blob([bufferOf(reply.bytes)], { type: MIME.svg }));
      lastBlobUrl.current = url;
      setPreviewUrl(url);
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    canUseCurrentView,
    presetId,
    primaryFigure,
    primaryKey,
    primaryVersion,
    primaryView?.state,
    sameAsScripted,
    scriptedSvg,
    targetSize.height,
    targetSize.width,
    useCurrentView,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = async () => {
    if (entries.length === 0 || exporting) return;
    setExporting(true);
    try {
      const files: { name: string; blob: Blob }[] = [];
      for (const [index, entry] of entries.entries()) {
        const isScripted = presetId === "script" && (!useCurrentView || !canUseCurrentView);
        let bytes: Uint8Array | undefined;
        if (isScripted) {
          bytes = entry.artifacts[format];
          if (!bytes) {
            const reply = await figureArtifact(entry.figure, entry.version, format, false);
            if (reply.ok && reply.bytes) {
              bytes = reply.bytes;
              onSaveArtifacts(entry.key, { [format]: bytes });
            }
          }
        } else {
          const w = presetId === "script" ? entry.width : targetSize.width;
          const h = presetId === "script" ? entry.height : targetSize.height;
          const reply = await figureExportSized(
            entry.figure,
            entry.version,
            format,
            w,
            h,
            useCurrentView && canUseCurrentView,
            viewStates[entry.key]?.state,
          );
          if (reply.ok && reply.bytes) bytes = reply.bytes;
        }
        if (!bytes) {
          onSay(`${entryLabel(entry)}: failed to export ${format.toUpperCase()}`, "warn");
          continue;
        }
        files.push({
          name: figureFileName(entry, format, index, entries.length),
          blob: new Blob([bufferOf(bytes)], { type: MIME[format] }),
        });
      }
      if (files.length === 0) {
        onSay("nothing to export", "warn");
        return;
      }
      if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
      else downloadBlob(await zipFiles(files), "mx-figures.zip");
      onSay(
        `exported ${files.length} figure${files.length === 1 ? "" : "s"} · ${format.toUpperCase()} (${presetId === "script" ? "script size" : `${targetSize.width}×${targetSize.height}`})`,
        "ok",
      );
      onClose();
    } finally {
      setExporting(false);
    }
  };

  if (!primary) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="export-modal-title" onClick={onClose}>
      <div className="modal-dialog export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id="export-modal-title">
            Export {entries.length === 1 ? entryLabel(primary) : `${entries.length} figures`}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="export-body">
          <div className="export-preview-pane">
            <div className="export-preview-head">
              <span className="tag">live vector preview</span>
              <span className="tag">{`${targetSize.width} × ${targetSize.height} px`}</span>
            </div>
            <div className="export-preview-frame">
              {previewUrl ? (
                <img src={previewUrl} alt={`Export preview of ${entryLabel(primary)}`} />
              ) : (
                <span className="figure-wait">{previewLoading ? "rendering preview…" : "no preview"}</span>
              )}
              {previewLoading && previewUrl ? <span className="export-preview-busy">updating…</span> : null}
            </div>
            {previewError ? <p className="export-err">{previewError}</p> : null}
          </div>

          <div className="export-controls">
            <div className="export-field">
              <label>Format</label>
              <div className="seg" role="group" aria-label="Export format">
                {FIGURE_FORMATS.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className={format === fmt ? "on" : ""}
                    onClick={() => setFormat(fmt)}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <span className="export-hint">
                {format === "png" ? "Hi-DPI raster PNG (2×)" : `True vector Cairo ${format.toUpperCase()}`}
              </span>
            </div>

            <div className="export-field">
              <label>Framing</label>
              <div className="seg" role="group" aria-label="Export framing">
                <button
                  type="button"
                  className={!useCurrentView ? "on" : ""}
                  onClick={() => setUseCurrentView(false)}
                >
                  As scripted
                </button>
                <button
                  type="button"
                  className={useCurrentView ? "on" : ""}
                  disabled={!canUseCurrentView}
                  title={
                    entries.length > 1
                      ? "Current view applies when exporting a single modified figure"
                      : !canUseCurrentView
                        ? "Pan, zoom, or orbit the figure first to capture a custom view"
                        : "Export the interactive viewport's limits / 3D camera"
                  }
                  onClick={() => setUseCurrentView(true)}
                >
                  Current view
                </button>
              </div>
            </div>

            <div className="export-field">
              <label>Size</label>
              <select
                className="export-select"
                value={presetId}
                onChange={(e) => selectPreset(e.target.value)}
                aria-label="Export size preset"
              >
                {SIZE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === "script" && entries.length === 1 ? `as scripted · ${primary.width} × ${primary.height}` : p.label}
                  </option>
                ))}
              </select>
              {presetId === "custom" ? (
                <div className="export-dims">
                  <input
                    type="number"
                    min={120}
                    max={6000}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value))}
                    aria-label="Width in px"
                  />
                  <span>×</span>
                  <input
                    type="number"
                    min={90}
                    max={6000}
                    value={customH}
                    onChange={(e) => setCustomH(Number(e.target.value))}
                    aria-label="Height in px"
                  />
                  <span>px</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="key small" onClick={onClose}>Cancel</button>
          <button type="button" className="key small primary" onClick={() => void handleDownload()} disabled={exporting}>
            {exporting
              ? "Exporting…"
              : entries.length > 1
                ? `Download ZIP (${entries.length})`
                : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
