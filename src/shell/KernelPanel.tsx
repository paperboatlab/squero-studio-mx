// The kernel tab of the right pane: the Julia session (state, versions, Restart, Interrupt) and,
// under it, the workspace's packages and the General registry (JuliaPanel). A tab, not a modal:
// a Pkg job runs for minutes and the rest of MX stays usable meanwhile.
import type { KernelInfo, KernelMismatch } from "../kernel/probe.ts";
import { formatKernelImage, JULIA_VERSION, KERNEL_DIGEST, kernelImageRef } from "../version.ts";
import { JuliaPanel } from "../julia/JuliaPanel.tsx";

export type KernelState = "ready" | "running" | "starting" | "unavailable" | "mismatch";

export function KernelPanel({
  kernel, mismatch, state, onRestart, onInterrupt, onSay,
}: {
  kernel: KernelInfo | null;
  mismatch?: KernelMismatch | null;
  state: KernelState;
  onRestart: () => void;
  onInterrupt?: () => void;
  onSay?: (text: string, level: "info" | "ok" | "warn" | "err") => void;
}) {
  const julia = kernel?.julia ?? mismatch?.actualJulia ?? JULIA_VERSION;
  const image = formatKernelImage(
    kernel?.image ?? mismatch?.image ?? kernelImageRef(),
    kernel?.image_digest ?? mismatch?.imageDigest ?? KERNEL_DIGEST,
  );
  // "ghcr.io/paperboatlab/squero-julia-kernel:1.11.6-r4 (sha256:…)" reads as its last segment.
  const shortImage = image.replace(/ \(.*\)$/, "").split("/").pop() ?? image;
  return (
    <div className="tabbody kernel-tab">
      <section className="pk kernel-sec" aria-label="Kernel">
        <div className="pk-head">
          <div className="pk-title">
            <b>kernel</b>
            <span className={`kernel-state ${state}`}>{state === "ready" ? "idle" : state}</span>
          </div>
          {onInterrupt && state === "running" && (
            <button type="button" className="key small" onClick={onInterrupt} title="Stop the running code; the session stays">Interrupt</button>
          )}
          <button
            type="button"
            className="key small"
            onClick={onRestart}
            disabled={state === "starting"}
            title="Start a fresh Julia session: clears every variable, reloads packages"
          >
            Restart
          </button>
        </div>
        <dl className="kernel-facts">
          <dt>julia</dt><dd>{julia}</dd>
          <dt>image</dt><dd title={image}>{shortImage}</dd>
          {kernel && <><dt>protocol</dt><dd>squero-kernel/{kernel.protocol}</dd></>}
        </dl>
        {mismatch && <p className="hint kernel-mismatch-note" role="alert">{mismatch.message}</p>}
        {state === "unavailable" && <p className="hint" role="alert">No kernel answered. The console says why; Restart tries again.</p>}
      </section>
      <JuliaPanel onSay={onSay} />
    </div>
  );
}
