// The floating kernel panel: the Julia session's versions, the julia up panel and the General
// registry browser. Opened from the kernel chip in the bar; Esc or a press outside closes it.
import { useRef } from "react";
import { useDismiss, useFocusReturn } from "@paperboat/shared/components";
import type { KernelInfo } from "../kernel/probe.ts";
import { JULIA_VERSION, KERNEL_IMAGE } from "../version.ts";
import { JuliaPanel } from "../julia/JuliaPanel.tsx";

export function KernelPanel({
  kernel, onClose, onSay,
}: {
  kernel: KernelInfo | null;
  onClose: () => void;
  onSay?: (text: string, level: "info" | "ok" | "warn" | "err") => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDismiss(dialog, () => onClose());
  useFocusReturn(dialog);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Kernel" data-own-keys>
      <div ref={dialog} className="modal-dialog kernel-dialog">
        <header className="modal-head">
          <h3>kernel</h3>
          <span className="tag">{kernel ? `julia ${kernel.julia}` : `julia ${JULIA_VERSION}`}</span>
          <span className="tag">{kernel?.image || KERNEL_IMAGE}</span>
          <span className="sp" />
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <JuliaPanel onSay={onSay} />
      </div>
    </div>
  );
}
