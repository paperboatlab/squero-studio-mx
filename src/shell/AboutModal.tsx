// About Squero Studio MX: the shared dialog with the Julia/kernel and Paperboat versions.
import { AboutSquero } from "@paperboat/shared/squero";
import type { LinkStatus } from "../paperboat/link.ts";
import { FRONTEND_VERSION, JULIA_VERSION, KERNEL_IMAGE, KERNEL_PROTOCOL, KERNEL_VERSION, PAPERBOAT_PROTOCOL } from "../version.ts";

export function AboutModal({ status, onClose }: { status: LinkStatus; onClose: () => void }) {
  const paperboat = status === "attached" ? "Connected" : status === "connecting" ? "Connecting…" : "Not connected";
  return (
    <AboutSquero
      product="MX"
      runtime="Julia"
      facts={[
        { label: "Version", value: FRONTEND_VERSION },
        { label: "Julia", value: JULIA_VERSION },
        { label: "Kernel", value: `${KERNEL_IMAGE}:${KERNEL_VERSION}` },
        { label: "Protocol", value: `${KERNEL_PROTOCOL} · ${PAPERBOAT_PROTOCOL}` },
        { label: "Paperboat", value: paperboat },
        { label: "License", value: "Apache License 2.0" },
      ]}
      credits={<>Built on <a href="https://julialang.org" target="_blank" rel="noreferrer">Julia</a> {JULIA_VERSION}, with the shared Paperboat UI, plot and station components.</>}
      onClose={onClose}
    />
  );
}
