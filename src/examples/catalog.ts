import { buildExamplesCatalog, resolveExample, type ShippedExample } from "./match.ts";

const rawExamples = import.meta.glob("../../examples/**/*.jl", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const SHIPPED_EXAMPLES: readonly ShippedExample[] = buildExamplesCatalog(rawExamples);

export function findShippedExample(ref: { index?: number; name?: string }): ShippedExample | null {
  return resolveExample(SHIPPED_EXAMPLES, ref);
}

export type { ShippedExample };
