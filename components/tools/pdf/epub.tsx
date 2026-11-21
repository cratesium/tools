"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { PAGE_SIZES } from "@/lib/processors/pdf/layout";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput, ReplacedCharsNotice, ScannedNotice, extractAllText } from "./helpers";
import { canvasImageConverter } from "./html-to-pdf";
import type { PageText } from "@/lib/processors/pdf/text";

function PdfToEpub() {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [split, setSplit] = useState<"headings" | "pages">("headings");
  const [ppc, setPpc] = useState(10);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const task = useTask<{ epub: Uint8Array; chapters: number; pages: PageText[] }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!L) throw new Error("Add a PDF first.");
      const pages = await extractAllText(L, ctx, 0.8);
      const { pagesToChapters, buildEpub } = await import("@/lib/processors/pdf/epub");
      const chapters = pagesToChapters(pages, { split, pagesPerChapter: ppc });
      return { epub: await buildEpub({ title: title || L.file.name.replace(/\.pdf$/i, ""), author: author || undefined, language: "en" }, chapters), chapters: chapters.length, pages };
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title="Book details">
        <Settings>
          <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={L?.file.name.replace(/\.pdf$/i, "") ?? ""} data-testid="input" />}</Field>
          <Field label="Author">{(id) => <Input id={id} value={author} onChange={(e) => setAuthor(e.target.value)} />}</Field>
          <Field label="Chapters">{() => <Segmented label="Chapters" value={split} onChange={setSplit} options={[{ value: "headings", label: "At headings" }, { value: "pages", label: "Every N pages" }]} />}</Field>
          {split === "pages" ? <Slider label="Pages per chapter" value={ppc} min={1} max={50} onChange={setPpc} /> : null}
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Convert to EPUB" running={task.running} disabled={!L} onCancel={task.cancel} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <>
          <ScannedNotice pages={task.result.pages} />
          <FileResult blob={new Blob([task.result.epub as BlobPart], { type: "application/epub+zip" })} filename={outName(L.file.name, "", "epub")} preview={false} label="EPUB e-book">
            <p className="text-xs text-fg-muted" data-testid="output">{task.result.chapters} chapter{task.result.chapters === 1 ? "" : "s"} · valid EPUB 3 with navigation</p>
          </FileResult>
        </>
      ) : null}
      <Alert tone="info">The EPUB is reflowable text built from the PDF&apos;s text layer, so it adapts to any e-reader screen. Images, tables and exact layout are not carried over.</Alert>
    </div>
  );
}

function EpubToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState("a5");
  const [font, setFont] = useState(11);
  const task = useTask<{ bytes: Uint8Array; pages: number; replacedChars: number; title?: string }>();
  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Choose an EPUB file.");
      const [{ parseEpub }, { epubToPdf }] = await Promise.all([import("@/lib/processors/pdf/epub"), import("@/lib/processors/pdf/text-html-pdf")]);
      const epub = await parseEpub(await file.arrayBuffer());
      const r = await epubToPdf(epub, { pageSize: PAGE_SIZES[size], fontSize: font, convertImage: canvasImageConverter, onProgress: (d, t) => ctx.progress(d / t, `Chapter ${d} of ${t}`) });
      return { bytes: r.bytes, pages: r.pages, replacedChars: r.replacedChars, title: epub.title };
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept=".epub,application/epub+zip" formatsLabel="EPUB (DRM-free)" onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Page setup">
        <Settings>
          <Field label="Page size">{(id) => <Select id={id} value={size} onChange={(e) => setSize(e.target.value)}>{Object.keys(PAGE_SIZES).map((k) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</Select>}</Field>
          <Slider label="Text size" value={font} min={8} max={16} onChange={setFont} format={(v) => `${v}pt`} />
        </Settings>
      </Panel>
      <ActionBar onRun={run} runLabel="Convert to PDF" running={task.running} disabled={!file} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <PdfOutput bytes={task.result.bytes} name={outName(file.name, "")} label={`${task.result.title ?? "Book"} – ${task.result.pages} pages`}>
          <ReplacedCharsNotice count={task.result.replacedChars} />
        </PdfOutput>
      ) : null}
      <Alert tone="info">Chapters are laid out in reading order with headings, paragraphs, lists and embedded images. DRM-protected EPUBs can&apos;t be opened, and complex CSS styling is simplified.</Alert>
    </div>
  );
}

/** PDF to EPUB (mode "to-epub") and EPUB to PDF (mode "from-epub"). */
export default function EpubTool({ tool }: ToolComponentProps) {
  return tool.processorOptions?.mode === "from-epub" ? <EpubToPdf /> : <PdfToEpub />;
}
