// Versions shown in About, the console banner, and the launcher.
// Releases follow frontend semver (keep in step with package.json); Julia and the kernel
// image are tracked separately and verified on attach.
export const FRONTEND_VERSION = "0.1.0-alpha.10";
export const JULIA_VERSION = "1.11.6";
export const KERNEL_IMAGE = "squero-julia-kernel";
export const KERNEL_REGISTRY = "ghcr.io/paperboatlab/squero-julia-kernel";
export const KERNEL_VERSION = "1.11.6-r3";
export const KERNEL_DIGEST = "";
export const KERNEL_PROTOCOL = "squero-kernel/0";
export const KERNEL_PROTOCOL_VERSION = 0;
export const PAPERBOAT_PROTOCOL = "paperboat/0";

export function kernelImageRef(digest = KERNEL_DIGEST): string {
  return digest ? `${KERNEL_REGISTRY}@${digest}` : `${KERNEL_REGISTRY}:${KERNEL_VERSION}`;
}

export function formatKernelImage(image?: string, digest?: string): string {
  const base = image || `${KERNEL_IMAGE}:${KERNEL_VERSION}`;
  if (!digest || base.includes("@sha256:")) return base;
  const short = digest.startsWith("sha256:") ? `sha256:${digest.slice(7, 19)}` : digest.slice(0, 12);
  return `${base} (${short})`;
}
