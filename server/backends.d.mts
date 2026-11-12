import type { IncomingMessage, ServerResponse } from "node:http";
export declare function listBackends(): Promise<{ ok: boolean; error: string; backends: { name: string; engine: string; port: number; ws: string }[] }>;
export declare function backendsMiddleware(): (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
