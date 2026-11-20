import type { IncomingMessage, ServerResponse } from "node:http";
export declare function listStations(): Promise<{ ok: boolean; error: string; stations: { name: string; engine: string; port: number; ws: string }[] }>;
export declare function stationsMiddleware(): (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
