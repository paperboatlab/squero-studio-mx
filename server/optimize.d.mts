import type { IncomingMessage, ServerResponse } from "node:http";
export declare function paperboatBinary(): string;
export declare function optimizeMiddleware(): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;
