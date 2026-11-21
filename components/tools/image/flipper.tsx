"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, TaskProgress } from "@/components/tools/shared";
import type { OutputFormat } from "@/lib/processors/image/formats";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, inferFormat } from "./common";

export default function ImageFlipper(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [h, setH] = useState(true);
  const [v, setV] = useState(false);
  const [format, setFormat] = useState<OutputFormat | "keep">("keep");
  const url = useObjectUrl(files[0] ?? null);
  const task = useTask<{ name: string; blob: Blob }[]>();
  const run = () =>
    task.run(async (ctx) => {
      const { createCanvas, context2d, encodeCanvas, outputName } = await import("@/lib/processors/image/canvas");
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const img = await decodeAny(f);
        try {
          const c = createCanvas(img.width, img.height);
          const g = context2d(c);
          g.translate(h ? img.width : 0, v ? img.height : 0);
          g.scale(h ? -1 : 1, v ? -1 : 1);
          g.drawImage(img.source, 0, 0);
          const fmt = inferFormat(f, format);
          out.push({ name: outputName(f.name, fmt, h && v ? "-flipped" : h ? "-mirrored" : "-flipped-v"), blob: await encodeCanvas(c, { format: fmt, quality: 0.92 }) });
        } finally {
          img.close();
        }
        ctx.progress((i + 1) / files.length);
      }
      return out;
    });
  return (
    <div className="space-y-4">
      <Dropzone multiple accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC, GIF" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      {url ? (
        <div className="checkerboard flex justify-center rounded-xl border border-border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Flip preview" className="max-h-72 max-w-full" style={{ transform: `scale(${h ? -1 : 1}, ${v ? -1 : 1})` }} />
        </div>
      ) : null}
      <Panel title="Direction">
        <div className="flex flex-wrap items-end gap-5">
          <Checkbox label="Flip horizontally (mirror)" checked={h} onChange={setH} />
          <Checkbox label="Flip vertically (upside down)" checked={v} onChange={setV} />
          <div className="w-48"><FormatSelect value={format} onChange={setFormat} /></div>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Flip" running={task.running} disabled={!files.length || (!h && !v)} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Flipping…" />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName="flipped-images.zip" label="Flipped images" /> : null}
    </div>
  );
}
