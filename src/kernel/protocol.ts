// The kernel contract (`squero-kernel/0`). The launcher starts a pinned Julia container (or a
// native julia) and bridges these messages; the UI never links a Julia runtime.
//
// JSON line header + an optional binary frame for arrays:
//   { "rows": 512, "cols": 512, "dtype": "f64", "order": "col", "bytes": 2097152 }\n<raw>
export type KernelRequest =
  | { op: "hello" }
  | { op: "eval"; id: string; code: string }
  | { op: "whos" }
  | { op: "get"; id: string; name: string }
  | { op: "set"; id: string; name: string; rows: number; cols: number }
  | { op: "snapshot"; id: string; line: number }
  | { op: "chart"; id: string }
  | { op: "reset" }
  | { op: "shutdown" };

export type KernelHello = {
  op: "hello";
  julia: string;
  image: string;
  protocol: number;
  packages: string[];
};

export type KernelReply = {
  id?: string;
  ok: boolean;
  error?: string;
  stdout?: string;
  value?: unknown;
  /** A matrix's header comes before its binary frame; vectors use rows = 1. */
  array?: { rows: number; cols: number; dtype: "f64"; order: "col"; bytes: number };
};

/** The launcher/kernel versions the About window and the handshake show. */
export type KernelVersions = {
  julia: string;
  frontend: string;
  image: string;
  protocol: number;
};
