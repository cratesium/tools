"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, DownloadButton, Panel } from "@/components/tools/shared";
import { fetchPageHtml, normalizeUrlInput } from "@/lib/processors/web/api";
import { htmlSourceStats, tokenizeHtml, type HtmlTokenType } from "@/lib/processors/web/html-tokenizer";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

const COLORS: Partial<Record<HtmlTokenType, string>> = {
  comment: "text-fg-subtle italic",
  doctype: "text-fg-subtle",
  punct: "text-fg-subtle",
  tag: "text-info",
  attr: "text-warning",
  value: "text-success",
  entity: "text-danger",
  raw: "text-fg-muted",
};

export default function HtmlViewer(_props: ToolComponentProps) {
  const [mode, setMode] = useState<"url" | "paste">("url");
  const [pasted, setPasted] = useState("");
  const [view, setView] = useState<"source" | "render">("source");
  const [wrap, setWrap] = useState(true);
  const api = useApi<{ html: string; url: string; truncated: boolean }>();
  const src = mode === "url" ? api.data?.html ?? "" : pasted;
  const tokens = useMemo(() => (src && src.length < 1_500_000 ? tokenizeHtml(src) : []), [src]);
  const stats = useMemo(() => (src ? htmlSourceStats(src) : null), [src]);
  return (
    <div className="space-y-4">
      <Segmented label="Source" value={mode} onChange={setMode} options={[{ value: "url", label: "Fetch a URL" }, { value: "paste", label: "Paste HTML" }]} />
      {mode === "url" ? (
        <QueryBar placeholder="https://example.com" label="View source" inputMode="url" running={api.running} onSubmit={(v) => api.run(async () => { const r = await fetchPageHtml(normalizeUrlInput(v)); return { html: r.html, url: r.finalUrl, truncated: !!r.htmlTruncated }; })} />
      ) : (
        <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="<!doctype html>…" aria-label="HTML" data-testid="input" className="min-h-[140px]" />
      )}
      <ApiErrorNotice error={api.error} />
      {src && stats ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{stats.lines.toLocaleString()} lines</Badge>
            <Badge>{(stats.bytes / 1024).toFixed(1)} KB</Badge>
            <Badge>{stats.elements.toLocaleString()} elements</Badge>
            <Badge>{stats.comments} comments</Badge>
            {api.data?.truncated && mode === "url" ? <Badge className="text-warning">Truncated at 3 MB</Badge> : null}
            <span className="text-xs text-fg-subtle">Top tags: {stats.topTags.slice(0, 6).map(([t, n]) => `${t} (${n})`).join(", ")}</span>
          </div>
          <Panel
            title={<Segmented label="View" value={view} onChange={setView} options={[{ value: "source", label: "Source" }, { value: "render", label: "Rendered (no scripts)" }]} />}
            actions={
              <>
                {view === "source" ? <Checkbox label="Wrap lines" checked={wrap} onChange={setWrap} /> : null}
                <CopyButton text={src} />
                <DownloadButton text={src} filename="page.html" mime="text/html" size="sm" variant="secondary" />
              </>
            }
          >
            {view === "source" ? (
              <pre className={`max-h-[560px] overflow-auto rounded-lg bg-bg-subtle p-3 font-mono text-[12px] leading-relaxed ${wrap ? "whitespace-pre-wrap break-all" : ""}`} data-testid="output">
                {tokens.length ? tokens.map((t, i) => <span key={i} className={COLORS[t.type]}>{t.text}</span>) : src}
              </pre>
            ) : (
              <iframe title="Rendered page" sandbox="" srcDoc={api.data?.url && mode === "url" ? src.replace(/<head([^>]*)>/i, `<head$1><base href="${api.data.url.replace(/"/g, "&quot;")}">`) : src} className="h-[560px] w-full rounded-lg border border-border bg-white" referrerPolicy="no-referrer" />
            )}
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => (api.reset(), setPasted(""))} />
    </div>
  );
}
