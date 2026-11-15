// MX's side of the shared Help window: a few guide pages and every Julia name the kernel knows,
// whose docstrings the kernel renders (`doc`). Nothing here parses Julia.
import { matches, type HelpItem, type HelpPage, type HelpProvider } from "@paperboat/shared";
import { docNames, docOf } from "../kernel/client.ts";
import { IMPORT_EXTENSIONS } from "../workspace/importData.ts";

const GUIDES: (HelpItem & { text: string })[] = [
  {
    id: "guide:start", title: "Getting started", kind: "guide", summary: "scripts, cells, the console and the workspace",
    text: `MX runs Julia scripts in a kernel and keeps what they define in the workspace on the right.

- \`Run\` runs the whole script; \`Ctrl+Enter\` runs the \`#%%\` cell at the cursor; \`Shift+Enter\` runs the line or the selection.
- The console is the kernel's REPL: type an expression and press Enter.
- Figures drawn with SqueroPlot (\`lines\`, \`surface\`, \`heatmap\`…) land in the figure pane and its history.
- Paperboat sees every workspace number, vector and matrix as a live variable while it's attached.`,
  },
  {
    id: "guide:console", title: "Console commands", kind: "guide", summary: "help, doc, openvar, whos, clear, clc…",
    text: `Anything else is Julia.

- \`help name\`, \`doc name\` or \`?name\` open this window on a name; \`F1\` looks up the selected word.
- \`openvar A\` opens a variable in the variable editor.
- \`whos\` lists the workspace; \`clear\` empties it, \`clear A\` drops one; \`clc\` clears the console.
- \`run\` runs the open script; \`attach\` and \`detach\` find or leave Paperboat backends; \`version\` prints the versions.`,
  },
  {
    id: "guide:variables", title: "Variable editor", kind: "guide", summary: "edit a vector or matrix as a grid",
    text: `Double-click a workspace card (or \`openvar A\`) to open it as a grid.

- Arrows move; type a number, press \`Enter\` or \`F2\` to edit; \`Enter\` and \`Tab\` commit and move on; \`Esc\` drops the edit.
- Paste a block copied from a spreadsheet: it lands at the selected cell and grows the array.
- \`+ row\`, \`+ column\`, \`− row\`, \`− column\` change the shape. Every change goes to the kernel at once.`,
  },
  {
    id: "guide:import", title: "Import data", kind: "guide", summary: IMPORT_EXTENSIONS.join(" "),
    text: `File › Import data… or drop a file on the workspace. A preview shows what will come in.

- \`.csv\` \`.tsv\` \`.txt\` \`.dat\`: comma, tab, semicolon or spaces, found by themselves. A first row of names is a header.
- \`.xlsx\`: every sheet; formulas come in as their last computed values.
- \`.mat\`: MATLAB v4, v6 and v7 (compressed). v7.3 files are HDF5: save them with \`-v7\` to import.
- \`.json\`: numbers, arrays, arrays of rows, or records like \`[{"t": 0, "y": 1}, …]\`.

A table with a header comes in as one vector per column, or as one matrix. Text columns are left out and named in the preview.`,
  },
  {
    id: "guide:run", title: "Running and cancelling", kind: "guide", summary: "what a run is doing, and how to stop it",
    text: `While a run is busy the run strip says what it's doing (evaluating, solving, plotting) and for how long.

- \`Cancel\` stops the running Julia code; the workspace keeps what was defined before it.
- A run never times out by itself: Cancel is how it ends early.`,
  },
];

const JULIA = "julia:";
const LIMIT = 200;

/** The Help provider: guides first, then Julia names (a prefix match before a match inside). */
export function mxHelp(kernelReady: () => boolean): HelpProvider {
  let names: Promise<{ name: string; module: string }[]> | null = null;
  const loadNames = () => {
    if (!kernelReady()) return Promise.resolve([]);
    names ??= docNames().then((r) => (r.ok && Array.isArray(r.value) ? (r.value as { name: string; module: string }[]) : []));
    return names;
  };
  return {
    async items(query) {
      const guides = GUIDES.filter((g) => matches(g, query));
      if (!query) return guides;
      const q = query.toLowerCase();
      const all = await loadNames();
      const hits = all.filter((n) => n.name.toLowerCase().includes(q));
      hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.name.length - b.name.length);
      const items: HelpItem[] = hits.slice(0, LIMIT).map((n) => ({ id: JULIA + n.name, title: n.name, kind: n.module }));
      // A name the list doesn't have (a qualified one, a package's) can still be looked up.
      if (/^[\p{L}_][\p{L}\p{N}_!.]*$/u.test(query) && !hits.some((n) => n.name === query)) items.unshift({ id: JULIA + query, title: query, kind: "look up" });
      return [...guides, ...items];
    },
    async page(id): Promise<HelpPage | null> {
      const guide = GUIDES.find((g) => g.id === id);
      if (guide) return { title: guide.title, kind: "guide", text: guide.text };
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
