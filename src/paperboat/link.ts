// A minimal client for a Paperboat backend (`paperboat/0`). The scaffold uses it to show the
// shared-variable contract; a run/state-space client grows from the same socket.
import type { ClientMsg, ServerMsg, Variable } from "@paperboat/shared/protocol";

export type LinkStatus = "idle" | "connecting" | "attached" | "failed";

export class PaperboatLink {
  private socket: WebSocket | null = null;
  status: LinkStatus = "idle";
  /** True once this backend has sent its current variable list; only then is it safe to write. */
  loaded = false;
  variables: Variable[] = [];
  onStatus?: (status: LinkStatus, detail?: string) => void;
  onVariables?: (variables: Variable[]) => void;

  connect(url: string): void {
    this.close();
    this.setStatus("connecting");
    try {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => this.setStatus("attached");
      socket.onerror = () => this.setStatus("failed", "the backend did not answer");
      socket.onclose = () => this.setStatus("idle");
      socket.onmessage = (event) => {
        let msg: ServerMsg;
        try { msg = JSON.parse(String(event.data)) as ServerMsg; } catch { return; }
        if (msg.type === "variables.load" || msg.type === "variables.patch") {
          // `variables.load` carries the full list; a patch carries only the changed values.
          if (msg.type === "variables.load") {
            this.variables = msg.variables;
            this.loaded = true;
          } else {
            const byName = new Map(this.variables.map((v) => [v.name, v]));
            for (const [name, value] of Object.entries(msg.values)) {
              const old = byName.get(name);
              if (old) byName.set(name, { ...old, value });
            }
            this.variables = [...byName.values()];
          }
          this.onVariables?.(this.variables);
        }
      };
    } catch (error) {
      this.setStatus("failed", error instanceof Error ? error.message : String(error));
    }
  }

  send(msg: ClientMsg): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private setStatus(status: LinkStatus, detail?: string) {
    this.status = status;
    this.onStatus?.(status, detail);
  }
}
