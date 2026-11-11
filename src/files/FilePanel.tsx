// The MX file rail: the shared FileTree (same code as Squero OM) plus the Julia workspace
// mutations: new file/folder, rename, duplicate, delete, copy path, and drag-to-move.
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { FileTree, type FileEntry, type FileTreeHandle } from "@paperboat/shared/files";
import type { Storage } from "./storage.ts";

export type FilePanelHandle = { newFile: () => void; newFolder: () => void };

export type FilePanelProps = {
  root: string;
  files: Readonly<Record<string, string>>;
  folders: readonly string[];
  active: string;
  onOpen: (path: string) => void;
  onChange: (next: { files: Record<string, string>; folders: string[] }) => void;
  onPathChange?: (from: string, to: string) => void;
  onDeletePath?: (path: string) => void;
  onOpenFolder?: () => void;
  rootBadge?: string;
  storage?: Storage;
  onSay: (text: string, level?: "info" | "ok" | "warn") => void;
};

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const under = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);
const reparent = (path: string, from: string, to: string) => (path === from ? to : path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path);

/** Every folder plus every file, as flat rows in tree order (folders before files). */
export function entriesOf(files: Readonly<Record<string, string>>, folders: readonly string[]): FileEntry[] {
  const allFolders = new Set(folders);
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) allFolders.add(parts.slice(0, i).join("/"));
  }
  const dirs = new Map<string, string[]>();
  const fs = new Map<string, string[]>();
  for (const folder of [...allFolders].sort()) {
    const parent = dirOf(folder);
    dirs.set(parent, [...(dirs.get(parent) ?? []), folder]);
  }
  for (const path of Object.keys(files).sort()) {
    const parent = dirOf(path);
    fs.set(parent, [...(fs.get(parent) ?? []), path]);
  }
  const out: FileEntry[] = [];
  const walk = (dir: string, depth: number) => {
    for (const folder of dirs.get(dir) ?? []) {
      out.push({ path: folder, name: nameOf(folder), depth, kind: "folder", icon: "folder", badge: "dir" });
      walk(folder, depth + 1);
    }
    for (const path of fs.get(dir) ?? []) {
      out.push({
        path, name: nameOf(path), depth, kind: "file",
        icon: path.endsWith(".jl") ? "function" : "file",
        badge: path.endsWith(".jl") ? "jl" : "",
      });
    }
  };
  walk("", 0);
  return out;
}

export const FilePanel = forwardRef<FilePanelHandle, FilePanelProps>(function FilePanel({ root, files, folders, active, onOpen, onChange, onPathChange, onDeletePath, onOpenFolder, rootBadge, storage, onSay }, ref) {
  const tree = useRef<FileTreeHandle>(null);
  const entries = useMemo(() => entriesOf(files, folders), [files, folders]);
  const exists = (path: string) => path in files || folders.includes(path);
  const mirror = (work?: Promise<void>) => { void work?.catch((error: unknown) => onSay(`disk: ${error instanceof Error ? error.message : String(error)}`, "warn")); };
  const copyThenRemove = (from: string, to: string, folder: boolean) => {
    mirror(storage?.copy(from, to, folder).then(() => storage?.remove(from, folder)));
  };

  const unique = (dir: string, base: string): string => {
    let name = base;
    let i = 2;
    while (exists(join(dir, name))) {
      const dot = base.lastIndexOf(".");
      name = dot > 0 ? `${base.slice(0, dot)}-${i}${base.slice(dot)}` : `${base}-${i}`;
      i++;
    }
    return join(dir, name);
  };

  const newFile = (parent?: FileEntry) => {
    const path = unique(parent?.path ?? "", "untitled.jl");
    const code = `# ${nameOf(path)}\n`;
    onChange({ files: { ...files, [path]: code }, folders: [...folders] });
    mirror(storage?.write(path, code));
    onOpen(path);
    onSay(`new ${path}`, "ok");
  };

  const newFolder = (parent?: FileEntry) => {
    const path = unique(parent?.path ?? "", "new-folder");
    onChange({ files: { ...files }, folders: [...folders, path] });
    mirror(storage?.mkdir(path));
    onSay(`new ${path}/`, "ok");
  };

  useImperativeHandle(ref, () => ({ newFile: () => newFile(), newFolder: () => newFolder() }));

  const open = (entry: FileEntry) => {
    if (entry.kind === "file") onOpen(entry.path);
  };

  const rename = (entry: FileEntry) => {
    const name = window.prompt("New name", entry.name);
    if (!name || name === entry.name || name.includes("/")) return;
    const to = join(dirOf(entry.path), name);
    if (exists(to)) { onSay(`${to} already exists`, "warn"); return; }
    if (entry.kind === "file") {
      const next: Record<string, string> = {};
      for (const [path, code] of Object.entries(files)) next[path === entry.path ? to : path] = code;
      onChange({ files: next, folders: [...folders] });
      copyThenRemove(entry.path, to, false);
      onPathChange?.(entry.path, to);
      if (active === entry.path) onOpen(to);
    } else {
      const nextFiles: Record<string, string> = {};
      for (const [path, code] of Object.entries(files)) nextFiles[reparent(path, entry.path, to)] = code;
      const nextFolders = folders.map((folder) => reparent(folder, entry.path, to));
      onChange({ files: nextFiles, folders: nextFolders });
      copyThenRemove(entry.path, to, true);
      onPathChange?.(entry.path, to);
      if (under(active, entry.path)) onOpen(reparent(active, entry.path, to));
    }
    onSay(`renamed ${entry.path} → ${to}`, "ok");
  };

  const duplicate = (entry: FileEntry) => {
    if (entry.kind === "file") {
      const base = nameOf(entry.path);
      const dot = base.lastIndexOf(".");
      const copied = dot > 0 ? `${base.slice(0, dot)}-copy${base.slice(dot)}` : `${base}-copy`;
      const to = unique(dirOf(entry.path), copied);
      onChange({ files: { ...files, [to]: files[entry.path] }, folders: [...folders] });
      mirror(storage?.copy(entry.path, to, false));
      onOpen(to);
      onSay(`duplicated → ${to}`, "ok");
      return;
    }
    const to = unique(dirOf(entry.path), `${entry.name}-copy`);
    const nextFiles = { ...files };
    for (const [path, code] of Object.entries(files)) if (under(path, entry.path)) nextFiles[reparent(path, entry.path, to)] = code;
    const nextFolders = folders.filter((f) => under(f, entry.path)).map((f) => reparent(f, entry.path, to));
    onChange({ files: nextFiles, folders: [...folders, ...nextFolders] });
    mirror(storage?.copy(entry.path, to, true));
    onSay(`duplicated ${entry.path} → ${to}`, "ok");
  };

  const remove = (entry: FileEntry) => {
    if (!window.confirm(`Delete ${entry.path}${entry.kind === "folder" ? " and everything in it" : ""}?`)) return;
    const nextFiles: Record<string, string> = {};
    for (const [path, code] of Object.entries(files)) if (!under(path, entry.path)) nextFiles[path] = code;
    const nextFolders = folders.filter((folder) => !under(folder, entry.path));
    onChange({ files: nextFiles, folders: nextFolders });
    mirror(storage?.remove(entry.path, entry.kind === "folder"));
    onDeletePath?.(entry.path);
    if (under(active, entry.path)) {
      const first = Object.keys(nextFiles).sort()[0];
      if (first) onOpen(first);
    }
    onSay(`deleted ${entry.path}`, "warn");
  };

  const move = (source: FileEntry, target?: FileEntry) => {
    const toDir = target?.path ?? "";
    if (source.kind === "folder" && under(toDir, source.path)) { onSay("cannot move a folder into itself", "warn"); return; }
    const to = join(toDir, source.name);
    if (to === source.path) return;
    if (exists(to)) { onSay(`${to} already exists`, "warn"); return; }
    if (source.kind === "file") {
      const next: Record<string, string> = {};
      for (const [path, code] of Object.entries(files)) next[path === source.path ? to : path] = code;
      onChange({ files: next, folders: [...folders] });
      copyThenRemove(source.path, to, false);
      onPathChange?.(source.path, to);
      if (active === source.path) onOpen(to);
    } else {
      const nextFiles: Record<string, string> = {};
      for (const [path, code] of Object.entries(files)) nextFiles[reparent(path, source.path, to)] = code;
      const nextFolders = folders.map((folder) => reparent(folder, source.path, to));
      onChange({ files: nextFiles, folders: nextFolders });
      copyThenRemove(source.path, to, true);
      onPathChange?.(source.path, to);
      if (under(active, source.path)) onOpen(reparent(active, source.path, to));
    }
    onSay(`moved ${source.path} → ${target ? `${toDir}/` : "root"}`, "ok");
  };

  return (
    <aside className="rail panel files" aria-label="Files">
      <div className="rail-tabs" role="tablist" aria-label="Files">
        <span className="rail-tab on" role="tab" aria-selected>files</span>
        <button
          type="button"
          className="key small rail-add"
          title="New file or folder"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            tree.current?.openNewMenu(r.left, r.bottom + 4);
          }}
        >+</button>
      </div>
      <div className="files-panel">
        <div className="files-head">
          <span className="nm" title={root}>{root}</span>
          {onOpenFolder && (
            <button type="button" className="folder-key" title="Open workspace folder" aria-label="Open workspace folder" onClick={onOpenFolder}>
              <svg viewBox="0 0 16 16" aria-hidden><path d="M1.5 4.5h4.7l1.3 1.8h7v7.2h-13z" /></svg>
            </button>
          )}
          <span className="lbl">{rootBadge ?? "folder"}</span>
        </div>
        <FileTree
          ref={tree}
          entries={entries}
          active={active}
          ariaLabel="MX workspace"
          labels={{ newFile: "New script…", newFolder: "New folder…", empty: "No .jl files yet. Create one with +." }}
          actions={{ onOpen: open, onNewFile: newFile, onNewFolder: newFolder, onRename: rename, onDuplicate: duplicate, onDelete: remove, onCopyPath: (e) => { void navigator.clipboard?.writeText(e.path); onSay(`copied ${e.path}`, "ok"); }, onMove: move }}
        />
      </div>
      <div className="foot">{entries.filter((e) => e.kind === "file").length} files · 1 open</div>
    </aside>
  );
});
