"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FolderDown } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, BlobPreview, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { ARCHIVE_LABEL } from "@/lib/processors/archive/detect";
import type { ArchiveItem, OpenedArchive } from "@/lib/processors/archive/reader";
import { downloadBlob } from "@/lib/utils/download";
import { baseName, formatBytes } from "@/lib/utils/format";
import { errorMessage, useObjectUrl, useSupport, useTask } from "@/lib/utils/hooks";
import { ARCHIVE_ACCEPT, extractAll, isPasswordError, mimeFor, openAny, PasswordPrompt } from "./common";

type FSDir = { getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<FSDir>; getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: BlobPart): Promise<void>; close(): Promise<void> }> }> };

function Preview({ item, onClose }: { item: ArchiveItem; onClose: () => void }) {
  const [state, setState] = useState<{ blob: Blob | null; text: string | null; error: string | null }>({ blob: null, text: null, error: null });
  const url = useObjectUrl(state.blob);
  useEffect(() => {
    let alive = true;
    item
      .read()
      .then((d) => {
        if (!alive) return;
        const mime = mimeFor(item.path);
        if (mime === "text/plain") setState({ blob: null, text: new TextDecoder().decode(d.slice(0, 200_000)), error: null });
        else setState({ blob: new Blob([d as BlobPart], { type: mime }), text: null, error: null });
      })
      .catch((e) => alive && setState({ blob: null, text: null, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [item]);
  return (
    <Panel title={`Preview: ${item.path}`} actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.text != null ? <pre className="max-h-96 overflow-auto rounded-lg bg-bg-subtle p-3 font-mono text-xs whitespace-pre-wrap">{state.text}</pre> : null}
      {url && state.blob ? (state.blob.type === "application/octet-stream" ? <p className="text-sm text-fg-subtle">No preview for this file type – download it instead.</p> : <BlobPreview url={url} type={state.blob.type} name={item.path} />) : null}
      {!state.error && state.text == null && !state.blob ? <p className="text-sm text-fg-subtle">Loading…</p> : null}
    </Panel>
  );
}

/**
 * Archive extractor for ZIP, RAR, 7Z, TAR, GZIP and auto-detect (processorOptions.format).
 * Lists entries, previews text/images/PDF, downloads single files, everything as ZIP, or writes to a folder.
 */
export default function Extractor({ tool }: ToolComponentProps) {
  const format = (tool.processorOptions?.format as string) ?? "auto";
  const [file, setFile] = useState<File | null>(null);
  const [arch, setArch] = useState<OpenedArchive | null>(null);
  const [pwState, setPwState] = useState<null | "required" | "wrong">(null);
  const [password, setPassword] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<ArchiveItem | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const task = useTask<{ count: number; skipped: string[]; target: string }>();
  const archRef = useRef<OpenedArchive | null>(null);
  const fsSupported = useSupport(() => "showDirectoryPicker" in window);

  useEffect(() => () => void archRef.current?.close(), []);

  const open = async (f: File, pw?: string) => {
    setOpening(true);
    setOpenError(null);
    try {
      await archRef.current?.close();
      const a = await openAny(f, pw);
      archRef.current = a;
      setArch(a);
      setPwState(a.encrypted && !pw ? "required" : null);
      if (pw) setPassword(pw);
    } catch (e) {
      const p = isPasswordError(e);
      if (p) setPwState(pw ? "wrong" : "required");
      else setOpenError(errorMessage(e));
      setArch(null);
    } finally {
      setOpening(false);
    }
  };

  const reset = async () => {
    await archRef.current?.close();
    archRef.current = null;
    setFile(null);
    setArch(null);
    setPwState(null);
    setPassword("");
    setOpenError(null);
    setPreview(null);
    setItemError(null);
    task.reset();
  };

  const files = useMemo(() => (arch ? arch.items.filter((i) => !i.directory) : []), [arch]);
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? files.filter((i) => i.path.toLowerCase().includes(q)) : files;
  }, [files, filter]);
  const totalSize = files.reduce((s, i) => s + i.size, 0);

  const downloadOne = async (it: ArchiveItem) => {
    setItemError(null);
    try {
      const d = await it.read();
      downloadBlob(new Blob([d as BlobPart], { type: mimeFor(it.path) }), it.path.split("/").pop() || "file");
    } catch (e) {
      if (isPasswordError(e)) setPwState(isPasswordError(e));
      setItemError(`${it.path}: ${errorMessage(e)}`);
    }
  };

  const downloadAll = () =>
    task.run(async (ctx) => {
      if (!arch || !file) throw new Error("Open an archive first.");
      const { files: out, skipped } = await extractAll(arch, ctx);
      ctx.progress(null, "Packing ZIP…");
      const { createZip } = await import("@/lib/processors/archive/zipio");
      const blob = await createZip(out.map((f) => ({ path: f.path, data: f.data, lastModified: f.mtime })), { level: 1 });
      downloadBlob(blob, `${baseName(baseName(file.name))}${arch.format === "zip" ? "-decrypted" : ""}.zip`);
      return { count: out.length, skipped, target: arch.format === "zip" ? "an unencrypted ZIP" : "a ZIP download" };
    });

  const extractToFolder = () =>
    task.run(async (ctx) => {
      if (!arch) throw new Error("Open an archive first.");
      const root = (await (window as unknown as { showDirectoryPicker(o?: { mode?: string }): Promise<FSDir> }).showDirectoryPicker({ mode: "readwrite" })) as FSDir;
      const { files: out, skipped } = await extractAll(arch, ctx);
      for (const f of out) {
        const parts = f.path.split("/").filter(Boolean);
        let dir = root;
        for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true });
        const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(f.data as BlobPart);
        await w.close();
      }
      return { count: out.length, skipped, target: "the chosen folder" };
    });

  return (
    <div className="space-y-4">
      {file ? (
        <FileList files={[file]} onClear={reset} />
      ) : (
        <Dropzone
          accept={ARCHIVE_ACCEPT[format] || undefined}
          formatsLabel={format === "auto" ? "ZIP, RAR, 7Z, TAR, GZ, TGZ, BZ2, XZ" : `${format.toUpperCase()} archive`}
          maxSize={2 * 1024 * 1024 * 1024}
          onFiles={([f]) => {
            setFile(f);
            void open(f);
          }}
        />
      )}
      {opening ? <TaskProgress running progress={null} label="Reading archive…" /> : null}
      <ErrorMessage error={openError} />
      {pwState && file ? <PasswordPrompt wrong={pwState === "wrong"} busy={opening} onSubmit={(pw) => open(file, pw)} /> : null}

      {arch ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{ARCHIVE_LABEL[arch.format] ?? arch.format}</Badge>
            <span className="text-fg-muted">
              {files.length} file{files.length === 1 ? "" : "s"} · {formatBytes(totalSize)} uncompressed{file ? ` · ${formatBytes(file.size)} archive` : ""}
            </span>
            {arch.encrypted ? <Badge className="text-warning">Encrypted{password ? " · unlocked" : ""}</Badge> : null}
          </div>
          {format !== "auto" && arch.format !== format && !(format === "gzip" && arch.format === "tgz") ? (
            <Alert tone="info">This file is actually a {ARCHIVE_LABEL[arch.format] ?? arch.format} archive. It has been opened anyway.</Alert>
          ) : null}
          {arch.format === "zip" && !arch.encrypted && fsSupported === false ? (
            <Alert tone="info">Your browser cannot write folders directly. Download files individually, or open this page in Chrome or Edge to extract everything into a folder.</Alert>
          ) : null}
          {arch.notes.map((n) => (
            <Alert key={n} tone="warning">
              {n}
            </Alert>
          ))}
          <Panel
            title="Contents"
            actions={
              <>
                {arch.format !== "zip" || arch.encrypted ? (
                  <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadAll} disabled={task.running || !files.length} data-testid="download-all">
                    {arch.format === "zip" ? "Download decrypted ZIP" : "Download all as ZIP"}
                  </Button>
                ) : null}
                {fsSupported ? (
                  <Button size="sm" variant="secondary" icon={<FolderDown className="h-3.5 w-3.5" />} onClick={extractToFolder} disabled={task.running || !files.length}>
                    Extract to folder
                  </Button>
                ) : null}
              </>
            }
          >
            {files.length > 15 ? <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files…" aria-label="Filter files" className="mb-3" /> : null}
            <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-[13px]" data-testid="output">
                <thead className="sticky top-0 bg-bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Modified</th>
                    <th className="px-3 py-2 text-right font-medium">Size</th>
                    <th className="w-20 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.slice(0, 2000).map((it) => (
                    <tr key={it.path}>
                      <td className="max-w-0 truncate px-3 py-1.5 font-mono" title={it.path}>
                        {it.path}
                      </td>
                      <td className="hidden px-3 py-1.5 whitespace-nowrap text-fg-muted sm:table-cell">{it.mtime ? new Date(it.mtime).toLocaleString() : "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap text-fg-muted">{formatBytes(it.size)}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        <button className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg" aria-label={`Preview ${it.path}`} onClick={() => setPreview(it)}>
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg" aria-label={`Download ${it.path}`} onClick={() => downloadOne(it)}>
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length > 2000 ? <p className="mt-2 text-xs text-fg-subtle">Showing the first 2,000 entries; use the filter or Download all.</p> : null}
          </Panel>
          <ErrorMessage error={itemError} />
          {preview ? <Preview key={preview.path} item={preview} onClose={() => setPreview(null)} /> : null}
        </>
      ) : null}
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <Alert tone="success" title={`Extracted ${task.result.count} file${task.result.count === 1 ? "" : "s"} to ${task.result.target}`}>
          {task.result.skipped.length ? `${task.result.skipped.length} entries with unsafe paths (e.g. “../”) were skipped for your protection.` : null}
        </Alert>
      ) : null}
      <ActionBar onReset={reset} />
    </div>
  );
}
