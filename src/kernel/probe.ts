// A one-shot squero-kernel/0 hello through the launcher bridge. It proves the container is there
// and gives the UI the real Julia and image versions; eval routing uses the same socket.
import type { KernelHello } from "./protocol.ts";

export type KernelInfo = KernelHello;

export function probeKernel(timeout = 15000): Promise<KernelInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: KernelInfo | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(value);
    };
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/__mx/kernel`);
    const timer = window.setTimeout(() => finish(null), timeout);
    socket.onopen = () => socket.send(JSON.stringify({ op: "hello" }));
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as KernelHello;
        if (message.op === "hello") finish(message);
      } catch { /* not a hello */ }
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}
