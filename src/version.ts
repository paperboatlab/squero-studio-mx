// Versions shown in About, the console banner, and the launcher.
// The frontend version is package.json's, so a release bump cannot miss it; Julia and the kernel
// image are tracked separately and verified on attach.
import pkg from "../package.json" with { type: "json" };

export const FRONTEND_VERSION: string = pkg.version;
export const JULIA_VERSION = "1.11.6";
export const KERNEL_IMAGE = "squero-julia-kernel";
export const KERNEL_REGISTRY = "ghcr.io/paperboatlab/squero-julia-kernel";
export const KERNEL_VERSION = "1.11.6-r4";
export const KERNEL_DIGEST = "sha256:fa30028683f68e2954c6d43942498531b871e21e3aafa62810f41a14d2f892be";
export const KERNEL_PROTOCOL = "squero-kernel/0";
export const KERNEL_PROTOCOL_VERSION = 0;
export const PAPERBOAT_PROTOCOL = "paperboat/0";

export function kernelImageRef(digest = KERNEL_DIGEST): string {
  return digest ? `${KERNEL_REGISTRY}@${digest}` : `${KERNEL_REGISTRY}:${KERNEL_VERSION}`;
}

/**
 * An image as people read it: its name and tag, then a short digest. An image named by digest (the
 * pin, `registry@sha256:…`) reads as `registry:<tag> (sha256:0f2df9587124)` when it is the pin, its
 * name and short digest otherwise; a long digest never runs past a dialog.
 */
export function formatKernelImage(image?: string, digest?: string): string {
  let base = image || `${KERNEL_IMAGE}:${KERNEL_VERSION}`;
  const at = base.indexOf("@sha256:");
  if (at >= 0) {
    digest ||= base.slice(at + 1);
    base = base.slice(0, at) + (digest === KERNEL_DIGEST ? `:${KERNEL_VERSION}` : "");
  }
  if (!digest) return base;
  const short = digest.startsWith("sha256:") ? `sha256:${digest.slice(7, 19)}` : digest.slice(0, 12);
  return `${base} (${short})`;
}
