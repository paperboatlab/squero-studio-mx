export declare function registrySearch(query: string, limit?: number): Promise<{ source: string; total: number; results: { name: string; uuid: string; path: string }[] }>;
export declare function registryPackage(name: string): Promise<{ name: string; uuid: string; repo: string; latest: string; versionCount: number; versions: string[]; deps: string[]; github: Record<string, unknown> | null }>;
