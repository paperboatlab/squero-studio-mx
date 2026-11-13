// The git gutter: a thin bar beside the line numbers for lines added or changed since HEAD, and
// a wedge where lines were deleted. It diffs the live buffer, so unsaved edits show too.
import { RangeSet, Text } from "@codemirror/state";
import { gutter, GutterMarker, type EditorView } from "@codemirror/view";
import { Chunk } from "@codemirror/merge";

export type GitKind = "add" | "mod" | "del";

class GitMark extends GutterMarker {
  readonly kind: GitKind;
  constructor(kind: GitKind) { super(); this.kind = kind; }
  eq(other: GitMark) { return other.kind === this.kind; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `cm-git-${this.kind}`;
    return el;
  }
}
const MARKS = { add: new GitMark("add"), mod: new GitMark("mod"), del: new GitMark("del") };

const TAIL = Text.of(["", ""]);

/** `[line number, kind]` for `doc` against `base`, in line order; `del` sits on the line after the gap. */
export function gitMarks(base: Text, doc: Text): [number, GitKind][] {
  // A shared empty last line, so dropping the final line reads as a deletion, not an edit of the one before.
  const b = doc.append(TAIL);
  const line = (pos: number) => Math.min(b.lineAt(pos).number, doc.lines);
  const out: [number, GitKind][] = [];
  for (const chunk of Chunk.build(base.append(TAIL), b)) {
    if (chunk.fromB === chunk.toB) {
      out.push([line(chunk.fromB), "del"]);
      continue;
    }
    const kind = chunk.fromA === chunk.toA ? "add" : "mod";
    for (let n = line(chunk.fromB), last = line(chunk.endB); n <= last; n++) out.push([n, kind]);
  }
  return out;
}

export const textOf = (s: string) => Text.of(s.split(/\r?\n/));

/** The gutter against `base`, HEAD's copy of the open file. */
export function gitGutter(base: string) {
  const a = textOf(base);
  let cache: { doc: Text; set: RangeSet<GutterMarker> } | null = null;
  return gutter({
    class: "cm-git-gutter",
    markers(view: EditorView) {
      const doc = view.state.doc;
      if (cache?.doc !== doc) {
        cache = { doc, set: RangeSet.of(gitMarks(a, doc).map(([n, kind]) => MARKS[kind].range(doc.line(n).from)), true) };
      }
      return cache.set;
    },
  });
}
