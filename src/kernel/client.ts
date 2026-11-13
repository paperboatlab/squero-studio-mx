// The squero-kernel/0 client: one WebSocket for the session, requests matched by id. The
// launcher owns the process; nothing here evaluates Julia itself.
import type { FigureFormat, KernelReply, ViewAction, ViewState } from "./protocol.ts";
import { LIVE_LIMIT } from "../paperboat/variables.ts";

const url = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__mx/kernel`;

type Waiter = { resolve: (reply: KernelReply) => void };

class KernelClient {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private seq = 0;
  private waiting = new Map<string, Waiter>();
  /** A `get` header waiting for its binary frame (the bridge sends the two back to back). */
  private header: KernelReply | null = null;

  private open(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;
    this.opening = new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url());
      socket.binaryType = "arraybuffer";
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
        if (typeof event.data !== "string") {
          const header = this.header;
          this.header = null;
          if (header?.artifact) this.settle({ ...header, bytes: new Uint8Array(event.data as ArrayBuffer) });
          else if (header) this.settle({ ...header, data: new Float64Array(event.data as ArrayBuffer) });
          return;
        }
        let reply: KernelReply;
        try { reply = JSON.parse(event.data) as KernelReply; } catch { return; }
        if (reply.array?.bytes || reply.artifact?.bytes) this.header = reply;
        else this.settle(reply);
      };
    });
    return this.opening;
  }

  private settle(reply: KernelReply) {
    if (!reply.id) return;
    const waiter = this.waiting.get(reply.id);
    if (!waiter) return;
    this.waiting.delete(reply.id);
    waiter.resolve(reply);
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
/** One stored artifact of a figure version, as bytes (a binary frame, never base64). */
export const figureArtifact = (figure: string, version: string, format: FigureFormat, preview = false) =>
  kernel.request({ op: preview ? "figure.get" : "figure.export", figure, version, format });
/** An export drawn again at a size (and, with `view`, the stage's pan/zoom), from the version's own figure. */
export const figureExportSized = (figure: string, version: string, format: FigureFormat, width: number, height: number, view: boolean, viewState?: ViewState) =>
  kernel.request({ op: "figure.export", figure, version, format, width, height, view, ...(view && viewState ? { view_state: viewState } : {}), px_per_unit: 2 });
/** The stage: a version drawn at the panel's size (PNG at the screen's pixel ratio), with its axes. */
export const renderFigure = (figure: string, version: string, width: number, height: number, pxPerUnit: number) =>
  kernel.request({ op: "figure.render", figure, version, width, height, format: "png", px_per_unit: pxPerUnit });
/** Pan, zoom, rotate or reset the stage's view of a version, and draw it. */
export const interactFigure = (figure: string, version: string, width: number, height: number, pxPerUnit: number, action: ViewAction) =>
  kernel.request({ op: "figure.interact", figure, version, width, height, format: "png", px_per_unit: pxPerUnit, ...action });
/** Draw a solved 2-variable problem as a SqueroPlot surface with the optimum (a history entry). */
export const plotOptimum = (result: unknown, title: string) => kernel.request({ op: "plot.optimum", result, title });
export const figureScene = (figure: string, version?: string) => kernel.request({ op: "figure.scene", figure, version });


const countOf = (shape: string) => shape.split("×").reduce((n, part) => n * (Number(part.trim()) || 0), 1);

/**
 * `list` with each numeric array of at most LIVE_LIMIT values filled in from the kernel (`get`,
 * column-major Float64): a vector as its values, a matrix as rows. `whos` sends only a preview.
 */
export async function withArrays<T extends { name: string; type: string; shape: string; value?: unknown; runnable?: boolean }>(list: T[]): Promise<T[]> {
  return Promise.all(list.map(async (v) => {
    const vector = v.type.startsWith("Vector");
    if (!(vector || v.type.startsWith("Matrix")) || v.runnable === false || countOf(v.shape) > LIVE_LIMIT) return v;
    const reply = await kernel.request({ op: "get", name: v.name });
    const { array, data } = reply;
    if (!reply.ok || !array || !data) return v;
    if (vector) return { ...v, value: Array.from(data) };
    const rows = Array.from({ length: array.rows }, (_, r) => Array.from({ length: array.cols }, (_, c) => data[c * array.rows + r]));
    return { ...v, value: rows };
  }));
}
