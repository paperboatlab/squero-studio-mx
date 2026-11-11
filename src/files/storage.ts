// Real folders for the Files rail, through the File System Access API. The browser returns a
// directory handle; we read .jl files, write the current file, and mirror create/delete/rename/
// move/copy. The fallback is the in-memory workspace, labelled as such.
export type FileTree = { files: Record<string, string>; folders: string[] };
export type Storage = {
  write: (path: string, content: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  remove: (path: string, folder: boolean) => Promise<void>;
  copy: (from: string, to: string, folder: boolean) => Promise<void>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  }
}

const parts = (path: string) => path.split("/").filter(Boolean);
const nameOf = (path: string) => parts(path).pop() ?? path;
const parentOf = (path: string) => parts(path).slice(0, -1);

async function dirAt(root: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of path) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

export async function readTree(root: FileSystemDirectoryHandle): Promise<FileTree> {
  const files: Record<string, string> = {};
  const folders: string[] = [];
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of dir.entries()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        folders.push(path);
        await walk(handle as FileSystemDirectoryHandle, path);
      } else if (name.endsWith(".jl")) {
        const file = await (handle as FileSystemFileHandle).getFile();
        if (file.size <= 2 * 1024 * 1024) files[path] = await file.text();
      }
    }
  };
  await walk(root, "");
  return { files, folders };
}

export async function writeFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const dir = await dirAt(root, parentOf(path));
  const handle = await dir.getFileHandle(nameOf(path), { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function ensureDir(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  await dirAt(root, parts(path));
}

export async function removePath(root: FileSystemDirectoryHandle, path: string, folder: boolean): Promise<void> {
  const dir = await dirAt(root, parentOf(path));
  await dir.removeEntry(nameOf(path), { recursive: folder });
}

async function copyDir(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    if (handle.kind === "directory") {
      const child = await to.getDirectoryHandle(name, { create: true });
      await copyDir(handle as FileSystemDirectoryHandle, child);
    } else if (name.endsWith(".jl")) {
      const file = await (handle as FileSystemFileHandle).getFile();
      const target = await to.getFileHandle(name, { create: true });
      const writable = await target.createWritable();
      await writable.write(await file.text());
      await writable.close();
    }
  }
}

export async function copyPath(root: FileSystemDirectoryHandle, from: string, to: string, folder: boolean): Promise<void> {
  if (folder) {
    const source = await dirAt(root, parts(from));
    const target = await dirAt(root, parts(to));
    await copyDir(source, target);
    return;
  }
  const file = await (await dirAt(root, parentOf(from))).getFileHandle(nameOf(from));
  const content = await (await file.getFile()).text();
  await writeFile(root, to, content);
}

export function storageOf(root: FileSystemDirectoryHandle): Storage {
  return {
    write: (path, content) => writeFile(root, path, content),
    mkdir: (path) => ensureDir(root, path),
    remove: (path, folder) => removePath(root, path, folder),
    copy: (from, to, folder) => copyPath(root, from, to, folder),
  };
}
