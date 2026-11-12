import type { IncomingMessage, ServerResponse } from "node:http";
export declare function parseJuliaupStatus(text: string): { channel: string; version: string; update: string; default: boolean }[];
export declare function parsePackages(text: string): { name: string; uuid: string; version: string }[];
export declare function juliaVersion(text: string): string;
export declare function validPackageName(name: string, add?: boolean): boolean;
export declare function juliaStatus(options: { workspace: string; runtime?: string; image?: string }): Promise<Record<string, unknown>>;
export declare function juliaMiddleware(options: { workspace: string; runtime?: string; image?: string }): (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;
