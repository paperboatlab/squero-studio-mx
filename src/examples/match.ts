export type ShippedExample = {
  index: number;
  id: string;
  path: string;
  name: string;
  title: string;
  content: string;
};

function normalizeExamplePath(rawKey: string): string {
  const normalized = rawKey.replace(/\\/g, "/");
  const marker = "examples/";
  const at = normalized.lastIndexOf(marker);
  return at >= 0 ? normalized.slice(at + marker.length) : normalized.replace(/^\.?\//, "");
}

function extractTitle(path: string, content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const trimmed = firstLine.replace(/^#\s*/, "").trim();
  const dash = trimmed.indexOf("—");
  if (dash >= 0) return trimmed.slice(dash + 1).trim().replace(/\.$/, "");
  const hyphen = trimmed.indexOf(" - ");
  if (hyphen >= 0) return trimmed.slice(hyphen + 3).trim().replace(/\.$/, "");
  return trimmed || path.replace(/\.jl$/i, "");
}

function stripNumericPrefix(stem: string): string {
  return stem.replace(/^\d+[-_]/, "");
}

/** Build the sorted, 1-indexed catalog of shipped tutorial examples from raw script contents. */
export function buildExamplesCatalog(rawFiles: Readonly<Record<string, string>>): ShippedExample[] {
  const entries = Object.entries(rawFiles)
    .map(([key, content]) => ({ path: normalizeExamplePath(key), content }))
    .filter((item) => item.path.endsWith(".jl"))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));

  return entries.map((item, i) => {
    const name = item.path.slice(item.path.lastIndexOf("/") + 1);
    return {
      index: i + 1,
      id: item.path,
      path: item.path,
      name,
      title: extractTitle(item.path, item.content),
      content: item.content,
    };
  });
}

/** Resolve a shipped example by 1-based index, numeric string, filename, stem, slug, or unique prefix. */
export function resolveExample(
  examples: readonly ShippedExample[],
  ref: { index?: number; name?: string },
): ShippedExample | null {
  if (typeof ref.index === "number" && Number.isFinite(ref.index)) {
    return examples.find((one) => one.index === ref.index) ?? null;
  }
  const rawName = ref.name?.trim();
  if (!rawName) return null;

  const query = rawName.toLowerCase().replace(/^examples\//, "").replace(/\.jl$/i, "");
  if (/^\d+$/.test(query)) {
    const index = Number(query);
    return examples.find((one) => one.index === index) ?? null;
  }

  const stemOf = (one: ShippedExample) => one.path.replace(/\.jl$/i, "").toLowerCase();
  const baseStemOf = (one: ShippedExample) => one.name.replace(/\.jl$/i, "").toLowerCase();
  const slugOf = (one: ShippedExample) => stripNumericPrefix(baseStemOf(one));

  return (
    examples.find((one) => stemOf(one) === query || baseStemOf(one) === query) ??
    examples.find((one) => slugOf(one) === query) ??
    uniqueMatch(examples.filter((one) => stemOf(one).startsWith(query) || baseStemOf(one).startsWith(query))) ??
    uniqueMatch(examples.filter((one) => slugOf(one).startsWith(query)))
  );
}

function uniqueMatch<T>(hits: readonly T[]): T | null {
  return hits.length === 1 ? hits[0] : null;
}
