"use client";

import { useRef, useState, type DragEvent } from "react";
import { FolderOpen, FolderInput as FolderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format";
import { useSupport } from "@/lib/utils/hooks";

/** A file plus its path relative to the chosen folder root ("sub/a.txt"). */
export interface PickedFile {
  file: File;
  path: string;
}

export interface PickedFolder {
  name: string;
  files: PickedFile[];
  /** Present only when opened with the File System Access API in read/write mode. */
  handle?: FileSystemDirectoryHandleLike;
}

/* Minimal File System Access typings (not yet in lib.dom for all TS versions). */
export interface FileSystemFileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }>;
  move?(parentOrName: FileSystemDirectoryHandleLike | string, name?: string): Promise<void>;
}
export interface FileSystemDirectoryHandleLike {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileSystemFileHandleLike | FileSystemDirectoryHandleLike>;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
  removeEntry(name: string, o?: { recursive?: boolean }): Promise<void>;
}

export function hasFsAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function walkHandle(dir: FileSystemDirectoryHandleLike, prefix = "", out: PickedFile[] = []): Promise<PickedFile[]> {
  for await (const h of dir.values()) {
    if (h.kind === "file") out.push({ file: await h.getFile(), path: prefix + h.name });
    else await walkHandle(h, `${prefix}${h.name}/`, out);
  }
  return out;
}

export async function pickDirectory(write = false): Promise<PickedFolder> {
  const handle = (await (window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<FileSystemDirectoryHandleLike> }).showDirectoryPicker({
    mode: write ? "readwrite" : "read",
  })) as FileSystemDirectoryHandleLike;
  return { name: handle.name, files: await walkHandle(handle), handle };
}

type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries(cb: (e: Entry[]) => void, err: (e: unknown) => void): void } };

async function readEntry(entry: Entry, prefix: string, out: PickedFile[]) {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File>((res, rej) => entry.file!(res, rej));
    out.push({ file: f, path: prefix + entry.name });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await readEntry(e, `${prefix}${entry.name}/`, out);
    }
  }
}

/** Reads dropped files/folders with their relative paths. A single dropped folder becomes the root. */
export async function filesFromDrop(e: DragEvent): Promise<PickedFolder> {
  const items = Array.from(e.dataTransfer.items ?? []);
  const entries = items.map((i) => (i as unknown as { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.()).filter(Boolean) as Entry[];
  if (!entries.length) return { name: "", files: Array.from(e.dataTransfer.files).map((f) => ({ file: f, path: f.name })) };
  const out: PickedFile[] = [];
  for (const en of entries) await readEntry(en, "", out);
  if (entries.length === 1 && entries[0].isDirectory) {
    const root = `${entries[0].name}/`;
    return { name: entries[0].name, files: out.map((p) => ({ ...p, path: p.path.startsWith(root) ? p.path.slice(root.length) : p.path })) };
  }
  return { name: "", files: out };
}

export function fromInput(list: FileList | null): PickedFolder {
  const files = Array.from(list ?? []);
  const root = files.find((f) => f.webkitRelativePath)?.webkitRelativePath.split("/")[0] ?? "";
  return {
    name: root,
    files: files.map((f) => {
      const rel = f.webkitRelativePath || f.name;
      return { file: f, path: root && rel.startsWith(`${root}/`) ? rel.slice(root.length + 1) : rel };
    }),
  };
}

/**
 * Folder (or files) picker: drag-and-drop with folder recursion, a webkitdirectory fallback and,
 * where supported, the File System Access API (optionally read/write for in-place operations).
 */
export function FolderPicker({
  onPick,
  label = "Drop a folder here",
  allowFiles = false,
  writable = false,
  compact = false,
}: {
  onPick: (f: PickedFolder) => void;
  label?: string;
  allowFiles?: boolean;
  writable?: boolean;
  compact?: boolean;
}) {
  const dirInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fs = useSupport(hasFsAccess);
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          try {
            onPick(await filesFromDrop(e));
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center transition-colors",
          compact ? "px-4 py-6" : "px-6 py-10",
          over ? "border-fg bg-bg-muted" : "border-border-strong bg-bg-subtle",
        )}
      >
        <FolderOpen className="h-5 w-5 text-fg-muted" aria-hidden />
        <p className="text-sm font-medium text-fg">{label}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {fs ? (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  onPick(await pickDirectory(writable));
                } catch (x) {
                  if ((x as Error).name !== "AbortError") setErr((x as Error).message);
                }
              }}
              icon={<FolderIcon className="h-3.5 w-3.5" />}
            >
              {writable ? "Open folder (read & write)" : "Choose folder"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => dirInput.current?.click()} icon={<FolderIcon className="h-3.5 w-3.5" />}>
              Choose folder
            </Button>
          )}
          {allowFiles ? (
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
              Choose files
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-fg-subtle">Everything stays on your device{writable && fs === false ? " · in-place changes need Chrome or Edge; you'll get a ZIP instead" : ""}</p>
        <input ref={dirInput} type="file" className="sr-only" tabIndex={-1} multiple {...{ webkitdirectory: "", directory: "" }} data-testid="folder-input" onChange={(e) => (onPick(fromInput(e.target.files)), (e.target.value = ""))} />
        <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} multiple data-testid="file-input" onChange={(e) => (onPick(fromInput(e.target.files)), (e.target.value = ""))} />
      </div>
      {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
    </div>
  );
}

export function FolderSummary({ folder, onClear }: { folder: PickedFolder; onClear: () => void }) {
  const total = folder.files.reduce((s, f) => s + f.file.size, 0);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-fg-subtle" aria-hidden />
        <span className="font-medium text-fg">{folder.name || "Selected files"}</span>
        <span className="text-fg-muted">
          {folder.files.length.toLocaleString()} files · {formatBytes(total)}
          {folder.handle ? " · read & write access" : ""}
        </span>
      </span>
      <button type="button" onClick={onClear} className="text-xs text-fg-muted hover:text-fg">
        Clear
      </button>
    </div>
  );
}

export function toRecords(files: PickedFile[]) {
  return files.map((p) => ({ path: p.path, size: p.file.size, lastModified: p.file.lastModified, type: p.file.type }));
}
