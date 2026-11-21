"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { ActionBar, DownloadButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { ScannedNotice, extractAllText } from "./helpers";
import type { PageText } from "@/lib/processors/pdf/text";

export default function PdfToHtml(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [mode, setMode] = useState<"semantic" | "positioned">("semantic");
  const [bg, setBg] = useState(false);
  const task = useTask<{ html: string; pages: PageText[] }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const pages = await extractAllText(L, ctx, mode === "positioned" && bg ? 0.4 : 0.9);
      const m = await import("@/lib/processors/pdf/html-export");
      const title = L.file.name.replace(/\.pdf$/i, "");
      if (mode === "semantic") return { html: m.pagesToSemanticHtml(pages, { title }), pages };
      let backgrounds: string[] | undefined;
      if (bg) {
        const { renderPage, releaseCanvas } = await import("@/lib/processors/pdf/pdfjs");
        backgrounds = [];
        for (let p = 1; p <= L.pageCount; p++) {
          const c = await renderPage(await L.doc.getPage(p), 1.5);
          backgrounds.push(c.toDataURL("image/jpeg", 0.7));
          releaseCanvas(c);
          ctx.progress(0.4 + (p / L.pageCount) * 0.6, `Rendering page ${p} background`);
        }
      }
      return { html: m.pagesToPositionedHtml(pages, { title, backgrounds }), pages };
    });
  const blob = task.result ? new Blob([task.result.html], { type: "text/html" }) : null;
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <div className="flex flex-wrap items-center gap-4">
        <Segmented label="Output" value={mode} onChange={setMode} options={[{ value: "semantic", label: "Clean HTML (reflowable)" }, { value: "positioned", label: "Positioned (looks like the PDF)" }]} />
        {mode === "positioned" ? <Checkbox label="Include page images as backgrounds" checked={bg} onChange={setBg} /> : null}
      </div>
      <ActionBar onRun={run} runLabel="Convert to HTML" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && L && blob ? (
        <>
          <ScannedNotice pages={task.result.pages} />
          <Panel title="Preview" actions={<DownloadButton blob={blob} filename={outName(L.file.name, "", "html")} size="sm" />}>
            <iframe title="HTML preview" sandbox="" srcDoc={task.result.html} className="h-[520px] w-full rounded-lg border border-border bg-white" data-testid="output" />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
