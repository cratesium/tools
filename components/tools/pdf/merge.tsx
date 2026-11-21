"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Input } from "@/components/ui/field";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import type { PDFDocumentProxy } from "@/lib/processors/pdf/pdfjs";
import { MAX_PDF_SIZE, PDF_ACCEPT, PageThumbnail, closeDoc, moveItem } from "./common";
import { PdfOutput } from "./helpers";

type Item = { id: string; file: File; bytes: Uint8Array; doc: PDFDocumentProxy | null; pages: number; range: string; password?: string; error?: string };

let uid = 0;

export default function MergePdf(_props: ToolComponentProps) {
  const [items, setItems] = useState<Item[]>([]);
  const task = useTask<Uint8Array>();
  const docs = useRef<PDFDocumentProxy[]>([]);
  useEffect(() => () => docs.current.forEach(closeDoc), []);

  const add = async (files: File[]) => {
    task.reset();
    const { openPdfjs } = await import("@/lib/processors/pdf/pdfjs");
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const id = `f${uid++}`;
      try {
        const doc = await openPdfjs(bytes);
        docs.current.push(doc);
        setItems((p) => [...p, { id, file: f, bytes, doc, pages: doc.numPages, range: "" }]);
      } catch (e) {
        setItems((p) => [...p, { id, file: f, bytes, doc: null, pages: 0, range: "", error: (e as Error).name === "PdfPasswordError" ? "Password-protected – unlock it first with Unlock PDF." : (e as Error).message }]);
      }
    }
  };

  const run = () =>
    task.run(async (ctx) => {
      const ok = items.filter((i) => !i.error);
      if (ok.length < 1) throw new Error("Add at least two PDFs.");
      const { mergePdfs } = await import("@/lib/processors/pdf/organize");
      const { parsePageRanges } = await import("@/lib/processors/pdf/ranges");
      const inputs = ok.map((i) => ({ bytes: i.bytes, pages: i.range.trim() ? parsePageRanges(i.range, i.pages, { dedupe: false }) : undefined }));
      return mergePdfs(inputs, (d, t) => ctx.progress(d / t, `Merging file ${d} of ${t}`));
    });

  const total = items.reduce((s, i) => s + i.pages, 0);

  return (
    <div className="space-y-4">
      <Dropzone multiple accept={PDF_ACCEPT} maxSize={MAX_PDF_SIZE} formatsLabel="PDF files – add two or more" onFiles={add} />
      {items.length ? (
        <Panel title={`Files in merge order (${items.length} files · ${total} pages)`}>
          <ol className="divide-y divide-border" data-testid="output">
            {items.map((it, i) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-5 text-xs text-fg-subtle">{i + 1}.</span>
                {it.doc ? <PageThumbnail doc={it.doc} pageNumber={1} width={44} /> : <span className="h-14 w-11 rounded border border-dashed border-border" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">{it.file.name}</div>
                  <div className="text-xs text-fg-subtle">{it.error ? <span className="text-danger">{it.error}</span> : `${it.pages} pages · ${formatBytes(it.file.size)}`}</div>
                </div>
                {!it.error ? (
                  <Input
                    value={it.range}
                    onChange={(e) => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, range: e.target.value } : x)))}
                    placeholder="All pages (or e.g. 1-3, 5)"
                    aria-label={`Pages of ${it.file.name}`}
                    className="h-8 w-48 text-xs"
                  />
                ) : null}
                <div className="flex">
                  <button className="rounded p-1.5 hover:bg-bg-muted disabled:opacity-30" aria-label="Move up" disabled={i === 0} onClick={() => setItems((p) => moveItem(p, i, i - 1))}><ArrowUp className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 hover:bg-bg-muted disabled:opacity-30" aria-label="Move down" disabled={i === items.length - 1} onClick={() => setItems((p) => moveItem(p, i, i + 1))}><ArrowDown className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 hover:bg-bg-muted" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}><X className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
      <ActionBar onRun={run} runLabel="Merge PDFs" running={task.running} disabled={items.filter((i) => !i.error).length < 2} onReset={() => (setItems([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? <PdfOutput bytes={task.result} name="merged.pdf" label="Merged PDF" /> : null}
    </div>
  );
}
