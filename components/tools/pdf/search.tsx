"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { useDebounced, useTask } from "@/lib/utils/hooks";
import type { SearchResult } from "@/lib/processors/pdf/search";
import { PdfPicker, PageThumbnail, usePdfLoader } from "./common";
import { ScannedNotice, extractAllText } from "./helpers";
import type { PageText } from "@/lib/processors/pdf/text";
import { useEffect } from "react";

export default function SearchPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [q, setQ] = useState("");
  const [cs, setCs] = useState(false);
  const [ww, setWw] = useState(false);
  const [page, setPage] = useState<number | null>(null);
  const text = useTask<{ pages: PageText[]; plain: { page: number; text: string }[] }>();
  const dq = useDebounced(q, 200);
  const [res, setRes] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (!L) return;
    void text.run(async (ctx) => {
      const pages = await extractAllText(L, ctx);
      const { pageToText } = await import("@/lib/processors/pdf/text");
      return { pages, plain: pages.map((p) => ({ page: p.page, text: pageToText(p) })) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);
  useEffect(() => {
    if (!text.result || !dq.trim()) return;
    import("@/lib/processors/pdf/search").then((m) => setRes(m.searchPages(text.result!.plain, dq, { caseSensitive: cs, wholeWord: ww, context: 60, limit: 1000 })));
  }, [text.result, dq, cs, ww]);

  const shown = dq.trim() ? res : null;
  const byPage = useMemo(() => {
    const m = new Map<number, number>();
    shown?.hits.forEach((h) => m.set(h.page, (m.get(h.page) ?? 0) + 1));
    return m;
  }, [shown]);

  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <TaskProgress running={text.running} progress={text.progress} label={text.progressLabel} />
      <ErrorMessage error={text.error} />
      {text.result ? (
        <>
          <ScannedNotice pages={text.result.pages} />
          <div className="flex flex-wrap items-center gap-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words or phrases…" aria-label="Search text" data-testid="input" className="max-w-md" />
            <Checkbox label="Match case" checked={cs} onChange={setCs} />
            <Checkbox label="Whole words" checked={ww} onChange={setWw} />
          </div>
          {shown ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <Panel title={<span className="flex items-center gap-2">{shown.total} match{shown.total === 1 ? "" : "es"} <Badge>{shown.pagesWithHits} page{shown.pagesWithHits === 1 ? "" : "s"}</Badge></span>}>
                <ul className="max-h-[520px] space-y-2 overflow-auto text-sm" data-testid="output">
                  {shown.hits.map((h, i) => (
                    <li key={i}>
                      <button className="w-full rounded-lg border border-border p-2 text-left hover:bg-bg-muted" onClick={() => setPage(h.page)}>
                        <span className="mr-2 font-mono text-xs text-fg-subtle">p.{h.page}</span>
                        <span className="text-fg-muted">…{h.before}</span>
                        <mark className="rounded-sm bg-warning-bg px-0.5 text-fg">{h.match}</mark>
                        <span className="text-fg-muted">{h.after}…</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {shown.truncated ? <p className="mt-2 text-xs text-fg-subtle">Showing the first 1,000 matches.</p> : null}
              </Panel>
              {page && L ? (
                <Panel title={`Page ${page} (${byPage.get(page) ?? 0} matches)`}>
                  <PageThumbnail key={page} doc={L.doc} pageNumber={page} width={300} />
                </Panel>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <ActionBar onReset={() => (loader.reset(), text.reset(), setQ(""), setPage(null))} />
    </div>
  );
}
