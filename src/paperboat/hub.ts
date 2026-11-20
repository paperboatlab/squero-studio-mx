// Every running Paperboat station at once. MX broadcasts the whole workspace to each of them;
// there is no URL to pick and no "shared" page. A link is written only after its own
// variables.load, so an MX broadcast can never overwrite a station before it has spoken.
import type { ClientMsg, Variable } from "@paperboat/shared/protocol";
import { PaperboatLink, type LinkStatus, type PaperboatRunEvent } from "./link.ts";

export type HubCapabilities = {
  solvers: string[];
  hasStateSpace: boolean;
  hasRhs: boolean;
  hasGraph: boolean;
  defaultDt: number;
  defaultDuration: number;
};

export class PaperboatHub {
  private links = new Map<string, PaperboatLink>();
  onStatus?: (status: LinkStatus, detail?: string) => void;
  onVariables?: (variables: Variable[], loaded: boolean) => void;
  onCapabilities?: (caps: HubCapabilities) => void;
  onRunEvent?: (url: string, event: PaperboatRunEvent) => void;

  get urls(): string[] {
    return [...this.links.keys()].sort();
  }

  get attached(): string[] {
    return [...this.links.entries()].filter(([, link]) => link.status === "attached").map(([url]) => url);
  }

  get loaded(): number {
    return [...this.links.values()].filter((link) => link.loaded).length;
  }

  get status(): LinkStatus {
    const states = [...this.links.values()].map((link) => link.status);
    if (states.includes("attached")) return "attached";
    if (states.includes("connecting")) return "connecting";
    if (states.includes("failed")) return "failed";
    return "idle";
  }

  capabilities(): HubCapabilities {
    const attached = [...this.links.values()].filter((l) => l.status === "attached");
    const solvers = [...new Set(attached.flatMap((l) => l.solvers))];
    const hasStateSpace = attached.some((l) => l.catalogTypes.has("state_space"));
    const hasRhs = attached.some((l) => l.catalogTypes.has("rhs"));
    const hasGraph = attached.some((l) => l.catalogTypes.has("graph"));
    const first = attached[0];
    return {
      solvers,
      hasStateSpace,
      hasRhs,
      hasGraph,
      defaultDt: first?.defaultDt ?? 0.01,
      defaultDuration: first?.defaultDuration ?? 10,
    };
  }

  /** Connect new stations, drop ones that are gone, and leave the rest alone. */
  sync(urls: string[]): void {
    const wanted = new Set(urls);
    for (const [url, link] of this.links) {
      // A station that restarted, or a socket that failed, gets a fresh link on the next poll.
      if (wanted.has(url) && link.status !== "failed" && link.status !== "idle") continue;
      link.close();
      this.links.delete(url);
    }
    for (const url of urls) {
      if (this.links.has(url)) continue;
      const link = new PaperboatLink();
      link.onStatus = () => { this.emitStatus(); this.emitCapabilities(); };
      link.onVariables = () => this.emitVariables();
      link.onCapabilities = () => this.emitCapabilities();
      link.onRunEvent = (event) => this.onRunEvent?.(url, event);
      this.links.set(url, link);
      link.connect(url);
    }
    this.emitStatus();
    this.emitCapabilities();
  }

  /** Send a `graph.run` to the first attached station that supports its blocks (or all if unknown). */
  runGraph(msg: Extract<ClientMsg, { type: "graph.run" }>): string | null {
    const attached = [...this.links.entries()].filter(([, l]) => l.status === "attached");
    const match = attached.find(([, l]) => l.supportsGraph(msg)) ?? attached[0];
    if (!match) return null;
    return match[1].send(msg) ? match[0] : null;
  }

  cancelRun(): number {
    return this.send({ type: "run.cancel" });
  }

  /** Broadcast to every loaded station; returns how many accepted the message. */
  send(msg: ClientMsg): number {
    let count = 0;
    for (const link of this.links.values()) {
      if (link.loaded && link.send(msg)) count++;
    }
    return count;
  }

  close(): void {
    for (const link of this.links.values()) link.close();
    this.links.clear();
    this.emitStatus();
    this.emitVariables();
    this.emitCapabilities();
  }

  private emitStatus() {
    this.onStatus?.(this.status);
  }

  private emitCapabilities() {
    this.onCapabilities?.(this.capabilities());
  }

  private emitVariables() {
    const byName = new Map<string, Variable>();
    for (const url of this.urls) {
      const link = this.links.get(url);
      if (!link?.loaded) continue;
      for (const variable of link.variables) byName.set(variable.name, variable);
    }
    this.onVariables?.([...byName.values()], this.loaded > 0);
  }
}
