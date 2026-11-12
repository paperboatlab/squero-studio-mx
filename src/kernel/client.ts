// The squero-kernel/0 client: one WebSocket for the session, requests matched by id. The
// launcher owns the process; nothing here evaluates Julia itself.
import type { KernelReply } from "./protocol.ts";

const url = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__mx/kernel`;

type Waiter = { resolve: (reply: KernelReply) => void };

class KernelClient {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private seq = 0;
  private waiting = new Map<string, Waiter>();

  private open(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url());
      socket.onopen = () => {
        this.socket = socket;
        this.opening = null;
        resolve(socket);
      };
      socket.onerror = () => {
        this.opening = null;
        reject(new Error("kernel: connection failed"));
      };
      socket.onclose = () => {
        this.socket = null;
        for (const waiter of this.waiting.values()) waiter.resolve({ ok: false, error: "kernel: closed" });
        this.waiting.clear();
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let reply: KernelReply;
        try { reply = JSON.parse(event.data) as KernelReply; } catch { return; }
        if (!reply.id) return;
        const waiter = this.waiting.get(reply.id);
        if (!waiter) return;
        this.waiting.delete(reply.id);
        waiter.resolve(reply);
      };
    });
    return this.opening;
  }

  async request(message: Record<string, unknown>, timeout = 120000): Promise<KernelReply> {
    let socket: WebSocket;
    try {
      socket = await this.open();
    } catch (error) {
      return { ok: false, error: String((error as Error).message ?? error) };
    }
    const id = `mx-${++this.seq}`;
    return new Promise<KernelReply>((resolve) => {
      const timer = window.setTimeout(() => {
        this.waiting.delete(id);
        resolve({ ok: false, error: "kernel: timed out" });
      }, timeout);
      this.waiting.set(id, {
        resolve: (reply) => { window.clearTimeout(timer); resolve(reply); },
      });
      socket.send(JSON.stringify({ ...message, id }));
    });
  }
}

export const kernel = new KernelClient();
export const evalCode = (code: string) => kernel.request({ op: "eval", code });
export const whois = () => kernel.request({ op: "whos" });
export const resetKernel = () => kernel.request({ op: "reset" });
