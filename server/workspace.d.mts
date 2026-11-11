import type { IncomingMessage, ServerResponse } from "node:http";
export declare const DEFAULT_WORKSPACE: string;
export declare function shortRoot(root: string): string;
export declare function workspaceMiddleware(root?: string): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;
