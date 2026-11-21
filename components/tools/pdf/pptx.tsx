"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, ReplacedCharsNotice } from "./helpers";

function PdfToPptx() {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [dpi, setDpi] = useState(150);
  const [notes, setNotes] = useState(true);
  const task = useTask<Uint8Array>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const [{ renderPage, canvasToBytes, releaseCanvas }, { imagesToPptx }, text] = await Promise.all([import("@/lib/processors/pdf/pdfjs"), import("@/lib/processors/pdf/office-pptx-out"), import("@/lib/processors/pdf/text")]);
      const slides = [];
      for (let p = 1; p <= L.pageCount; p++) {
        const page = await L.doc.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const c = await renderPage(page, dpi / 72);
        slides.push({ data: await canvasToBytes(c, "image/jpeg", 0.88), mime: "image/jpeg" as const, widthPt: vp.width, heightPt: vp.height, notes: notes ? text.pageToText(await text.getPageText(L.doc, p)) : undefined });
        releaseCanvas(c);
        ctx.progress(p / L.pageCount, `Slide ${p} of ${L.pageCount}`);
      }
      return imagesToPptx(slides, { title: L.file.name.replace(/\.pdf$/i, "") });
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <div className="flex flex-wrap items-end gap-5">
        <Field label="Slide image quality" className="w-56">{(id) => <Select id={id} value={dpi} onChange={(e) => setDpi(Number(e.target.value))}><option value={110}>Standard (smaller file)</option><option value={150}>High</option><option value={220}>Very high</option></Select>}</Field>
        <Checkbox label="Put each page's text in speaker notes" checked={notes} onChange={setNotes} />
      </div>
      <ActionBar onRun={run} runLabel="Convert to PowerPoint" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && L ? <FileResult blob={new Blob([task.result as BlobPart], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })} filename={outName(L.file.name, "", "pptx")} preview={false} label="PowerPoint presentation" /> : null}
      <Alert tone="info">Each PDF page becomes a slide containing a high-resolution image of the page, so it looks exactly like the PDF; slide text isn&apos;t editable (the page text can be added to speaker notes for searching and copying).</Alert>
    </div>
  );
}

function PptxToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const task = useTask<{ bytes: Uint8Array; pages: number; replacedChars: number; skipped: number }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Choose a .pptx file.");
      ctx.progress(null, "Reading slides…");
      const { parsePptx, pptxToPdf } = await import("@/lib/processors/pdf/office-pptx");
      const parsed = await parsePptx(await file.arrayBuffer());
      ctx.progress(null, `Drawing ${parsed.slides.length} slides…`);
      const r = await pptxToPdf(parsed);
      return { ...r, skipped: parsed.skippedImages + parsed.skippedObjects };
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" formatsLabel="PowerPoint .pptx" onFiles={([f]) => (setFile(f), task.reset())} />}
      <ActionBar onRun={run} runLabel="Convert to PDF" running={task.running} disabled={!file} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <PdfOutput bytes={task.result.bytes} name={outName(file.name, "")} label={`PDF – ${task.result.pages} slide(s)`}>
          <ReplacedCharsNotice count={task.result.replacedChars} />
          {task.result.skipped ? <p className="text-xs text-fg-subtle">{task.result.skipped} element(s) such as charts, SmartArt, video or unsupported images were left out.</p> : null}
        </PdfOutput>
      ) : null}
      <Alert tone="info">Slides are rebuilt in your browser from the PPTX file: text boxes, basic shapes, fills and pictures are drawn at their positions with standard fonts. Charts, SmartArt, animations, gradients, custom fonts and theme effects are not rendered, so complex decks will look simplified.</Alert>
    </div>
  );
}

/** PDF to PowerPoint (mode "to-pptx") and PowerPoint to PDF (mode "from-pptx"). */
export default function PptxTool({ tool }: ToolComponentProps) {
  return tool.processorOptions?.mode === "from-pptx" ? <PptxToPdf /> : <PdfToPptx />;
}
