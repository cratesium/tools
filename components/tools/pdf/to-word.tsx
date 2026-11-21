"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, FileResult, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { ScannedNotice, extractAllText } from "./helpers";
import type { PageText } from "@/lib/processors/pdf/text";

export default function PdfToWord(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [breaks, setBreaks] = useState(true);
  const [sizes, setSizes] = useState(true);
  const task = useTask<{ docx: Uint8Array; pages: PageText[]; stats: { paragraphs: number; headings: number } }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const pages = await extractAllText(L, ctx, 0.8);
      const { pagesToWordModel, buildDocx, modelStats } = await import("@/lib/processors/pdf/office-word");
      const model = pagesToWordModel(pages);
      ctx.progress(0.9, "Writing .docx…");
      const s = modelStats(model) as { paragraphs: number; headings: number };
      return { docx: await buildDocx(model, { pageBreaks: breaks, keepFontSizes: sizes, title: L.file.name.replace(/\.pdf$/i, "") }), pages, stats: s };
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <div className="flex flex-wrap gap-5">
        <Checkbox label="Page break after each PDF page" checked={breaks} onChange={setBreaks} />
        <Checkbox label="Keep font sizes" checked={sizes} onChange={setSizes} />
      </div>
      <ActionBar onRun={run} runLabel="Convert to Word" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <>
          <ScannedNotice pages={task.result.pages} />
          <FileResult blob={new Blob([task.result.docx as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })} filename={outName(L.file.name, "", "docx")} preview={false} label="Word document">
            <p className="text-xs text-fg-muted" data-testid="output">{task.result.stats.paragraphs ?? 0} paragraphs, {task.result.stats.headings ?? 0} headings detected.</p>
          </FileResult>
        </>
      ) : null}
      <Alert tone="info">This is a text-based conversion done in your browser: paragraphs, headings and bullet lists are rebuilt as editable Word text. Images, columns, tables and exact fonts or positions are not preserved. For a pixel-perfect copy, use PDF to JPG/PNG.</Alert>
    </div>
  );
}
