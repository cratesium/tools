"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { backgroundModels, type BackgroundModelId } from "@/lib/processors/image/background-models";
import type { BackgroundSegmenter } from "@/lib/processors/image/background-client";
import type { Pixels } from "@/lib/processors/image/pixels";
import { formatBytes } from "@/lib/utils/format";
import { useSupport, useTask } from "@/lib/utils/hooks";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, pixelsOf, pixelsToBlob } from "./common";

type Bg = "transparent" | "color" | "image" | "blur";

/** Background remover (mode "remove") and changer (mode "change"), running a segmentation model locally. */
export default function BackgroundTool({ tool }: ToolComponentProps) {
  const change = tool.processorOptions?.mode === "change";
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState<BackgroundModelId>("modnet");
  const [bg, setBg] = useState<Bg>(change ? "color" : "transparent");
  const [color, setColor] = useState("#ffffff");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [blur, setBlur] = useState(12);
  const [feather, setFeather] = useState(1);
  const [shift, setShift] = useState(0);
  const seg = useRef<BackgroundSegmenter | null>(null);
  const cache = useRef<{ file: File; model: string; px: Pixels; mask: Uint8ClampedArray } | null>(null);
  const webgpu = useSupport(() => "gpu" in navigator);
  const task = useTask<{ blob: Blob; device: string }>();

  useEffect(() => () => seg.current?.dispose(), []);

  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Add a photo first.");
      if (backgroundModels[model].requiresWebGpu && !webgpu) throw new Error("This model needs WebGPU. Choose the Portrait model or use a recent Chrome or Edge.");
      let device = "cached";
      if (!cache.current || cache.current.file !== file || cache.current.model !== model) {
        const img = await decodeAny(file);
        const px = await pixelsOf(img);
        img.close();
        if (!seg.current) {
          const { BackgroundSegmenter } = await import("@/lib/processors/image/background-client");
          seg.current = new BackgroundSegmenter();
        }
        const r = await seg.current.predict(px, model, {
          signal: ctx.signal,
          onDownload: (l, t) => ctx.progress(t ? l / t : null, `Downloading model (${formatBytes(l)}${t ? ` of ${formatBytes(t)}` : ""}) – first time only`),
          onStatus: (m) => ctx.progress(null, m),
        });
        cache.current = { file, model, px, mask: r.mask };
        device = r.device;
      }
      const { px, mask } = cache.current;
      const comp = await import("@/lib/processors/image/composite");
      const refined = comp.refineMask(mask, px.width, px.height, { feather, shift });
      let data: Uint8ClampedArray;
      if (bg === "transparent") data = comp.applyMask(px, refined);
      else if (bg === "blur") data = comp.blurBackground(px, refined, blur);
      else if (bg === "image") {
        if (!bgFile) throw new Error("Choose a background image.");
        const [{ drawScaled, canvasPixels }] = await Promise.all([import("@/lib/processors/image/canvas")]);
        const b = await decodeAny(bgFile);
        const s = Math.max(px.width / b.width, px.height / b.height);
        const c = drawScaled(b.source, b.width, b.height, Math.round(b.width * s), Math.round(b.height * s));
        b.close();
        const cropped = (await import("@/lib/processors/image/pixels")).cropPixels(canvasPixels(c), { x: Math.floor((c.width - px.width) / 2), y: Math.floor((c.height - px.height) / 2), width: px.width, height: px.height });
        data = comp.compositeOver(px, refined, cropped.data);
      } else {
        const [r, g, b] = comp.parseHexColor(color);
        data = comp.compositeOver(px, refined, comp.solidBackground(px.width, px.height, [r, g, b, 255]));
      }
      ctx.progress(null, "Encoding…");
      return { blob: await pixelsToBlob({ data, width: px.width, height: px.height }, bg === "transparent" ? "png" : "jpeg", 0.92), device };
    });

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), (cache.current = null), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC" onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Settings">
        <div className="space-y-4">
          <Field label="Model">
            {(id) => (
              <Select id={id} value={model} onChange={(e) => setModel(e.target.value as BackgroundModelId)}>
                {(Object.keys(backgroundModels) as BackgroundModelId[]).map((m) => (
                  <option key={m} value={m} disabled={backgroundModels[m].requiresWebGpu && webgpu === false}>
                    {backgroundModels[m].label} – {backgroundModels[m].sizeLabel}{backgroundModels[m].requiresWebGpu && webgpu === false ? " (needs WebGPU)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <p className="text-xs text-fg-subtle">{backgroundModels[model].hint} License: {backgroundModels[model].license}.</p>
          {change ? (
            <Segmented label="New background" value={bg} onChange={setBg} options={[{ value: "color", label: "Colour" }, { value: "image", label: "Image" }, { value: "blur", label: "Blur original" }, { value: "transparent", label: "Transparent" }]} />
          ) : null}
          <Settings>
            {bg === "color" ? <Field label="Colour">{(id) => <Input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-20 p-1" />}</Field> : null}
            {bg === "blur" ? <Slider label="Background blur" value={blur} min={2} max={40} onChange={setBlur} /> : null}
            <Slider label="Edge softness" value={feather} min={0} max={8} onChange={setFeather} format={(v) => `${v}px`} />
            <Slider label="Edge shift" value={shift} min={-40} max={40} onChange={setShift} format={(v) => (v > 0 ? `+${v} (keep more)` : v < 0 ? `${v} (trim)` : "0")} />
          </Settings>
          {bg === "image" ? (bgFile ? <FileList files={[bgFile]} onClear={() => setBgFile(null)} /> : <Dropzone accept={IMAGE_ACCEPT} formatsLabel="Background image" onFiles={([f]) => setBgFile(f)} />) : null}
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel={change ? "Replace background" : "Remove background"} running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), setBgFile(null), (cache.current = null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <FileResult blob={task.result.blob} filename={`${file.name.replace(/\.[^.]+$/, "")}-${change ? "new-bg" : "no-bg"}.${task.result.blob.type === "image/png" ? "png" : "jpg"}`} label="Result">
          {task.result.device !== "cached" ? <p className="text-xs text-fg-subtle">Ran on {task.result.device === "webgpu" ? "your GPU (WebGPU)" : "your CPU (WebAssembly)"}. Adjust edges and re-run instantly – the mask is reused.</p> : null}
        </FileResult>
      ) : null}
      <Alert tone="info">The AI model is downloaded once from Hugging Face and cached by your browser; your photo is processed on your device and never uploaded.</Alert>
    </div>
  );
}
