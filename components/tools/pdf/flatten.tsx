"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

export default function FlattenPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [mode, setMode] = useState<"forms" | "raster">("forms");
  const [dpi, setDpi] = useState(150);
  const task = useTask<{ bytes: Uint8Array; fields: number; annots: number }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      if (mode === "raster") {
        const { rasterizeToPdf } = await import("@/lib/processors/pdf/edit-raster");
        const r = await rasterizeToPdf(L.doc, { dpi, format: "jpeg", quality: 0.9, signal: ctx.signal, onProgress: (f, l) => ctx.progress(f, l) });
        return { bytes: r.bytes, fields: -1, annots: -1 };
      }
      const [{ loadPdf, savePdf }, lib] = await Promise.all([import("@/lib/processors/pdf/load"), import("@cantoo/pdf-lib")]);
      const doc = await loadPdf(L.bytes, { password: L.password });
      const form = doc.getForm();
      const fields = form.getFields().length;
      if (fields) {
        form.updateFieldAppearances(await doc.embedFont(lib.StandardFonts.Helvetica));
        form.flatten();
      }
      // Remove remaining widget annotations (orphaned form widgets) so nothing stays interactive.
      let annots = 0;
      for (const page of doc.getPages()) {
        const arr = page.node.Annots();
        if (!arr) continue;
        for (let i = arr.size() - 1; i >= 0; i--) {
          const a = arr.lookup(i, lib.PDFDict);
          if (a.get(lib.PDFName.of("Subtype"))?.toString() === "/Widget") {
            arr.remove(i);
            annots++;
          }
        }
      }
      return { bytes: await savePdf(doc), fields, annots };
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: "forms", label: "Flatten form fields (keeps text)" }, { value: "raster", label: "Flatten everything (convert pages to images)" }]} />
      {mode === "raster" ? (
        <Select aria-label="Resolution" value={dpi} onChange={(e) => setDpi(Number(e.target.value))} className="max-w-xs">
          <option value={110}>110 dpi (small)</option>
          <option value={150}>150 dpi (recommended)</option>
          <option value={220}>220 dpi (sharp)</option>
        </Select>
      ) : null}
      <ActionBar onRun={run} runLabel="Flatten PDF" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel ?? "Flattening…"} />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <PdfOutput bytes={task.result.bytes} name={outName(L.file.name, "-flattened")} original={L.file.size} label="Flattened PDF">
          <p className="text-xs text-fg-muted" data-testid="output">{task.result.fields >= 0 ? `${task.result.fields} form field(s) flattened${task.result.annots ? `, ${task.result.annots} widget annotation(s) removed` : ""}.` : "Every page was rendered to an image – nothing remains editable."}</p>
        </PdfOutput>
      ) : null}
      <Alert tone="info">Form flattening keeps text selectable and the file small. Full flattening also bakes in comments, stamps and drawings, but text is no longer selectable (run OCR PDF afterwards if needed).</Alert>
    </div>
  );
}
