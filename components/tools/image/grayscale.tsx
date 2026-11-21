"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Select, Slider } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { grayscaleMethods, type GrayscaleMethod } from "@/lib/processors/image/pixels";
import { useTask } from "@/lib/utils/hooks";
import { CompareView, IMAGE_ACCEPT, MAX_IMAGE_BYTES, decodeAny, inferFormat, pixelsOf, pixelsToBlob } from "./common";

export default function Grayscale(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [method, setMethod] = useState<GrayscaleMethod>("bt709");
  const [amount, setAmount] = useState(100);
  const [sepia, setSepia] = useState(0);
  const task = useTask<{ name: string; blob: Blob; original: File }[]>();
  const run = () =>
    task.run(async (ctx) => {
      const { runImageJob } = await import("@/lib/processors/image/worker-client");
      const { outputName } = await import("@/lib/processors/image/canvas");
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const img = await decodeAny(f);
        const px = await pixelsOf(img);
        img.close();
        const r = await runImageJob({ op: "grayscale", method, amount: amount / 100, sepia: sepia / 100 }, px, { signal: ctx.signal });
        const fmt = inferFormat(f, "keep");
        out.push({ name: outputName(f.name, fmt, sepia ? "-sepia" : "-bw"), blob: await pixelsToBlob(r.pixels!, fmt, 0.93), original: f });
        ctx.progress((i + 1) / files.length);
      }
      return out;
    });
  return (
    <div className="space-y-4">
      <Dropzone multiple accept={IMAGE_ACCEPT} maxSize={MAX_IMAGE_BYTES} formatsLabel="JPG, PNG, WebP, HEIC" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Black & white">
        <Settings>
          <Field label="Conversion method" hint={grayscaleMethods.find((m) => m.value === method)?.hint}>
            {(id) => (
              <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as GrayscaleMethod)}>
                {grayscaleMethods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            )}
          </Field>
          <Slider label="Strength" value={amount} min={0} max={100} onChange={setAmount} format={(v) => `${v}%`} />
          <Slider label="Sepia tone" value={sepia} min={0} max={100} onChange={setSepia} format={(v) => `${v}%`} />
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Convert to grayscale" running={task.running} disabled={!files.length} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Converting…" />
      <ErrorMessage error={task.error} />
      {task.result?.length ? (
        <>
          <CompareView before={task.result[0].original} after={task.result[0].blob} />
          <FileResults files={task.result} zipName="grayscale-images.zip" label="Grayscale images" />
        </>
      ) : null}
    </div>
  );
}
