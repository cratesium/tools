"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Select, Slider } from "@/components/ui/field";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import type { ImagesToPdfOptions } from "@/lib/processors/pdf/from-images";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { moveItem } from "./common";
import { PdfOutput } from "./helpers";

/** JPG to PDF / PNG to PDF (processorOptions.accept), any other image type is converted via canvas. */
export default function ImagesToPdf({ tool }: ToolComponentProps) {
  const accept = (tool.processorOptions?.accept as string) ?? "image/*";
  const [files, setFiles] = useState<File[]>([]);
  const [o, setO] = useState<ImagesToPdfOptions>({ pageSize: "a4", orientation: "auto", margin: 24 });
  const task = useTask<Uint8Array>();
  const run = () =>
    task.run(async (ctx) => {
      if (!files.length) throw new Error("Add at least one image.");
      const { imagesToPdf, detectImageMime } = await import("@/lib/processors/pdf/from-images");
      const inputs = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const mime = detectImageMime(bytes);
        if (mime) inputs.push({ bytes, mime });
        else {
          // WebP, GIF, BMP, HEIC…: re-encode as PNG through a canvas first.
          const bmp = await createImageBitmap(f);
          const c = document.createElement("canvas");
          c.width = bmp.width;
          c.height = bmp.height;
          c.getContext("2d")!.drawImage(bmp, 0, 0);
          bmp.close();
          const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(`Could not read ${f.name}`))), "image/png"));
          inputs.push({ bytes: new Uint8Array(await png.arrayBuffer()), mime: "image/png" as const });
        }
      }
      return imagesToPdf(inputs, { ...o, title: files[0].name.replace(/\.[^.]+$/, "") }, (d, t) => ctx.progress(d / t, `Adding image ${d} of ${t}`));
    });
  return (
    <div className="space-y-4">
      <Dropzone multiple accept={accept} formatsLabel={accept === "image/*" ? "Images" : accept.replace(/[.]/g, "").toUpperCase()} onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      {files.length ? (
        <Panel title={`Pages in order (${files.length})`}>
          <ol className="divide-y divide-border text-sm" data-testid="output">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 py-1.5">
                <span className="w-6 text-xs text-fg-subtle">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="font-mono text-xs text-fg-subtle">{formatBytes(f.size)}</span>
                <button className="rounded p-1 hover:bg-bg-muted disabled:opacity-30" aria-label="Move up" disabled={!i} onClick={() => setFiles((p) => moveItem(p, i, i - 1))}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1 hover:bg-bg-muted disabled:opacity-30" aria-label="Move down" disabled={i === files.length - 1} onClick={() => setFiles((p) => moveItem(p, i, i + 1))}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1 hover:bg-bg-muted" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
      <Panel title="Page layout">
        <Settings>
          <Field label="Page size">
            {(id) => (
              <Select id={id} value={o.pageSize} onChange={(e) => setO({ ...o, pageSize: e.target.value as ImagesToPdfOptions["pageSize"] })}>
                <option value="fit">Same as image</option>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
                <option value="legal">US Legal</option>
                <option value="a3">A3</option>
                <option value="a5">A5</option>
              </Select>
            )}
          </Field>
          <Field label="Orientation">
            {(id) => (
              <Select id={id} value={o.orientation} onChange={(e) => setO({ ...o, orientation: e.target.value as ImagesToPdfOptions["orientation"] })} disabled={o.pageSize === "fit"}>
                <option value="auto">Automatic (match each image)</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </Select>
            )}
          </Field>
          {o.pageSize !== "fit" ? <Slider label="Margin" value={o.margin} min={0} max={72} onChange={(v) => setO({ ...o, margin: v })} format={(v) => `${v}pt`} /> : null}
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Create PDF" running={task.running} disabled={!files.length} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <PdfOutput bytes={task.result} name={`${files[0]?.name.replace(/\.[^.]+$/, "") ?? "images"}.pdf`} label="PDF" /> : null}
    </div>
  );
}
