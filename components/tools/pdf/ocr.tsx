"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, TaskProgress, TextOutput } from "@/components/tools/shared";
import { OCR_LANGUAGES, type OcrResult } from "@/lib/processors/pdf/ocr";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, ReplacedCharsNotice, pagesFrom } from "./helpers";

export default function OcrPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [lang, setLang] = useState("eng");
  const [dpi, setDpi] = useState(200);
  const [pages, setPages] = useState("");
  const task = useTask<OcrResult>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const { ocrPdf } = await import("@/lib/processors/pdf/ocr");
      return ocrPdf(L.doc, { lang, scale: dpi / 72, pages: await pagesFrom(pages, L.pageCount), signal: ctx.signal, onProgress: (f, l) => ctx.progress(f, l) });
    });
  const r = task.result;
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} hint="Scanned PDF" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Document language">{(id) => <Select id={id} value={lang} onChange={(e) => setLang(e.target.value)}>{OCR_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</Select>}</Field>
        <Field label="Scan resolution">{(id) => <Select id={id} value={dpi} onChange={(e) => setDpi(Number(e.target.value))}><option value={150}>150 dpi (fast)</option><option value={200}>200 dpi (recommended)</option><option value={300}>300 dpi (small text)</option></Select>}</Field>
        <Field label="Pages" hint="empty = all">{(id) => <Input id={id} value={pages} onChange={(e) => setPages(e.target.value)} placeholder="e.g. 1-10" data-testid="input" />}</Field>
      </div>
      <ActionBar onRun={run} runLabel="Run OCR" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {r && L ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pages recognised" value={r.pages} />
            <Stat label="Words" value={r.words.toLocaleString()} />
            <Stat label="Average confidence" value={`${Math.round(r.meanConfidence)}%`} />
          </div>
          <PdfOutput bytes={r.pdf} name={outName(L.file.name, "-searchable")} label="Searchable PDF">
            <ReplacedCharsNotice count={r.replacedChars} />
          </PdfOutput>
          <TextOutput value={r.text} filename={outName(L.file.name, "-ocr", "txt")} label="Recognised text" rows={12} />
        </>
      ) : null}
      <Alert tone="info">OCR runs on your device with Tesseract.js. The engine and language data (a few MB per language) download from jsDelivr on first use; your document is never uploaded. The output PDF contains the page images with an invisible, selectable text layer.</Alert>
    </div>
  );
}
