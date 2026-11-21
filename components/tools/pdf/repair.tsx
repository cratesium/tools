"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, TaskProgress } from "@/components/tools/shared";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { MAX_PDF_SIZE, PDF_ACCEPT, outName } from "./common";
import { PdfOutput } from "./helpers";

type Res = { bytes: Uint8Array; method: "rebuild" | "raster"; pages: number; notes: string[] };

export default function RepairPdf(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const task = useTask<Res>();
  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Add the damaged PDF.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const notes: string[] = [];
      const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
      const start = head.indexOf("%PDF-");
      if (start < 0) throw new Error("No %PDF header found – this file isn't a PDF or is too badly damaged to recover.");
      const data = start > 0 ? bytes.subarray(start) : bytes;
      if (start > 0) notes.push(`Removed ${start} junk bytes before the PDF header.`);
      if (!new TextDecoder("latin1").decode(data.subarray(Math.max(0, data.length - 2048))).includes("%%EOF")) notes.push("The file was truncated (missing %%EOF); the cross-reference table was rebuilt.");
      ctx.progress(null, "Rebuilding structure with pdf-lib…");
      try {
        const { loadPdf, savePdf } = await import("@/lib/processors/pdf/load");
        const doc = await loadPdf(data, { lenient: true });
        const pages = doc.getPageCount();
        if (!pages) throw new Error("No pages recovered");
        return { bytes: await savePdf(doc), method: "rebuild", pages, notes };
      } catch (e) {
        notes.push(`Structural rebuild failed (${errorMessage(e)}); recovered pages by rendering them.`);
      }
      ctx.progress(null, "Rendering recoverable pages with PDF.js…");
      const [{ openPdfjs }, { rasterizeToPdf }] = await Promise.all([import("@/lib/processors/pdf/pdfjs"), import("@/lib/processors/pdf/edit-raster")]);
      const doc = await openPdfjs(data);
      try {
        const r = await rasterizeToPdf(doc, { dpi: 150, format: "jpeg", quality: 0.9, signal: ctx.signal, onProgress: (f, l) => ctx.progress(f, l) });
        if (r.failedPages.length) notes.push(`${r.failedPages.length} page(s) could not be rendered: ${r.failedPages.slice(0, 10).join(", ")}.`);
        return { bytes: r.bytes, method: "raster", pages: doc.numPages - r.failedPages.length, notes };
      } finally {
        void doc.loadingTask.destroy();
      }
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept={PDF_ACCEPT} maxSize={MAX_PDF_SIZE} formatsLabel="Damaged or unreadable PDF" onFiles={([f]) => (setFile(f), task.reset())} />}
      <ActionBar onRun={run} runLabel="Repair PDF" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <PdfOutput bytes={task.result.bytes} name={outName(file.name, "-repaired")} original={file.size} label={`Repaired PDF – ${task.result.pages} page(s)`}>
          <p className="text-xs text-fg-muted" data-testid="output">Method: {task.result.method === "rebuild" ? "structure rebuilt (text and links preserved)" : "pages re-rendered as images (text no longer selectable)"}.</p>
          {task.result.notes.map((n) => <p key={n} className="text-xs text-fg-subtle">{n}</p>)}
        </PdfOutput>
      ) : null}
      <Alert tone="info">Repair first rebuilds the file structure leniently, skipping broken objects (keeps text). If that fails, PDF.js – which tolerates heavy damage – renders whatever pages it can into a new PDF. Content that is genuinely missing from the file cannot be recovered.</Alert>
    </div>
  );
}
