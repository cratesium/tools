"use client";

import { useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Slider } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { OutputFormat } from "@/lib/processors/image/formats";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { FormatSelect, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, inferFormat } from "./common";

export default function ImageRotator(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [angle, setAngle] = useState(90);
  const [bg, setBg] = useState("#ffffff");
  const [transparent, setTransparent] = useState(true);
  const [format, setFormat] = useState<OutputFormat | "keep">("keep");
  const url = useObjectUrl(files[0] ?? null);
  const task = useTask<{ name: string; blob: Blob }[]>();
  const norm = ((angle % 360) + 360) % 360;

  const run = () =>
    task.run(async (ctx) => {
      const [{ createCanvas, context2d, encodeCanvas, outputName }, { rotatedBounds }] = await Promise.all([import("@/lib/processors/image/canvas"), import("@/lib/processors/image/geometry")]);
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const img = await decodeAny(f);
        try {
          const { width, height } = rotatedBounds(img.width, img.height, norm);
          const c = createCanvas(width, height);
          const g = context2d(c);
          const fmt = inferFormat(f, format);
          if (!transparent || fmt === "jpeg") {
            g.fillStyle = bg;
            g.fillRect(0, 0, width, height);
          }
          g.translate(width / 2, height / 2);
          g.rotate((norm * Math.PI) / 180);
          g.imageSmoothingQuality = "high";
          g.drawImage(img.source, -img.width / 2, -img.height / 2);
          out.push({ name: outputName(f.name, fmt, `-rotated-${norm}`), blob: await encodeCanvas(c, { format: fmt, quality: 0.92, background: bg }) });
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
        <div className="checkerboard flex h-72 items-center justify-center overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Rotation preview" className="max-h-60 max-w-[60%] transition-transform" style={{ transform: `rotate(${norm}deg)` }} />
        </div>
      ) : null}
      <Panel title="Rotation">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setAngle((a) => a - 90)}>90° left</Button>
            <Button variant="secondary" icon={<RotateCw className="h-4 w-4" />} onClick={() => setAngle((a) => a + 90)}>90° right</Button>
            <Button variant="secondary" onClick={() => setAngle((a) => a + 180)}>180°</Button>
          </div>
          <Settings>
            <Slider label="Angle" value={norm} min={0} max={359} onChange={setAngle} format={(v) => `${v}°`} />
            <Field label="Exact angle (°)">{(id) => <Input id={id} type="number" value={norm} onChange={(e) => setAngle(Number(e.target.value) || 0)} data-testid="input" />}</Field>
            <FormatSelect value={format} onChange={setFormat} />
          </Settings>
          {norm % 90 !== 0 ? (
            <div className="flex flex-wrap items-center gap-4">
              <Checkbox label="Transparent corners (PNG/WebP)" checked={transparent} onChange={setTransparent} />
              <label className="flex items-center gap-2 text-sm">Fill colour <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Fill colour" className="h-8 w-10 rounded border border-border" /></label>
            </div>
          ) : null}
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Rotate" running={task.running} disabled={!files.length || norm === 0} onReset={() => (setFiles([]), setAngle(90), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Rotating…" />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName="rotated-images.zip" label="Rotated images" /> : null}
    </div>
  );
}
