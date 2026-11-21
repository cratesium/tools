"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Slider } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { OutputFormat } from "@/lib/processors/image/formats";
import type { ResizeOptions } from "@/lib/processors/image/geometry";
import { useTask } from "@/lib/utils/hooks";
import { FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, inferFormat, useDecoded } from "./common";

export default function ImageResizer(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [o, setO] = useState<ResizeOptions>({ mode: "px", width: 1200, height: undefined, percent: 50, lockAspect: true, noUpscale: true });
  const [format, setFormat] = useState<OutputFormat | "keep">("keep");
  const [quality, setQuality] = useState(90);
  const first = useDecoded(files[0] ?? null);
  const task = useTask<{ name: string; blob: Blob; size: string }[]>();
  const set = <K extends keyof ResizeOptions>(k: K, v: ResizeOptions[K]) => setO((x) => ({ ...x, [k]: v }));

  const preview = (() => {
    if (!first.img) return null;
    // computeResize is pure; inline-import would be async, so mirror its simple rules for the preview label.
    const { width: w, height: h } = first.img;
    if (o.mode === "percent") return `${Math.max(1, Math.round((w * (o.percent ?? 100)) / 100))} × ${Math.max(1, Math.round((h * (o.percent ?? 100)) / 100))}`;
    return `${w} × ${h} → see result`;
  })();

  const run = () =>
    task.run(async (ctx) => {
      const [{ drawScaled, encodeCanvas, outputName }, { computeResize }] = await Promise.all([import("@/lib/processors/image/canvas"), import("@/lib/processors/image/geometry")]);
      const out: { name: string; blob: Blob; size: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const img = await decodeAny(f);
        try {
          const { width, height } = computeResize(img.width, img.height, o);
          const c = drawScaled(img.source, img.width, img.height, width, height);
          const fmt = inferFormat(f, format);
          out.push({ name: outputName(f.name, fmt, `-${width}x${height}`), blob: await encodeCanvas(c, { format: fmt, quality: quality / 100 }), size: `${width}×${height}` });
        } finally {
          img.close();
        }
        ctx.progress((i + 1) / files.length);
      }
      return out;
    });

  return (
    <div className="space-y-4">
      <Dropzone multiple accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC, GIF, BMP, SVG" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      {first.img ? <p className="text-sm text-fg-muted">First image: {first.img.width} × {first.img.height}px{o.mode === "percent" ? ` → ${preview}` : ""}</p> : null}
      <Panel title="New size">
        <div className="space-y-4">
          <Segmented label="Resize by" value={o.mode} onChange={(v) => set("mode", v)} options={[{ value: "px", label: "Pixels" }, { value: "percent", label: "Percentage" }]} />
          {o.mode === "px" ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Width (px)" className="w-32">{(id) => <Input id={id} type="number" min={1} value={o.width ?? ""} onChange={(e) => set("width", e.target.value ? Number(e.target.value) : undefined)} data-testid="input" />}</Field>
              <Field label="Height (px)" className="w-32">{(id) => <Input id={id} type="number" min={1} value={o.height ?? ""} onChange={(e) => set("height", e.target.value ? Number(e.target.value) : undefined)} placeholder={o.lockAspect ? "auto" : ""} />}</Field>
              <div className="flex flex-col gap-2 pb-1">
                <Checkbox label="Keep aspect ratio" checked={o.lockAspect} onChange={(v) => set("lockAspect", v)} />
              </div>
            </div>
          ) : (
            <Slider label="Scale" value={o.percent ?? 50} min={1} max={400} onChange={(v) => set("percent", v)} format={(v) => `${v}%`} />
          )}
          <Checkbox label="Don't enlarge smaller images" checked={!!o.noUpscale} onChange={(v) => set("noUpscale", v)} />
          <Settings>
            <FormatSelect value={format} onChange={setFormat} />
            <Slider label="Quality (JPG/WebP)" value={quality} min={40} max={100} onChange={setQuality} format={(v) => `${v}%`} />
          </Settings>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Resize" running={task.running} disabled={!files.length || (o.mode === "px" && !o.width && !o.height)} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Resizing…" />
      <ErrorMessage error={task.error ?? first.error} />
      {task.result ? <FileResults files={task.result} zipName="resized-images.zip" label="Resized images" /> : null}
    </div>
  );
}
