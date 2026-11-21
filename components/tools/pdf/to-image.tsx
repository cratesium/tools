"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select, Slider } from "@/components/ui/field";
import { ActionBar, ErrorMessage, FileResults, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { pagesFrom } from "./helpers";

/** PDF to JPG / PNG (processorOptions.format). */
export default function PdfToImage({ tool }: ToolComponentProps) {
  const format = (tool.processorOptions?.format as "jpg" | "png") ?? "jpg";
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(90);
  const [pages, setPages] = useState("");
  const task = useTask<{ name: string; blob: Blob }[]>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const { renderPage, canvasToBlob, releaseCanvas } = await import("@/lib/processors/pdf/pdfjs");
      const list = await pagesFrom(pages, L.pageCount);
      const out = [];
      const pad = String(L.pageCount).length;
      for (let i = 0; i < list.length; i++) {
        if (ctx.signal.aborted) break;
        const page = await L.doc.getPage(list[i]);
        const canvas = await renderPage(page, dpi / 72, { background: "#ffffff" });
        out.push({ name: outName(L.file.name, `-page-${String(list[i]).padStart(pad, "0")}`, format), blob: await canvasToBlob(canvas, format === "jpg" ? "image/jpeg" : "image/png", quality / 100) });
        releaseCanvas(canvas);
        page.cleanup();
        ctx.progress((i + 1) / list.length, `Rendering page ${list[i]}`);
      }
      return out;
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title="Image settings">
        <Settings>
          <Field label="Resolution">
            {(id) => (
              <Select id={id} value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                <option value={72}>72 dpi (screen, small)</option>
                <option value={150}>150 dpi (recommended)</option>
                <option value={220}>220 dpi (sharp)</option>
                <option value={300}>300 dpi (print)</option>
              </Select>
            )}
          </Field>
          {format === "jpg" ? <Slider label="JPG quality" value={quality} min={40} max={100} onChange={setQuality} format={(v) => `${v}%`} /> : null}
          <Field label="Pages" hint="empty = all">{(id) => <Input id={id} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 1-5" data-testid="input" />}</Field>
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel={`Convert to ${format.toUpperCase()}`} running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResults files={task.result} zipName={outName(L?.file.name, `-${format}`, "zip")} label="Page images" /> : null}
    </div>
  );
}
