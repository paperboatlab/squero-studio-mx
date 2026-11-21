// The squero-kernel/0 client: one WebSocket for the session, requests matched by id. The
// launcher owns the process; nothing here evaluates Julia itself.
import type { BreakpointSpec, FigureFormat, KernelEventMessage, KernelReply, ViewAction, ViewState } from "./protocol.ts";
import { LIVE_LIMIT } from "../paperboat/variables.ts";

const url = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/__mx/kernel`;

type Waiter = { resolve: (reply: KernelReply) => void };

class KernelClient {
  private socket: WebSocket | null = null;
  private opening: Promise<WebSocket> | null = null;
  private seq = 0;
  private waiting = new Map<string, Waiter>();
  private eventListeners = new Set<(event: KernelEventMessage) => void>();
  /** A `get` header waiting for its binary frame (the bridge sends the two back to back). */
  private header: KernelReply | null = null;

  onEvent(listener: (event: KernelEventMessage) => void): () => void {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  }

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
      socket.onclose = (event) => {
        this.socket = null;
        // the launcher's close reason says why (no runtime, workspace not mountable, ...)
        const error = event.reason ? `kernel: ${event.reason}` : "kernel: closed";
        for (const waiter of this.waiting.values()) waiter.resolve({ ok: false, error });
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
        let parsed: KernelReply | KernelEventMessage;
        try { parsed = JSON.parse(event.data) as KernelReply | KernelEventMessage; } catch { return; }
        if ("event" in parsed && typeof parsed.event === "string") {
          for (const fn of this.eventListeners) fn(parsed);
          return;
        }
        const reply = parsed as KernelReply;
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

  /** Stop the running eval (SIGINT through the launcher); it replies with an InterruptException. */
  interrupt() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ op: "interrupt" }));
  }

  /** `timeout` 0: wait as long as it takes (a run; Cancel stops it). `frame`: binary bytes right after the line (`set`). */
  async request(message: Record<string, unknown>, timeout = 120000, frame?: ArrayBuffer): Promise<KernelReply> {
    let socket: WebSocket;
    try {
      socket = await this.open();
    } catch (error) {
      return { ok: false, error: String((error as Error).message ?? error) };
    }
    const id = `mx-${++this.seq}`;
    return new Promise<KernelReply>((resolve) => {
      const timer = timeout > 0 ? window.setTimeout(() => {
        this.waiting.delete(id);
        resolve({ ok: false, error: "kernel: timed out" });
      }, timeout) : undefined;
      this.waiting.set(id, {
        resolve: (reply) => { window.clearTimeout(timer); resolve(reply); },
      });
      socket.send(JSON.stringify({ ...message, id }));
      if (frame) socket.send(frame);
    });
  }
}

export const kernel = new KernelClient();
export const evalCode = (code: string, file?: string, files?: Record<string, string>) =>
  kernel.request({ op: "eval", code, ...(file ? { file } : {}), ...(files ? { files } : {}) }, 0);
/** A name's docstring as HTML (null: none). */
export const docOf = (name: string) => kernel.request({ op: "doc", name });
/** Every name the Help window can look up. */
export const docNames = () => kernel.request({ op: "doc.names" });
/** Put a numeric array into the session: column-major Float64; `vector` keeps a Vector a Vector. */
export const setArray = (name: string, rows: number, cols: number, columnMajor: ArrayLike<number>, vector?: boolean) => {
  const data = Float64Array.from(columnMajor);
  return kernel.request({ op: "set", name, rows, cols, bytes: data.byteLength, ...(vector === undefined ? {} : { vector }) }, 120000, data.buffer);
};
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

/** Sync breakpoints for a file to the Julia kernel (can run anytime, including while paused). */
export const setKernelBreakpoints = (file: string, breakpoints: BreakpointSpec[]) =>
  kernel.request({ op: "debug.breakpoints", file, breakpoints });
export const debugStart = (file: string, code: string, breakpoints: BreakpointSpec[], stopOnEntry = false, files?: Record<string, string>) =>
  kernel.request({ op: "debug.start", file, code, breakpoints, stopOnEntry, ...(files ? { files } : {}) });
export const debugContinue = () => kernel.request({ op: "debug.continue" });
export const debugStep = (kind: "over" | "into" | "out") => kernel.request({ op: "debug.step", kind });
export const debugPause = () => kernel.request({ op: "debug.pause" });
export const debugStop = () => kernel.request({ op: "debug.stop" });
export const debugLocals = (frameId: number) => kernel.request({ op: "debug.locals", frameId });
export const debugEval = (frameId: number, code: string) => kernel.request({ op: "debug.eval", frameId, code });


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
