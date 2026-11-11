// About Squero Studio MX, following the OM dialog: the W3 Water mark, the Julia/kernel and
// Paperboat versions, the license and the creator.
import { useRef } from "react";
import { useDismiss, useFocusReturn } from "@paperboat/shared/components";
import type { LinkStatus } from "../paperboat/link.ts";
import { FRONTEND_VERSION, JULIA_VERSION, KERNEL_IMAGE, KERNEL_PROTOCOL, KERNEL_VERSION, PAPERBOAT_PROTOCOL } from "../version.ts";
import { SqueroLogo } from "./SqueroLogo.tsx";

const CREATOR = { name: "Thanapong Chuangyanyong", href: "https://github.com/thanapong-chuangyanyong" };

export function AboutModal({ status, onClose }: { status: LinkStatus; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  // Dismiss on Escape or a press on the overlay; focus returns to the About button.
  useDismiss(dialog, () => onClose());
  useFocusReturn(dialog);

  const paperboat = status === "attached" ? "Connected" : status === "connecting" ? "Connecting…" : "Not connected";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="About Squero Studio MX" data-own-keys>
      <div ref={dialog} className="modal-dialog about-dialog">
        <header className="modal-head">
          <h3>About Squero Studio</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="about-body">
          <div className="about-mark">
            <SqueroLogo product="MX" height={34} running />
            <span className="lbl">Julia</span>
          </div>
          <div className="about-info">
            <dl className="about-facts">
              <dt>Version</dt>
              <dd className="mono">{FRONTEND_VERSION}</dd>
              <dt>Julia</dt>
              <dd className="mono">{JULIA_VERSION}</dd>
              <dt>Kernel</dt>
              <dd className="mono">{KERNEL_IMAGE}:{KERNEL_VERSION}</dd>
              <dt>Protocol</dt>
              <dd className="mono">{KERNEL_PROTOCOL} · {PAPERBOAT_PROTOCOL}</dd>
              <dt>Paperboat</dt>
              <dd className="mono">{paperboat}</dd>
              <dt>License</dt>
              <dd>Apache License 2.0</dd>
            </dl>
            <section className="about-section">
              <h3>Credits</h3>
              <p>
                Built on{" "}
                <a href="https://julialang.org" target="_blank" rel="noreferrer">Julia</a>{" "}
                {JULIA_VERSION}, with the shared Paperboat UI, plot and station components.
              </p>
              <p>
                Created by{" "}
                <a href={CREATOR.href} target="_blank" rel="noreferrer">{CREATOR.name}</a>.
              </p>
              <p className="lbl">A PaperboatLab project.</p>
            </section>
          </div>
        </div>
        <footer className="modal-actions">
          <button type="button" className="key small" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
