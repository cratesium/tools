"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, FileResults, Panel, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";

export default function ExtractImages(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [minSize, setMinSize] = useState(32);
  const task = useTask<{ files: { name: string; blob: Blob }[]; skipped: number; total: number }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const { extractImages } = await import("@/lib/processors/pdf/images");
      const r = await extractImages(L.bytes, { password: L.password, minSize, onProgress: (d, t) => ctx.progress(d / t, `Image ${d} of ${t}`) });
      const files = [];
      for (const img of r.images) {
        if (img.encoded) files.push({ name: `page${img.page}-${img.key}.${img.encoded.ext}`, blob: new Blob([img.encoded.data as BlobPart], { type: img.encoded.mime }) });
        else if (img.rgba) {
          const c = document.createElement("canvas");
          c.width = img.rgba.width;
          c.height = img.rgba.height;
          c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.rgba.data), img.rgba.width, img.rgba.height), 0, 0);
          files.push({ name: `page${img.page}-${img.key}.png`, blob: await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png")) });
        }
      }
      return { files, skipped: r.skipped.length, total: r.total };
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Field label="Ignore images smaller than" className="max-w-xs">
        {(id) => (
          <Select id={id} value={minSize} onChange={(e) => setMinSize(Number(e.target.value))}>
            <option value={1}>Keep everything</option>
            <option value={32}>32 px (skip tiny icons)</option>
            <option value={100}>100 px</option>
            <option value={300}>300 px (photos only)</option>
          </Select>
        )}
      </Field>
      <ActionBar onRun={run} runLabel="Extract images" running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        task.result.files.length ? (
          <>
            <FileResults files={task.result.files} zipName={outName(L?.file.name, "-images", "zip")} label="Extracted images" />
            {task.result.skipped ? <p className="text-xs text-fg-subtle">{task.result.skipped} image(s) used formats that can&apos;t be decoded in the browser (e.g. JBIG2 or CCITT fax) and were skipped.</p> : null}
          </>
        ) : (
          <Alert tone="info">No embedded images {minSize > 1 ? `of at least ${minSize}px ` : ""}were found. Vector drawings and text are not images – use PDF to PNG to capture whole pages.</Alert>
        )
      ) : null}
      <Panel title="How it works"><p className="text-sm text-fg-muted">JPEG and JPEG 2000 images are saved exactly as embedded (no quality loss). Other images are decoded and saved as PNG, including transparency masks where present.</p></Panel>
    </div>
  );
}
