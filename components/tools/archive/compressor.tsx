"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Slider } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, TaskProgress } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

type Fmt = "gzip" | "zip" | "tgz";

/** Compresses files with GZIP (single file), ZIP or TAR.GZ and reports the real ratio. */
export default function Compressor(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [fmt, setFmt] = useState<Fmt>("gzip");
  const [level, setLevel] = useState(9);
  const task = useTask<{ blob: Blob; name: string }>();
  const total = files.reduce((s, f) => s + f.size, 0);
  const effective: Fmt = fmt === "gzip" && files.length > 1 ? "tgz" : fmt;

  const run = () =>
    task.run(async (ctx) => {
      if (!files.length) throw new Error("Add a file first.");
      if (effective === "zip") {
        const { createZip } = await import("@/lib/processors/archive/zipio");
        const blob = await createZip(files.map((f) => ({ path: f.webkitRelativePath || f.name, data: f, lastModified: f.lastModified })), { level, signal: ctx.signal, onProgress: (x) => ctx.progress(x) });
        return { blob, name: files.length === 1 ? `${files[0].name}.zip` : "files.zip" };
      }
      const { gzip } = await import("@/lib/processors/archive/gzip");
      ctx.progress(null, "Compressing…");
      await new Promise((r) => setTimeout(r, 0));
      if (effective === "gzip") {
        const f = files[0];
        const out = gzip(new Uint8Array(await f.arrayBuffer()), { level, filename: f.name, mtime: f.lastModified });
        return { blob: new Blob([out as BlobPart], { type: "application/gzip" }), name: `${f.name}.gz` };
      }
      const { createTar } = await import("@/lib/processors/archive/tar");
      const entries = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        entries.push({ name: f.webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()), mtime: f.lastModified });
        ctx.progress(((i + 1) / files.length) * 0.5, "Reading files…");
      }
      ctx.progress(null, "Compressing…");
      const out = gzip(createTar(entries), { level });
      return { blob: new Blob([out as BlobPart], { type: "application/gzip" }), name: "files.tar.gz" };
    });

  const saved = task.result ? 1 - task.result.blob.size / (total || 1) : 0;

  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Any files" maxSize={1024 * 1024 * 1024} onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          label="Format"
          value={fmt}
          onChange={setFmt}
          options={[
            { value: "gzip", label: "GZIP (.gz)" },
            { value: "zip", label: "ZIP" },
            { value: "tgz", label: "TAR.GZ" },
          ]}
        />
        <Slider label="Level" value={level} min={1} max={9} onChange={setLevel} format={(v) => (v === 9 ? "9 (smallest)" : v === 1 ? "1 (fastest)" : String(v))} />
      </div>
      {fmt === "gzip" && files.length > 1 ? <Alert tone="info">GZIP compresses a single file, so multiple files will be bundled into a .tar.gz.</Alert> : null}
      <ActionBar onRun={run} runLabel="Compress" running={task.running} disabled={!files.length} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Original" value={formatBytes(total)} />
            <Stat label="Compressed" value={formatBytes(task.result.blob.size)} />
            <Stat label="Saved" value={`${(saved * 100).toFixed(1)}%`} sub={saved <= 0.02 ? "Already compressed data" : undefined} />
          </div>
          {saved <= 0.02 ? <Alert tone="info">JPEG, MP4, ZIP and similar files are already compressed, so they barely shrink further.</Alert> : null}
          <FileResult blob={task.result.blob} filename={task.result.name} originalSize={total} preview={false} label="Compressed file" />
        </>
      ) : null}
    </div>
  );
}
