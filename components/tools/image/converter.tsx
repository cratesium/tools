"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { OutputFormat } from "@/lib/processors/image/formats";
import { useTask } from "@/lib/utils/hooks";
import { FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny } from "./common";

const ACCEPT: Record<string, string> = { jpg: ".jpg,.jpeg,.jfif,image/jpeg", png: ".png,image/png", webp: ".webp,image/webp", heic: ".heic,.heif,image/heic,image/heif", svg: ".svg,image/svg+xml" };

/**
 * Image Converter (no options) and fixed pairs via processorOptions { from, to }.
 * HEIC is decoded with heic2any; SVG is rasterised at a chosen width.
 */
export default function ImageConverter({ tool }: ToolComponentProps) {
  const from = tool.processorOptions?.from as string | undefined;
  const fixedTo = tool.processorOptions?.to as OutputFormat | undefined;
  const [files, setFiles] = useState<File[]>([]);
  const [to, setTo] = useState<OutputFormat | "keep">(fixedTo ?? "png");
  const [quality, setQuality] = useState(90);
  const [svgWidth, setSvgWidth] = useState(1024);
  const [bg, setBg] = useState("#ffffff");
  const task = useTask<{ name: string; blob: Blob }[]>();
  const target: OutputFormat = (fixedTo ?? (to === "keep" ? "png" : to)) as OutputFormat;
  const isSvgIn = from === "svg" || files.some((f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"));

  const run = () =>
    task.run(async (ctx) => {
      const [{ drawScaled, encodeCanvas, outputName }, svg] = await Promise.all([import("@/lib/processors/image/canvas"), import("@/lib/processors/image/svg")]);
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        let blob: Blob = f;
        let w = 0;
        let h = 0;
        if (f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg")) {
          const text = await f.text();
          const size = svg.intrinsicSvgSize(svg.parseSvgSize(text));
          w = svgWidth;
          h = Math.max(1, Math.round((size.height / size.width) * svgWidth));
          blob = new Blob([svg.setSvgSize(text, w, h)], { type: "image/svg+xml" });
        }
        const img = await decodeAny(Object.assign(blob, { name: f.name }) as File);
        try {
          const c = drawScaled(img.source, img.width, img.height, w || img.width, h || img.height);
          out.push({ name: outputName(f.name, target), blob: await encodeCanvas(c, { format: target, quality: quality / 100, background: bg }) });
        } finally {
          img.close();
        }
        ctx.progress((i + 1) / files.length, `Converted ${i + 1} of ${files.length}`);
      }
      return out;
    });

  return (
    <div className="space-y-4">
      <Dropzone multiple accept={from ? ACCEPT[from] : IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel={from ? from.toUpperCase() : "JPG, PNG, WebP, HEIC, AVIF, GIF, BMP, SVG"} onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Output">
        <Settings>
          {fixedTo ? null : <FormatSelect value={to} onChange={setTo} allowKeep={false} label="Convert to" />}
          {target === "jpeg" || target === "webp" ? <Slider label="Quality" value={quality} min={40} max={100} onChange={setQuality} format={(v) => `${v}%`} /> : null}
          {target === "jpeg" ? (
            <Field label="Background for transparency">{(id) => <Input id={id} type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-9 w-20 p-1" />}</Field>
          ) : null}
          {isSvgIn ? <Field label="Output width (px)" hint="height keeps the aspect ratio">{(id) => <Input id={id} type="number" min={16} max={8192} value={svgWidth} onChange={(e) => setSvgWidth(Math.min(8192, Math.max(16, Number(e.target.value) || 1024)))} data-testid="input" />}</Field> : null}
        </Settings>
        {target === "jpeg" ? <p className="mt-3 text-xs text-fg-subtle">JPG has no transparency, so transparent areas are filled with the background colour.</p> : null}
      </Panel>
      {from === "heic" ? <Alert tone="info">HEIC photos are decoded in your browser with heic2any (libheif compiled to WebAssembly). Large photos can take a few seconds each.</Alert> : null}
      <ActionBar onRun={run} runLabel={`Convert to ${target === "jpeg" ? "JPG" : target.toUpperCase()}`} running={task.running} disabled={!files.length} onCancel={task.cancel} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName={`converted-${target}.zip`} label="Converted images" /> : null}
    </div>
  );
}
