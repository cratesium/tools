"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { CompareView, IMAGE_ACCEPT, MAX_IMAGE_BYTES, inferFormat, pixelsOf, pixelsToBlob, useDecoded } from "./common";

/** Paint over a watermark or blemish, then fill it from surrounding pixels (diffusion or patch-based inpainting). */
export default function RemoveWatermark(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { img, error } = useDecoded(file);
  const url = useObjectUrl(file);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const [brush, setBrush] = useState(24);
  const [method, setMethod] = useState<"patch" | "smooth">("patch");
  const [hasMask, setHasMask] = useState(false);
  const task = useTask<Blob>();

  useEffect(() => {
    if (!img || !canvas.current) return;
    canvas.current.width = img.width;
    canvas.current.height = img.height;
    canvas.current.getContext("2d")!.clearRect(0, 0, img.width, img.height);
    // The mask canvas is cleared above; hasMask is reset when a new file is chosen.
  }, [img]);

  const paint = (e: RPointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const s = c.width / r.width;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(239,68,68,0.55)";
    g.beginPath();
    g.arc((e.clientX - r.left) * s, (e.clientY - r.top) * s, (brush * s) / 2, 0, Math.PI * 2);
    g.fill();
    setHasMask(true);
  };

  const run = () =>
    task.run(async (ctx) => {
      if (!img || !file || !canvas.current) throw new Error("Add an image first.");
      const m = canvas.current.getContext("2d")!.getImageData(0, 0, img.width, img.height).data;
      const mask = new Uint8Array(img.width * img.height);
      let count = 0;
      for (let i = 0; i < mask.length; i++) {
        if (m[i * 4 + 3] > 0) {
          mask[i] = 1;
          count++;
        }
      }
      if (!count) throw new Error("Paint over the area you want to remove first.");
      const px = await pixelsOf(img);
      const { runImageJob } = await import("@/lib/processors/image/worker-client");
      const r = await runImageJob({ op: "inpaint", mask, method, patchRadius: 4, searchRadius: 40, iterations: 60 }, px, { signal: ctx.signal, onProgress: (f) => ctx.progress(f, "Filling the painted area…") });
      return pixelsToBlob(r.pixels!, inferFormat(file, "keep"), 0.95);
    });

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), setHasMask(false), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP" onFiles={([f]) => (setFile(f), setHasMask(false), task.reset())} />}
      <ErrorMessage error={error} />
      {img && url ? (
        <>
          <Panel title="Paint over the watermark" actions={<Button size="sm" variant="ghost" onClick={() => (canvas.current?.getContext("2d")!.clearRect(0, 0, img.width, img.height), setHasMask(false))}>Clear mask</Button>}>
            <div className="relative mx-auto w-fit touch-none select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Image to retouch" className="block max-h-[520px] max-w-full rounded-lg" draggable={false} />
              <canvas
                ref={canvas}
                className="absolute inset-0 h-full w-full cursor-crosshair rounded-lg"
                onPointerDown={(e) => ((painting.current = true), e.currentTarget.setPointerCapture(e.pointerId), paint(e))}
                onPointerMove={(e) => painting.current && paint(e)}
                onPointerUp={() => (painting.current = false)}
                aria-label="Mask painting area"
              />
            </div>
          </Panel>
          <Settings>
            <Slider label="Brush size" value={brush} min={4} max={120} onChange={setBrush} format={(v) => `${v}px`} />
            <Segmented label="Fill method" value={method} onChange={setMethod} options={[{ value: "patch", label: "Texture (patch)" }, { value: "smooth", label: "Smooth (diffusion)" }]} />
          </Settings>
        </>
      ) : null}
      <ActionBar onRun={run} runLabel="Remove painted area" running={task.running} disabled={!img || !hasMask} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <>
          <CompareView before={file} after={task.result} />
          <FileResult blob={task.result} filename={`${file.name.replace(/\.[^.]+$/, "")}-retouched.${task.result.type.split("/")[1].replace("jpeg", "jpg")}`} preview={false} label="Retouched image" />
        </>
      ) : null}
      <Alert tone="info">Inpainting rebuilds the painted area from nearby pixels. It works well for small marks on simple backgrounds; large logos over detailed areas may leave visible smudges. Only remove watermarks from images you have the rights to edit.</Alert>
    </div>
  );
}
