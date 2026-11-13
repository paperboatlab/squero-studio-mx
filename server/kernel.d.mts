import type { Server } from "node:http";
import type { Http2SecureServer } from "node:http2";
export declare const KERNEL_IMAGE: string;
export declare const KERNEL_PROTOCOL: number;
export declare function kernelRuntime(): string;
export declare function kernelCommand(options?: { workspace?: string; image?: string; runtime?: string }): { cmd: string; args: string[]; runtime: string; env?: Record<string, string> };
export declare function attachKernel(server: Server | Http2SecureServer, options: { workspace?: string; image?: string; path?: string }): { close(): void };
