// A squero-kernel/0 hello over the shared client. It proves the kernel is there and gives the
// UI the real Julia and image versions; eval uses the same socket, so the probe starts nothing
// that a run would start again. Concurrent probes share one hello.
import { kernel } from "./client.ts";
import type { KernelHello } from "./protocol.ts";

export type KernelInfo = KernelHello;

let pending: Promise<KernelInfo | null> | null = null;

async function hello(timeout: number): Promise<KernelInfo | null> {
  const reply = await kernel.request({ op: "hello" }, timeout);
  if (!reply.ok) return null;
  const info = reply as unknown as KernelHello;
  return info.op === "hello" ? info : null;
}

export function probeKernel(timeout = 15000): Promise<KernelInfo | null> {
  if (!pending) {
    pending = hello(timeout).finally(() => { pending = null; });
  }
  return pending;
}
