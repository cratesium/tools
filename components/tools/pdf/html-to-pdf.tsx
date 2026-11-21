"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Segmented, Select, Slider, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { PAGE_SIZES } from "@/lib/processors/pdf/layout";
import type { ImageConverter } from "@/lib/processors/pdf/text-html-pdf";
import { useTask } from "@/lib/utils/hooks";
import { outName } from "./common";
import { PdfOutput, ReplacedCharsNotice } from "./helpers";

/** Converts GIF/WebP/SVG/BMP images to PNG via canvas so pdf-lib can embed them. */
export const canvasImageConverter: ImageConverter = async (data, mime) => {
  try {
    const bmp = await createImageBitmap(new Blob([data as BlobPart], { type: mime }));
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return b ? new Uint8Array(await b.arrayBuffer()) : null;
  } catch {
    return null;
  }
};

/** HTML to PDF (mode "html") and Word to PDF (mode "word", via mammoth .docx → HTML). */
export default function HtmlToPdf({ tool }: ToolComponentProps) {
  const word = tool.processorOptions?.mode === "word";
  const [src, setSrc] = useState<"file" | "paste">(word ? "file" : "paste");
  const [html, setHtml] = useState("<h1>Hello</h1>\n<p>Paste or write <strong>HTML</strong> here. Lists, tables, links and images (data URIs) are supported.</p>\n<ul><li>First</li><li>Second</li></ul>");
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState("a4");
  const [land, setLand] = useState(false);
  const [margin, setMargin] = useState(50);
  const [font, setFont] = useState(11);
  const task = useTask<{ bytes: Uint8Array; pages: number; replacedChars: number; skippedImages: number; warnings: string[] }>();
  const run = () =>
    task.run(async (ctx) => {
      let content = html;
      const warnings: string[] = [];
      if (src === "file") {
        if (!file) throw new Error(word ? "Choose a .docx file." : "Choose an HTML file.");
        if (word) {
          ctx.progress(null, "Reading Word document…");
          const mammoth = await import("mammoth");
          const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
          content = r.value;
          warnings.push(...r.messages.filter((m) => m.type === "warning").slice(0, 5).map((m) => m.message));
        } else content = await file.text();
      }
      ctx.progress(null, "Laying out pages…");
      const { htmlToPdf } = await import("@/lib/processors/pdf/text-html-pdf");
      const [w, h] = PAGE_SIZES[size];
      const r = await htmlToPdf(content, { pageSize: land ? [h, w] : [w, h], margin, fontSize: font, convertImage: canvasImageConverter, title: file?.name.replace(/\.[^.]+$/, "") });
      return { bytes: r.bytes, pages: r.pages, replacedChars: r.replacedChars, skippedImages: r.skippedImages + r.images.skipped, warnings };
    });
  return (
    <div className="space-y-4">
      {!word ? <Segmented label="Source" value={src} onChange={setSrc} options={[{ value: "paste", label: "Paste HTML" }, { value: "file", label: "Upload .html" }]} /> : null}
      {src === "paste" ? (
        <Panel title="HTML"><Textarea value={html} onChange={(e) => setHtml(e.target.value)} aria-label="HTML" data-testid="input" className="min-h-[220px]" /></Panel>
      ) : file ? (
        <FileList files={[file]} onClear={() => (setFile(null), task.reset())} />
      ) : (
        <Dropzone accept={word ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ".html,.htm,text/html"} formatsLabel={word ? "Word .docx" : "HTML file"} onFiles={([f]) => (setFile(f), task.reset())} />
      )}
      <Panel title="Page setup">
        <Settings>
          <Field label="Page size">
            {(id) => <Select id={id} value={size} onChange={(e) => setSize(e.target.value)}>{Object.keys(PAGE_SIZES).map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</Select>}
          </Field>
          <Field label="Orientation">
            {(id) => <Select id={id} value={land ? "l" : "p"} onChange={(e) => setLand(e.target.value === "l")}><option value="p">Portrait</option><option value="l">Landscape</option></Select>}
          </Field>
          <Slider label="Margin" value={margin} min={20} max={100} onChange={setMargin} format={(v) => `${v}pt`} />
          <Slider label="Body text size" value={font} min={8} max={16} onChange={setFont} format={(v) => `${v}pt`} />
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Convert to PDF" running={task.running} disabled={src === "file" ? !file : !html.trim()} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <PdfOutput bytes={task.result.bytes} name={outName(file?.name ?? "document", "")} label={`PDF (${task.result.pages} page${task.result.pages === 1 ? "" : "s"})`}>
          <ReplacedCharsNotice count={task.result.replacedChars} />
          {task.result.skippedImages ? <p className="text-xs text-fg-subtle">{task.result.skippedImages} image(s) couldn&apos;t be embedded (external URLs aren&apos;t fetched).</p> : null}
          {task.result.warnings.length ? <p className="text-xs text-fg-subtle">Conversion notes: {task.result.warnings.join("; ")}</p> : null}
        </PdfOutput>
      ) : null}
      <Alert tone="info">
        {word
          ? "The Word document is converted to structured HTML with mammoth and laid out as a new PDF with standard fonts: headings, paragraphs, lists, tables, links and embedded images are kept; exact fonts, headers/footers, columns and page layout are not."
          : "HTML is laid out by UtilityHub's own PDF engine with standard fonts: headings, paragraphs, lists, tables, links and images are supported; CSS layout (flexbox, columns, custom fonts) and JavaScript are not. For pixel-perfect output, use your browser's Print → Save as PDF."}
      </Alert>
    </div>
  );
}
