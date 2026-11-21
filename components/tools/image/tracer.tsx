"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, DownloadButton, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { IMAGE_ACCEPT, decodeAny } from "./common";

const PRESETS: Record<string, { label: string; o: Record<string, number | boolean | string> }> = {
  logo: { label: "Logo / icon (few colours)", o: { numberofcolors: 8, ltres: 1, qtres: 1, pathomit: 8, colorsampling: 2, blurradius: 0 } },
  illustration: { label: "Illustration", o: { numberofcolors: 16, ltres: 0.5, qtres: 0.5, pathomit: 4, colorsampling: 2, blurradius: 1 } },
  photo: { label: "Photo (posterised)", o: { numberofcolors: 32, ltres: 0.5, qtres: 0.5, pathomit: 2, colorsampling: 2, blurradius: 2 } },
  bw: { label: "Black & white line art", o: { numberofcolors: 2, ltres: 1, qtres: 1, pathomit: 8, colorsampling: 0, blurradius: 0 } },
};

export default function PngToSvg(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState("logo");
  const [colors, setColors] = useState(8);
  const [detail, setDetail] = useState(8);
  const [maxEdge, setMaxEdge] = useState(1200);
  const [strokes, setStrokes] = useState(false);
  const task = useTask<string>();
  const svgBlob = task.result ? new Blob([task.result], { type: "image/svg+xml" }) : null;
  const url = useObjectUrl(svgBlob);
  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Add an image.");
      const [{ drawScaled, canvasPixels }, { fitWithin }, { runImageJob }] = await Promise.all([import("@/lib/processors/image/canvas"), import("@/lib/processors/image/geometry"), import("@/lib/processors/image/worker-client")]);
      const img = await decodeAny(file);
      try {
        const d = fitWithin(img.width, img.height, maxEdge);
        const px = canvasPixels(drawScaled(img.source, img.width, img.height, Math.min(img.width, d.width), Math.min(img.height, d.height)));
        ctx.progress(null, "Tracing shapes…");
        const r = await runImageJob({ op: "trace", options: { ...PRESETS[preset].o, numberofcolors: colors, pathomit: detail, strokewidth: strokes ? 1 : 0, viewbox: true } }, px, { signal: ctx.signal });
        if (!r.text) throw new Error("Tracing produced no output.");
        return r.text;
      } finally {
        img.close();
      }
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} formatsLabel="PNG, JPG, WebP, GIF" maxSize={40 * 1024 * 1024} onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Tracing">
        <Settings>
          <Field label="Preset">
            {(id) => (
              <Select id={id} value={preset} onChange={(e) => { setPreset(e.target.value); setColors(Number(PRESETS[e.target.value].o.numberofcolors)); setDetail(Number(PRESETS[e.target.value].o.pathomit)); }}>
                {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            )}
          </Field>
          <Slider label="Colours" value={colors} min={2} max={64} onChange={setColors} />
          <Slider label="Ignore specks smaller than" value={detail} min={0} max={32} onChange={setDetail} format={(v) => `${v}px`} />
          <Field label="Trace at max size">
            {(id) => (
              <Select id={id} value={maxEdge} onChange={(e) => setMaxEdge(Number(e.target.value))}>
                {[600, 1200, 2000].map((v) => <option key={v} value={v}>{v}px (longest edge)</option>)}
              </Select>
            )}
          </Field>
          <div className="pt-6"><Checkbox label="Outline shapes (stroke)" checked={strokes} onChange={setStrokes} /></div>
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Convert to SVG" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {url && task.result ? (
        <Panel title={`SVG (${formatBytes(svgBlob!.size)})`} actions={<DownloadButton blob={svgBlob} filename={`${file!.name.replace(/\.[^.]+$/, "")}.svg`} size="sm" />}>
          <div className="checkerboard flex justify-center rounded-lg border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Traced SVG" className="max-h-[480px] max-w-full" data-testid="output" />
          </div>
        </Panel>
      ) : null}
      <Alert tone="info">Tracing (imagetracerjs) converts colour regions to vector paths. It works best for logos, icons and flat artwork; photos become stylised, posterised vectors rather than exact copies.</Alert>
    </div>
  );
}
