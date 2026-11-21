"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, Panel, TextOutput } from "@/components/tools/shared";
import { fetchPageHtml, normalizeUrlInput } from "@/lib/processors/web/api";
import { extractVisibleText, keywordDensity, parseHtml, tokenizeWords } from "@/lib/processors/web/html";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

export default function WebsiteWordCounter(_props: ToolComponentProps) {
  const [mainOnly, setMainOnly] = useState(false);
  const [boiler, setBoiler] = useState(true);
  const [ngram, setNgram] = useState<"1" | "2" | "3">("1");
  const api = useApi<{ html: string; url: string }>();
  const text = useMemo(() => (api.data ? extractVisibleText(parseHtml(api.data.html), { excludeBoilerplate: boiler, mainOnly }) : ""), [api.data, boiler, mainOnly]);
  const words = useMemo(() => tokenizeWords(text), [text]);
  const kw = useMemo(() => (text ? keywordDensity(text, { top: 25, excludeStopwords: true, ngram: Number(ngram) as 1 | 2 | 3 }) : []), [text, ngram]);
  return (
    <div className="space-y-4">
      <QueryBar placeholder="https://example.com/blog/post" label="Count words" inputMode="url" running={api.running} onSubmit={(v) => api.run(async () => { const r = await fetchPageHtml(normalizeUrlInput(v)); return { html: r.html, url: r.finalUrl }; })} />
      <div className="flex flex-wrap gap-5">
        <Checkbox label="Ignore navigation, header and footer" checked={boiler} onChange={setBoiler} />
        <Checkbox label="Main content only (<main>/<article>)" checked={mainOnly} onChange={setMainOnly} />
      </div>
      <ApiErrorNotice error={api.error} />
      {api.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4" data-testid="output">
            <Stat label="Words" value={words.length.toLocaleString()} />
            <Stat label="Unique words" value={new Set(words).size.toLocaleString()} />
            <Stat label="Characters" value={text.length.toLocaleString()} />
            <Stat label="Reading time" value={`${Math.max(1, Math.round(words.length / 238))} min`} />
          </div>
          <Panel title="Keyword density" actions={<Segmented label="Phrase length" value={ngram} onChange={setNgram} options={[{ value: "1", label: "1 word" }, { value: "2", label: "2 words" }, { value: "3", label: "3 words" }]} />}>
            <ul className="space-y-1 text-sm">
              {kw.map((k) => (
                <li key={k.term} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{k.term}</span>
                  <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-bg-muted sm:block">
                    <div className="h-full bg-fg/60" style={{ width: `${Math.min(100, k.density * 20)}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-xs">{k.count}</span>
                  <span className="w-14 text-right font-mono text-xs text-fg-subtle">{k.density.toFixed(2)}%</span>
                </li>
              ))}
            </ul>
          </Panel>
          <TextOutput value={text} filename="page-text.txt" label="Extracted text" rows={10} />
        </>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
