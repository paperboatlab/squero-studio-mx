// A client for a Paperboat backend (`paperboat/0`). Shares workspace variables, reads
// capabilities (`hello`, `catalog`), and streams `graph.run` execution (`run.*`, `signal`s).
import type { ClientMsg, ServerMsg, Variable } from "@paperboat/shared/protocol";
import type { SignalSample } from "../sim/stateSpace.ts";

export type LinkStatus = "idle" | "connecting" | "attached" | "failed";

export type PaperboatRunEvent =
  | { type: "started"; run: string }
  | { type: "progress"; run: string; fraction: number }
  | { type: "finished"; run: string; status: "done" | "cancelled" | "failed"; samples: SignalSample[] }
  | { type: "log"; level: "info" | "warn" | "error"; text: string };

export class PaperboatLink {
  private socket: WebSocket | null = null;
  private loadTimer: number | null = null;
  status: LinkStatus = "idle";
  /** True once this backend has sent its current list, or a moment after the socket opens when
   *  it has no default variables at all. Only then is it safe to write. */
  loaded = false;
  variables: Variable[] = [];
  solvers: string[] = [];
  catalogTypes = new Set<string>();
  engine = "";
  defaultDt = 0.01;
  defaultDuration = 10;
  private activeSamples: SignalSample[] = [];
  onStatus?: (status: LinkStatus, detail?: string) => void;
  onVariables?: (variables: Variable[]) => void;
  onCapabilities?: () => void;
  onRunEvent?: (event: PaperboatRunEvent) => void;

  connect(url: string): void {
    this.close();
    this.setStatus("connecting");
    try {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => {
        this.setStatus("attached");
        // A backend with no default variables sends no variables.load. Give it a beat to
        // speak, then treat the empty list as loaded so the workspace can be broadcast.
        this.loadTimer = window.setTimeout(() => {
          if (this.socket !== socket || this.loaded) return;
          this.loaded = true;
          this.onVariables?.(this.variables);
        }, 400);
      };
      socket.onerror = () => this.setStatus("failed", "the backend did not answer");
      socket.onclose = () => {
        if (this.loadTimer !== null) window.clearTimeout(this.loadTimer);
        this.loadTimer = null;
        this.loaded = false;
        this.setStatus("idle");
      };
      socket.onmessage = (event) => {
        let msg: ServerMsg;
        try { msg = JSON.parse(String(event.data)) as ServerMsg; } catch { return; }
        if (msg.type === "hello") {
          this.engine = msg.engine ?? "";
          if (msg.run?.solvers?.length) this.solvers = [...msg.run.solvers];
          if (typeof msg.run?.dt === "number") this.defaultDt = msg.run.dt;
          if (typeof msg.run?.duration === "number") this.defaultDuration = msg.run.duration;
          this.onCapabilities?.();
          return;
        }
        if (msg.type === "catalog") {
          this.catalogTypes = new Set((msg.blocks ?? []).map((b) => b.type));
          this.onCapabilities?.();
          return;
        }
        if (msg.type === "variables.load" || msg.type === "variables.patch") {
          if (msg.type === "variables.load") {
            this.variables = msg.variables;
            this.loaded = true;
            if (this.loadTimer !== null) window.clearTimeout(this.loadTimer);
            this.loadTimer = null;
          } else {
            const byName = new Map(this.variables.map((v) => [v.name, v]));
            for (const [name, value] of Object.entries(msg.values)) {
              const old = byName.get(name);
              if (old) byName.set(name, { ...old, value });
            }
            this.variables = [...byName.values()];
          }
          this.onVariables?.(this.variables);
          return;
        }
        if (msg.type === "run.started") {
          this.activeSamples = [];
          this.onRunEvent?.({ type: "started", run: msg.run });
          return;
        }
        if (msg.type === "run.progress") {
          this.onRunEvent?.({ type: "progress", run: msg.run, fraction: msg.fraction });
          return;
        }
        if (msg.type === "signal") {
          this.activeSamples.push({ node: msg.node, t: msg.t, v: msg.v });
          return;
        }
        if (msg.type === "signals") {
          for (const one of msg.list) this.activeSamples.push({ node: one.node, t: one.t, v: one.v });
          return;
        }
        if (msg.type === "log") {
          this.onRunEvent?.({ type: "log", level: msg.level, text: msg.text });
          return;
        }
        if (msg.type === "run.finished") {
          const samples = this.activeSamples;
          this.activeSamples = [];
          this.onRunEvent?.({ type: "finished", run: msg.run, status: msg.status, samples });
        }
      };
    } catch (error) {
      this.setStatus("failed", error instanceof Error ? error.message : String(error));
    }
  }

  supportsGraph(msg: Extract<ClientMsg, { type: "graph.run" }>): boolean {
    if (this.catalogTypes.size === 0) return true;
    return msg.graph.nodes.every((n) => this.catalogTypes.has(n.type));
  }

  send(msg: ClientMsg): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    if (this.loadTimer !== null) window.clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.loaded = false;
    this.socket?.close();
    this.socket = null;
  }

  private setStatus(status: LinkStatus, detail?: string) {
    this.status = status;
    this.onStatus?.(status, detail);
  }
}
