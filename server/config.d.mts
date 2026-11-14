import type { IncomingMessage, ServerResponse } from "node:http";
export declare const CONFIG_FILE: string;
export declare function configMiddleware(file?: string): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
