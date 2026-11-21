"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { Badge, Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import type { PageComparison } from "@/lib/processors/pdf/compare";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, usePdfLoader } from "./common";
import { extractAllText } from "./helpers";
import { cn } from "@/lib/utils/cn";

type Visual = { page: number; url: string; ratio: number };

export default function ComparePdf(_props: ToolComponentProps) {
  const a = usePdfLoader();
  const b = usePdfLoader();
  const [ic, setIc] = useState(false);
  const [iw, setIw] = useState(true);
  const [visual, setVisual] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const task = useTask<{ pages: PageComparison[]; visuals: Visual[] }>();
  const run = () =>
    task.run(async (ctx) => {
      const A = a.loaded;
      const B = b.loaded;
      if (!A || !B) throw new Error("Add both PDFs.");
      const [{ comparePageTexts, pixelDiff }, { pageToText }] = await Promise.all([import("@/lib/processors/pdf/compare"), import("@/lib/processors/pdf/text")]);
      const ta = await extractAllText(A, ctx, 0.3);
      const tb = await extractAllText(B, { ...ctx, progress: (f, l) => ctx.progress(0.3 + (f ?? 0) * 0.3, l) }, 1);
      const pages = comparePageTexts(ta.map(pageToText), tb.map(pageToText), { ignoreCase: ic, ignoreWhitespace: iw });
      const visuals: Visual[] = [];
      if (visual) {
        const { renderPage, releaseCanvas } = await import("@/lib/processors/pdf/pdfjs");
        const n = Math.min(A.pageCount, B.pageCount, 50);
        for (let p = 1; p <= n; p++) {
          const [pa, pb] = await Promise.all([A.doc.getPage(p), B.doc.getPage(p)]);
          const ca = await renderPage(pa, 1);
          const cb = await renderPage(pb, ca.width / pb.getViewport({ scale: 1 }).width);
          if (ca.width === cb.width && ca.height === cb.height) {
            const da = ca.getContext("2d")!.getImageData(0, 0, ca.width, ca.height).data;
            const db = cb.getContext("2d")!.getImageData(0, 0, cb.width, cb.height).data;
            const r = pixelDiff(da, db, ca.width, ca.height);
            if (r.changed) {
              ca.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), ca.width, ca.height), 0, 0);
              visuals.push({ page: p, url: ca.toDataURL("image/png"), ratio: r.ratio });
            }
          }
          releaseCanvas(cb);
          ctx.progress(0.6 + (p / n) * 0.4, `Comparing page ${p} visually`);
        }
      }
      return { pages, visuals };
    });
  const r = task.result;
  const added = r?.pages.reduce((s, p) => s + p.added, 0) ?? 0;
  const removed = r?.pages.reduce((s, p) => s + p.removed, 0) ?? 0;
  const changedPages = r?.pages.filter((p) => p.added || p.removed || p.missing) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Original (A)"><PdfPicker loader={a} /></Panel>
        <Panel title="Revised (B)"><PdfPicker loader={b} /></Panel>
      </div>
      <div className="flex flex-wrap gap-5">
        <Checkbox label="Ignore case" checked={ic} onChange={setIc} />
        <Checkbox label="Ignore whitespace differences" checked={iw} onChange={setIw} />
        <Checkbox label="Visual comparison (first 50 pages)" checked={visual} onChange={setVisual} />
      </div>
      <ActionBar onRun={run} runLabel="Compare PDFs" running={task.running} disabled={!a.loaded || !b.loaded} onCancel={task.cancel} onReset={() => (a.reset(), b.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {r ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Pages with changes" value={changedPages.length} />
            <Stat label="Lines added" value={added} />
            <Stat label="Lines removed" value={removed} />
          </div>
          <Panel title="Text changes" actions={<Checkbox label="Only changed pages" checked={onlyDiff} onChange={setOnlyDiff} />}>
            <div className="max-h-[560px] space-y-4 overflow-auto" data-testid="output">
              {(onlyDiff ? changedPages : r.pages).map((p) => (
                <div key={p.page}>
                  <p className="mb-1 flex items-center gap-2 text-sm font-medium">
                    Page {p.page} {p.missing ? <Badge className="text-warning">only in {p.missing === "a" ? "B" : "A"}</Badge> : <Badge>+{p.added} / −{p.removed}</Badge>}
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-bg-subtle p-2 font-mono text-xs leading-relaxed">
                    {p.ops.filter((o) => !onlyDiff || o.type !== "same").slice(0, 400).map((o, i) => (
                      <div key={i} className={cn(o.type === "add" && "bg-success-bg text-success", o.type === "del" && "bg-danger-bg text-danger line-through")}>{o.type === "add" ? "+ " : o.type === "del" ? "− " : "  "}{o.text}</div>
                    ))}
                  </pre>
                </div>
              ))}
              {!changedPages.length ? <p className="text-sm text-success">No text differences found.</p> : null}
            </div>
          </Panel>
          {r.visuals.length ? (
            <Panel title="Visual differences (changed pixels in red)">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {r.visuals.map((v) => (
                  <figure key={v.page} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt={`Differences on page ${v.page}`} className="w-full rounded border border-border" />
                    <figcaption className="text-xs text-fg-muted">Page {v.page} · {(v.ratio * 100).toFixed(2)}% of pixels changed</figcaption>
                  </figure>
                ))}
              </div>
            </Panel>
          ) : visual ? <p className="text-sm text-fg-muted">No visual differences on pages present in both files (pages of different sizes are skipped).</p> : null}
        </>
      ) : null}
    </div>
  );
}
