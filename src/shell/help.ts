// MX's side of the shared Help window: its manual and Paperboat's (paperboatlab.github.io), and
// every Julia name the kernel knows, whose docstrings the kernel renders (`doc`). Nothing here
// parses Julia.
import { combineHelp, docsHelp, DOCS_URL, loadDocs, type HelpItem, type HelpPage, type HelpProvider } from "@paperboat/shared";
import { docNames, docOf } from "../kernel/client.ts";

/** The org's docs site; VITE_DOCS_URL points Help at another build (a local one, to try docs out). */
const DOCS: string = import.meta.env?.VITE_DOCS_URL ?? DOCS_URL;
/** MX's manual and the engine's, fetched on Help's first look. */
const mxDocs = () => docsHelp(() => loadDocs((s) => s.site === "apps/squero-studio-mx" || s.site === "paperboat", DOCS), DOCS);

const JULIA = "julia:";
const LIMIT = 200;

/** The Help provider: the manuals, then Julia names (a prefix match before a match inside). */
export function mxHelp(kernelReady: () => boolean, docs: HelpProvider = mxDocs()): HelpProvider {
  return combineHelp(docs, juliaHelp(kernelReady));
}

function juliaHelp(kernelReady: () => boolean): HelpProvider {
  let names: Promise<{ name: string; module: string }[]> | null = null;
  const loadNames = () => {
    if (!kernelReady()) return Promise.resolve([]);
    names ??= docNames().then((r) => (r.ok && Array.isArray(r.value) ? (r.value as { name: string; module: string }[]) : []));
    return names;
  };
  return {
    async items(query) {
      if (!query) return [];
      const q = query.toLowerCase();
      const all = await loadNames();
      const hits = all.filter((n) => n.name.toLowerCase().includes(q));
      hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.length - b.name.length);
      const items: HelpItem[] = hits.slice(0, LIMIT).map((n) => ({ id: JULIA + n.name, title: n.name, kind: n.module }));
      // A name the list doesn't have (a qualified one, a package's) can still be looked up.
      if (/^[\p{L}_][\p{L}\p{N}_!.]*$/u.test(query) && !hits.some((n) => n.name === query)) items.unshift({ id: JULIA + query, title: query, kind: "look up" });
      return items;
    },
    async page(id): Promise<HelpPage | null> {
      if (!id.startsWith(JULIA)) return null;
      const name = id.slice(JULIA.length);
      if (!kernelReady()) return { title: name, kind: "julia", text: "Julia docs come from the kernel: start it (the julia chip in the top bar) and look again." };
      const reply = await docOf(name);
      if (!reply.ok) return { title: name, kind: "julia", text: reply.error ?? "no docs" };
      return reply.value ? { title: name, kind: "julia", html: String(reply.value) } : null;
    },
  };
}

/** The word F1 looks up: the selection, or the name around the caret. */
export function wordAtCaret(): string {
  const sel = window.getSelection();
  const picked = sel?.toString().trim() ?? "";
  if (picked) return picked.split("\n")[0].slice(0, 80);
  const node = sel?.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return "";
  const text = node.textContent ?? "";
  const at = sel?.anchorOffset ?? 0;
  const word = /[\p{L}\p{N}_!.]/u;
  let a = at, b = at;
  while (a > 0 && word.test(text[a - 1])) a--;
  while (b < text.length && word.test(text[b])) b++;
  return text.slice(a, b).replace(/^\.+|\.+$/g, "");
}
