"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Slider } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { Rect } from "@/lib/processors/image/pixels";
import type { ImageJob } from "@/lib/processors/image/jobs";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { CompareView, IMAGE_ACCEPT, MAX_IMAGE_BYTES, RegionSelect, inferFormat, pixelsOf, pixelsToBlob, useDecoded } from "./common";

type Op = "blur" | "sharpen" | "pixelate";

/** Blur, Sharpen and Pixelate (processorOptions.op); blur and pixelate can target a dragged region (faces, plates). */
export default function ImageFilter({ tool }: ToolComponentProps) {
  const op = (tool.processorOptions?.op as Op) ?? "blur";
  const [file, setFile] = useState<File | null>(null);
  const { img, error } = useDecoded(file);
  const url = useObjectUrl(file);
  const [scope, setScope] = useState<"all" | "region">(op === "sharpen" ? "all" : "all");
  const [region, setRegion] = useState<Rect | null>(null);
  const [sigma, setSigma] = useState(6);
  const [block, setBlock] = useState(16);
  const [amount, setAmount] = useState(80);
  const [radius, setRadius] = useState(1.2);
  const [threshold, setThreshold] = useState(2);
  const task = useTask<Blob>();

  const run = () =>
    task.run(async (ctx) => {
      if (!img || !file) throw new Error("Add an image first.");
      const r = scope === "region" ? region : null;
      if (scope === "region" && (!r || r.width < 3 || r.height < 3)) throw new Error("Drag on the image to select the area.");
      const job: ImageJob = op === "blur" ? { op: "blur", sigma, region: r } : op === "pixelate" ? { op: "pixelate", block, region: r } : { op: "sharpen", amount: amount / 100, radius, threshold };
      const px = await pixelsOf(img);
      const { runImageJob } = await import("@/lib/processors/image/worker-client");
      const res = await runImageJob(job, px, { signal: ctx.signal, onProgress: (f) => ctx.progress(f) });
      return pixelsToBlob(res.pixels!, inferFormat(file, "keep"), 0.93);
    });

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), setRegion(null), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC" onFiles={([f]) => (setFile(f), task.reset())} />}
      <ErrorMessage error={error} />
      {op !== "sharpen" && img && url ? (
        <Panel title={<Segmented label="Apply to" value={scope} onChange={setScope} options={[{ value: "all", label: "Whole image" }, { value: "region", label: "Selected area" }]} />}>
          {scope === "region" ? (
            <>
              <RegionSelect src={url} width={img.width} height={img.height} region={region} onChange={setRegion} />
              <p className="mt-2 text-center text-xs text-fg-subtle">Drag a rectangle over the face, number plate or text to hide.</p>
            </>
          ) : (
            <p className="text-sm text-fg-muted">The whole image will be processed ({img.width} × {img.height}px).</p>
          )}
        </Panel>
      ) : null}
      <Panel title="Strength">
        <Settings>
          {op === "blur" ? <Slider label="Blur radius" value={sigma} min={1} max={60} onChange={setSigma} format={(v) => `${v}px`} /> : null}
          {op === "pixelate" ? <Slider label="Block size" value={block} min={2} max={120} onChange={setBlock} format={(v) => `${v}px`} /> : null}
          {op === "sharpen" ? (
            <>
              <Slider label="Amount" value={amount} min={10} max={300} onChange={setAmount} format={(v) => `${v}%`} />
              <Slider label="Radius" value={radius} min={0.3} max={5} step={0.1} onChange={setRadius} format={(v) => `${v.toFixed(1)}px`} />
              <Slider label="Threshold" value={threshold} min={0} max={30} onChange={setThreshold} />
            </>
          ) : null}
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel={op === "blur" ? "Blur" : op === "pixelate" ? "Pixelate" : "Sharpen"} running={task.running} disabled={!img} onCancel={task.cancel} onReset={() => (setFile(null), setRegion(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Processing…" />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <>
          <CompareView before={file} after={task.result} />
          <FileResult blob={task.result} filename={`${file.name.replace(/\.[^.]+$/, "")}-${op === "blur" ? "blurred" : op === "pixelate" ? "pixelated" : "sharpened"}.${task.result.type.split("/")[1].replace("jpeg", "jpg")}`} preview={false} label="Result" />
        </>
      ) : null}
    </div>
  );
}
