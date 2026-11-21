"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Slider } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { Adjustments, Pixels } from "@/lib/processors/image/pixels";
import { useTask } from "@/lib/utils/hooks";
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES, inferFormat, pixelsOf, pixelsToBlob, useDecoded } from "./common";

type Mode = "brightness" | "contrast" | "color";

/** Brightness, Contrast and Colour adjusters (processorOptions.mode) with a live preview on a downscaled copy. */
export default function ImageAdjust({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as Mode) ?? "color";
  const [file, setFile] = useState<File | null>(null);
  const { img, error } = useDecoded(file);
  const [adj, setAdj] = useState<Adjustments>({});
  const [preview, setPreview] = useState<{ src: Pixels; url: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const task = useTask<Blob>();
  const set = (k: keyof Adjustments) => (v: number) => setAdj((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    if (!img) return;
    let alive = true;
    (async () => {
      const [{ drawScaled, canvasPixels }, { fitWithin }] = await Promise.all([import("@/lib/processors/image/canvas"), import("@/lib/processors/image/geometry")]);
      const d = fitWithin(img.width, img.height, 900);
      const c = drawScaled(img.source, img.width, img.height, Math.min(img.width, d.width), Math.min(img.height, d.height));
      if (alive) setPreview({ src: canvasPixels(c), url: c.toDataURL() });
    })();
    return () => {
      alive = false;
    };
  }, [img]);

  const key = useMemo(() => JSON.stringify(adj), [adj]);
  useEffect(() => {
    if (!preview) return;
    let alive = true;
    const t = setTimeout(async () => {
      const [{ adjust }, { pixelsToCanvas }] = await Promise.all([import("@/lib/processors/image/pixels"), import("@/lib/processors/image/canvas")]);
      const data = adjust(preview.src, adj);
      if (alive) setPreviewUrl(pixelsToCanvas({ ...preview.src, data }).toDataURL());
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [preview, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = () =>
    task.run(async (ctx) => {
      if (!img || !file) throw new Error("Add an image first.");
      const px = await pixelsOf(img);
      const { runImageJob } = await import("@/lib/processors/image/worker-client");
      const r = await runImageJob({ op: "adjust", adjustments: adj }, px, { signal: ctx.signal });
      return pixelsToBlob(r.pixels!, inferFormat(file, "keep"), 0.93);
    });

  const auto = async () => {
    if (!preview) return;
    const { autoLevels } = await import("@/lib/processors/image/pixels");
    setAdj((a) => ({ ...a, levels: autoLevels(preview.src) }));
  };

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), setPreview(null), setPreviewUrl(null), setAdj({}), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC" onFiles={([f]) => (setFile(f), task.reset())} />}
      <ErrorMessage error={error} />
      {preview ? (
        <div className="checkerboard flex justify-center rounded-xl border border-border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl ?? preview.url} alt="Live preview" className="max-h-[480px] max-w-full" data-testid="output" />
        </div>
      ) : null}
      <Panel title="Adjustments" actions={<><Button size="sm" variant="secondary" onClick={auto} disabled={!preview}>Auto levels</Button><Button size="sm" variant="ghost" onClick={() => setAdj({})}>Reset sliders</Button></>}>
        <Settings>
          {mode === "brightness" ? (
            <>
              <Slider label="Brightness" value={adj.brightness ?? 0} min={-100} max={100} onChange={set("brightness")} />
              <Slider label="Exposure (stops)" value={adj.exposure ?? 0} min={-3} max={3} step={0.1} onChange={set("exposure")} format={(v) => v.toFixed(1)} />
              <Slider label="Gamma (midtones)" value={adj.gamma ?? 1} min={0.2} max={3} step={0.05} onChange={set("gamma")} format={(v) => v.toFixed(2)} />
            </>
          ) : null}
          {mode === "contrast" ? (
            <>
              <Slider label="Contrast" value={adj.contrast ?? 0} min={-100} max={100} onChange={set("contrast")} />
              <Slider label="Brightness" value={adj.brightness ?? 0} min={-100} max={100} onChange={set("brightness")} />
              <Slider label="Gamma" value={adj.gamma ?? 1} min={0.2} max={3} step={0.05} onChange={set("gamma")} format={(v) => v.toFixed(2)} />
            </>
          ) : null}
          {mode === "color" ? (
            <>
              <Slider label="Saturation" value={adj.saturation ?? 0} min={-100} max={100} onChange={set("saturation")} />
              <Slider label="Vibrance" value={adj.vibrance ?? 0} min={-100} max={100} onChange={set("vibrance")} />
              <Slider label="Hue shift" value={adj.hue ?? 0} min={-180} max={180} onChange={set("hue")} format={(v) => `${v}°`} />
              <Slider label="Temperature" value={adj.temperature ?? 0} min={-100} max={100} onChange={set("temperature")} format={(v) => (v > 0 ? `+${v} warm` : v < 0 ? `${v} cool` : "0")} />
              <Slider label="Tint" value={adj.tint ?? 0} min={-100} max={100} onChange={set("tint")} format={(v) => (v > 0 ? `+${v} magenta` : v < 0 ? `${v} green` : "0")} />
              <Slider label="Brightness" value={adj.brightness ?? 0} min={-100} max={100} onChange={set("brightness")} />
              <Slider label="Contrast" value={adj.contrast ?? 0} min={-100} max={100} onChange={set("contrast")} />
            </>
          ) : null}
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Apply to full image" running={task.running} disabled={!img} onReset={() => (setFile(null), setAdj({}), setPreview(null), setPreviewUrl(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Applying at full resolution…" />
      <ErrorMessage error={task.error} />
      {task.result && file ? <FileResult blob={task.result} filename={`${file.name.replace(/\.[^.]+$/, "")}-adjusted.${task.result.type.split("/")[1].replace("jpeg", "jpg")}`} originalSize={file.size} label="Adjusted image" /> : null}
    </div>
  );
}
