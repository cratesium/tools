"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select, Slider } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { OutputFormat } from "@/lib/processors/image/formats";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { CompareView, FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, inferFormat } from "./common";

type Out = { name: string; blob: Blob; original: File; keptOriginal: boolean };

export default function ImageCompressor(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(75);
  const [maxEdge, setMaxEdge] = useState(0);
  const [format, setFormat] = useState<OutputFormat | "keep">("keep");
  const [keepSmaller, setKeepSmaller] = useState(true);
  const task = useTask<Out[]>();

  const run = () =>
    task.run(async (ctx) => {
      const { drawScaled, encodeCanvas, outputName } = await import("@/lib/processors/image/canvas");
      const { fitWithin } = await import("@/lib/processors/image/geometry");
      const out: Out[] = [];
      for (let i = 0; i < files.length; i++) {
        if (ctx.signal.aborted) break;
        const f = files[i];
        const img = await decodeAny(f);
        try {
          const fmt = inferFormat(f, format);
          const dim = maxEdge ? fitWithin(img.width, img.height, maxEdge) : { width: img.width, height: img.height };
          const c = drawScaled(img.source, img.width, img.height, Math.min(img.width, dim.width), Math.min(img.height, dim.height));
          const blob = await encodeCanvas(c, { format: fmt, quality: quality / 100 });
          const smaller = keepSmaller && blob.size >= f.size && fmt === inferFormat(f, "keep") && !maxEdge;
          out.push({ name: smaller ? f.name : outputName(f.name, fmt), blob: smaller ? f : blob, original: f, keptOriginal: smaller });
        } finally {
          img.close();
        }
        ctx.progress((i + 1) / files.length, `Compressed ${i + 1} of ${files.length}`);
      }
      return out;
    });

  const before = task.result?.reduce((s, r) => s + r.original.size, 0) ?? 0;
  const after = task.result?.reduce((s, r) => s + r.blob.size, 0) ?? 0;

  return (
    <div className="space-y-4">
      <Dropzone multiple accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC, AVIF, GIF, BMP" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Compression">
        <Settings>
          <Slider label="Quality" value={quality} min={10} max={95} onChange={setQuality} format={(v) => `${v}%`} />
          <Field label="Maximum width/height">
            {(id) => (
              <Select id={id} value={maxEdge} onChange={(e) => setMaxEdge(Number(e.target.value))}>
                <option value={0}>Keep original size</option>
                {[3840, 2560, 1920, 1600, 1280, 1024, 800].map((v) => (
                  <option key={v} value={v}>
                    {v}px
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <FormatSelect value={format} onChange={setFormat} />
        </Settings>
        <div className="mt-4">
          <Checkbox label="Keep the original if compression makes it larger" checked={keepSmaller} onChange={setKeepSmaller} />
        </div>
        {format === "png" || (format === "keep" && files.some((f) => f.type === "image/png")) ? <Alert tone="info" className="mt-3">PNG is lossless, so the quality slider doesn&apos;t apply. For big savings on photos, convert to JPG or WebP, or reduce the dimensions.</Alert> : null}
      </Panel>
      <ActionBar onRun={run} runLabel={`Compress ${files.length || ""} image${files.length === 1 ? "" : "s"}`} running={task.running} disabled={!files.length} onCancel={task.cancel} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result?.length ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Before" value={formatBytes(before)} />
            <Stat label="After" value={formatBytes(after)} />
            <Stat label="Saved" value={before ? `${Math.max(0, (1 - after / before) * 100).toFixed(1)}%` : "—"} />
          </div>
          {task.result.length === 1 ? <CompareView before={task.result[0].original} after={task.result[0].blob} /> : null}
          <FileResults files={task.result.map((r) => ({ name: r.name, blob: r.blob }))} zipName="compressed-images.zip" label="Compressed images" />
          {task.result.some((r) => r.keptOriginal) ? <p className="text-xs text-fg-subtle">{task.result.filter((r) => r.keptOriginal).length} image(s) were already optimised; the originals were kept.</p> : null}
        </>
      ) : null}
    </div>
  );
}
