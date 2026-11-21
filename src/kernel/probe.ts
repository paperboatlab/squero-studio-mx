// A squero-kernel/0 hello over the shared client. It proves the kernel is there, validates the
// Julia major/minor and protocol version, and gives the UI the real Julia and image versions.
// Concurrent probes share one hello.
import { JULIA_VERSION, KERNEL_IMAGE, KERNEL_PROTOCOL_VERSION, KERNEL_VERSION } from "../version.ts";
import { kernel } from "./client.ts";
import type { KernelHello } from "./protocol.ts";

export type KernelInfo = KernelHello;

export type KernelMismatch = {
  reason: "julia-mismatch" | "protocol-mismatch" | "malformed";
  expectedJulia: string;
  actualJulia: string;
  expectedProtocol: number;
  actualProtocol: number | null;
  image: string;
  imageDigest?: string;
  message: string;
};

export type KernelProbeResult =
  | { status: "ready"; info: KernelInfo }
  | { status: "mismatch"; mismatch: KernelMismatch }
  | { status: "unavailable"; error: string };

/** What to tell the user when the kernel never answered, from the error the launcher or client reported. */
export function kernelUnavailableMessage(error: string): string {
  if (/timed out/.test(error))
    return "kernel unavailable · no answer yet. On first start the kernel image (about 1.5 GB) is still downloading; wait a minute and run again. If it keeps failing, check the terminal running Squero Studio MX.";
  if (/closed|exited|failed/.test(error))
    return `kernel unavailable · the kernel stopped (${error}). Check that Podman or Docker works (podman info) and see the terminal running Squero Studio MX for the cause.`;
  return `kernel unavailable · ${error || "no reply from the launcher"}`;
}

export function parseJuliaVersion(text: unknown): { major: number; minor: number; patch: number } | null {
  if (typeof text !== "string") return null;
  const match = /^\s*v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?\s*$/.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) };
}

export function validateKernelHello(
  raw: unknown,
  expectedJulia = JULIA_VERSION,
  expectedProtocol = KERNEL_PROTOCOL_VERSION,
): { ok: true; info: KernelInfo } | { ok: false; mismatch: KernelMismatch } {
  const rec = (raw && typeof raw === "object" ? raw : {}) as Partial<KernelHello>;
  const actualJulia = typeof rec.julia === "string" ? rec.julia : "";
  const actualProtocol = typeof rec.protocol === "number" && Number.isFinite(rec.protocol) ? rec.protocol : null;
  const image = typeof rec.image === "string" && rec.image ? rec.image : `${KERNEL_IMAGE}:${KERNEL_VERSION}`;
  const imageDigest = typeof rec.image_digest === "string" && rec.image_digest ? rec.image_digest : undefined;
  const expectedParsed = parseJuliaVersion(expectedJulia)!;

  if (rec.op !== "hello") {
    return {
      ok: false,
      mismatch: {
        reason: "malformed",
        expectedJulia,
        actualJulia,
        expectedProtocol,
        actualProtocol,
        image,
        imageDigest,
        message: `kernel handshake failed: malformed hello reply from ${image}`,
      },
    };
  }

  if (actualProtocol === null || actualProtocol !== expectedProtocol) {
    return {
      ok: false,
      mismatch: {
        reason: "protocol-mismatch",
        expectedJulia,
        actualJulia: actualJulia || "unknown",
        expectedProtocol,
        actualProtocol,
        image,
        imageDigest,
        message: `kernel protocol mismatch: expected squero-kernel/${expectedProtocol}, got ${actualProtocol === null ? "missing" : `squero-kernel/${actualProtocol}`} (${image}). Restart with ${KERNEL_IMAGE}:${KERNEL_VERSION}.`,
      },
    };
  }

  const parsed = parseJuliaVersion(actualJulia);
  if (!parsed) {
    return {
      ok: false,
      mismatch: {
        reason: "malformed",
        expectedJulia,
        actualJulia: actualJulia || "missing",
        expectedProtocol,
        actualProtocol,
        image,
        imageDigest,
        message: `kernel handshake failed: invalid Julia version "${actualJulia}" from ${image}`,
      },
    };
  }

  if (parsed.major !== expectedParsed.major || parsed.minor !== expectedParsed.minor) {
    const mm = `${expectedParsed.major}.${expectedParsed.minor}`;
    return {
      ok: false,
      mismatch: {
        reason: "julia-mismatch",
        expectedJulia,
        actualJulia,
        expectedProtocol,
        actualProtocol,
        image,
        imageDigest,
        message: `Julia version mismatch: MX expects Julia ${mm}.x (${expectedJulia}), kernel ${image} runs Julia ${actualJulia}. Start ${KERNEL_IMAGE}:${KERNEL_VERSION} or run \`juliaup add ${mm}\`.`,
      },
    };
  }

  return { ok: true, info: rec as KernelInfo };
}

let pending: Promise<KernelProbeResult> | null = null;

async function hello(timeout: number): Promise<KernelProbeResult> {
  const reply = await kernel.request({ op: "hello" }, timeout);
  if (!reply.ok) return { status: "unavailable", error: String(reply.error ?? "") };
  const check = validateKernelHello(reply);
  return check.ok ? { status: "ready", info: check.info } : { status: "mismatch", mismatch: check.mismatch };
}

export function probeKernelHandshake(timeout = 15000): Promise<KernelProbeResult> {
  if (!pending) {
    pending = hello(timeout).finally(() => { pending = null; });
  }
  return pending;
}

export async function probeKernel(timeout = 15000): Promise<KernelInfo | null> {
  const res = await probeKernelHandshake(timeout);
  return res.status === "ready" ? res.info : null;
}
