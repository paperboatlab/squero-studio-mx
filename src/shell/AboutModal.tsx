// About Squero Studio MX: the shared dialog with the live Julia/kernel and Paperboat versions.
import { AboutSquero } from "@paperboat/shared/squero";
import type { KernelInfo, KernelMismatch } from "../kernel/probe.ts";
import type { LinkStatus } from "../paperboat/link.ts";
import {
  formatKernelImage,
  FRONTEND_VERSION,
  JULIA_VERSION,
  KERNEL_DIGEST,
  KERNEL_PROTOCOL,
  kernelImageRef,
  PAPERBOAT_PROTOCOL,
} from "../version.ts";

export function AboutModal({
  status, kernel, mismatch, onClose,
}: {
  status: LinkStatus;
  kernel?: KernelInfo | null;
  mismatch?: KernelMismatch | null;
  onClose: () => void;
}) {
  const paperboat = status === "attached" ? "Connected" : status === "connecting" ? "Connecting…" : "Not connected";
  const juliaValue = kernel?.julia
    ?? (mismatch ? `${mismatch.actualJulia || "unknown"} (expected ${mismatch.expectedJulia})` : JULIA_VERSION);
  const kernelValue = formatKernelImage(
    kernel?.image ?? mismatch?.image ?? kernelImageRef(),
    kernel?.image_digest ?? mismatch?.imageDigest ?? KERNEL_DIGEST,
  );
  const kernelProtocol = kernel
    ? `squero-kernel/${kernel.protocol}`
    : mismatch?.actualProtocol != null
    ? `squero-kernel/${mismatch.actualProtocol} (expected ${KERNEL_PROTOCOL})`
    : KERNEL_PROTOCOL;
  const shownJulia = kernel?.julia ?? JULIA_VERSION;

  return (
    <AboutSquero
      product="MX"
      runtime="Julia"
      facts={[
        { label: "Frontend", value: FRONTEND_VERSION },
        { label: "Julia", value: juliaValue },
        { label: "Kernel", value: kernelValue },
        { label: "Protocol", value: `${kernelProtocol} · ${PAPERBOAT_PROTOCOL}` },
        { label: "Paperboat", value: paperboat },
        { label: "License", value: "Apache License 2.0" },
      ]}
      credits={<>Built on <a href="https://julialang.org" target="_blank" rel="noreferrer">Julia</a> {shownJulia}, with the shared Paperboat UI, plot and station components.</>}
      onClose={onClose}
    />
  );
}
