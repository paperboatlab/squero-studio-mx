// The floating kernel panel: the Julia session's versions, the julia up panel and the General
// registry browser, in the shared package window. Opened from the kernel chip in the bar.
import { PackageWindow } from "@paperboat/shared/packages";
import type { KernelInfo, KernelMismatch } from "../kernel/probe.ts";
import { formatKernelImage, JULIA_VERSION, KERNEL_DIGEST, kernelImageRef } from "../version.ts";
import { JuliaPanel } from "../julia/JuliaPanel.tsx";

export function KernelPanel({
  kernel, mismatch, onClose, onSay,
}: {
  kernel: KernelInfo | null;
  mismatch?: KernelMismatch | null;
  onClose: () => void;
  onSay?: (text: string, level: "info" | "ok" | "warn" | "err") => void;
}) {
  const juliaTag = kernel ? `julia ${kernel.julia}` : mismatch ? `julia ${mismatch.actualJulia} (mismatch)` : `julia ${JULIA_VERSION}`;
  const imageTag = formatKernelImage(
    kernel?.image ?? mismatch?.image ?? kernelImageRef(),
    kernel?.image_digest ?? mismatch?.imageDigest ?? KERNEL_DIGEST,
  );
  return (
    <PackageWindow
      title="kernel"
      tags={[juliaTag, imageTag]}
      onClose={onClose}
    >
      {mismatch && <p className="hint kernel-mismatch-note" role="alert">{mismatch.message}</p>}
      <JuliaPanel onSay={onSay} />
    </PackageWindow>
  );
}
