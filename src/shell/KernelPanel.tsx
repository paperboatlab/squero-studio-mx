// The floating kernel panel: the Julia session's versions, the julia up panel and the General
// registry browser, in the shared package window. Opened from the kernel chip in the bar.
import { PackageWindow } from "@paperboat/shared/packages";
import type { KernelInfo } from "../kernel/probe.ts";
import { JULIA_VERSION, KERNEL_IMAGE, KERNEL_VERSION } from "../version.ts";
import { JuliaPanel } from "../julia/JuliaPanel.tsx";

export function KernelPanel({
  kernel, onClose, onSay,
}: {
  kernel: KernelInfo | null;
  onClose: () => void;
  onSay?: (text: string, level: "info" | "ok" | "warn" | "err") => void;
}) {
  return (
    <PackageWindow
      title="kernel"
      tags={[kernel ? `julia ${kernel.julia}` : `julia ${JULIA_VERSION}`, kernel?.image || `${KERNEL_IMAGE}:${KERNEL_VERSION}`]}
      onClose={onClose}
    >
      <JuliaPanel onSay={onSay} />
    </PackageWindow>
  );
}
