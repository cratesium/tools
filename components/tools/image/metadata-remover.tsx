"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, TaskProgress } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny } from "./common";

type Out = { name: string; blob: Blob; summary: string };

export default function ImageMetadataRemover(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [keepIcc, setKeepIcc] = useState(true);
  const [keepOrientation, setKeepOrientation] = useState(true);
  const task = useTask<Out[]>();
  const run = () =>
    task.run(async (ctx) => {
      const { stripLossless } = await import("@/lib/processors/image/metadata");
      const out: Out[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const bytes = new Uint8Array(await f.arrayBuffer());
        const r = stripLossless(bytes, { keepIcc, keepOrientation });
        if (r) {
          const removed = r.removed.reduce((s, x) => s + x.bytes, 0);
          out.push({ name: f.name, blob: new Blob([r.bytes as BlobPart], { type: f.type }), summary: r.removed.length ? `Removed ${r.removed.map((x) => x.label).join(", ")} – ${formatBytes(removed)} (lossless)` : "No metadata found" });
        } else {
          // Other formats (HEIC, AVIF, GIF, BMP…): re-encode via canvas, which drops all metadata.
          const { toCanvas, encodeCanvas, outputName } = await import("@/lib/processors/image/canvas");
          const img = await decodeAny(f);
          try {
            const blob = await encodeCanvas(toCanvas(img), { format: "png" });
            out.push({ name: outputName(f.name, "png"), blob, summary: "Re-encoded to PNG without metadata (this format can't be cleaned losslessly)" });
          } finally {
            img.close();
          }
        }
        ctx.progress((i + 1) / files.length);
      }
      return out;
    });
  return (
    <div className="space-y-4">
      <Dropzone multiple accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP (lossless) · HEIC, AVIF, GIF (re-encoded)" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Options">
        <div className="flex flex-wrap gap-5">
          <Checkbox label="Keep colour profile (ICC)" description="Recommended – prevents colour shifts" checked={keepIcc} onChange={setKeepIcc} />
          <Checkbox label="Keep orientation" description="JPEG: rotated photos stay upright" checked={keepOrientation} onChange={setKeepOrientation} />
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Remove metadata" running={task.running} disabled={!files.length} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Cleaning…" />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <Panel title="What was removed">
            <ul className="space-y-1 text-sm" data-testid="output">
              {task.result.map((r, i) => <li key={i}><span className="font-medium">{r.name}</span>: <span className="text-fg-muted">{r.summary}</span></li>)}
            </ul>
          </Panel>
          <FileResults files={task.result} zipName="clean-images.zip" label="Clean images" />
        </>
      ) : null}
    </div>
  );
}
