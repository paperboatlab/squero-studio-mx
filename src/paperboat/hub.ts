// Every running Paperboat backend at once. MX broadcasts the whole workspace to each of them;
// there is no URL to pick and no "shared" page. A link is written only after its own
// variables.load, so an MX broadcast can never overwrite a backend before it has spoken.
import type { ClientMsg, Variable } from "@paperboat/shared/protocol";
import { PaperboatLink, type LinkStatus } from "./link.ts";

export class PaperboatHub {
  private links = new Map<string, PaperboatLink>();
  onStatus?: (status: LinkStatus, detail?: string) => void;
  onVariables?: (variables: Variable[], loaded: boolean) => void;

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

  /** Connect new backends, drop ones that are gone, and leave the rest alone. */
  sync(urls: string[]): void {
    const wanted = new Set(urls);
    for (const [url, link] of this.links) {
      // A backend that restarted, or a socket that failed, gets a fresh link on the next poll.
      if (wanted.has(url) && link.status !== "failed" && link.status !== "idle") continue;
      link.close();
      this.links.delete(url);
    }
    for (const url of urls) {
      if (this.links.has(url)) continue;
      const link = new PaperboatLink();
      link.onStatus = () => this.emitStatus();
      link.onVariables = () => this.emitVariables();
      this.links.set(url, link);
      link.connect(url);
    }
    this.emitStatus();
  }

  /** Broadcast to every loaded backend; returns how many accepted the message. */
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
  }

  private emitStatus() {
    this.onStatus?.(this.status);
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
