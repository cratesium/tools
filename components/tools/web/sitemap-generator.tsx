"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, FileResults, Panel, TaskProgress, TextOutput } from "@/components/tools/shared";
import { fetchPageHtml, normalizeUrlInput } from "@/lib/processors/web/api";
import { extractLinks, parseHtml } from "@/lib/processors/web/html";
import { CHANGEFREQS, buildSitemaps, parseUrlList, type ChangeFreq } from "@/lib/processors/web/sitemap";
import { useTask } from "@/lib/utils/hooks";
import { ApiErrorNotice, QueryBar } from "./common";

export default function SitemapGenerator(_props: ToolComponentProps) {
  const [mode, setMode] = useState<"list" | "crawl">("list");
  const [text, setText] = useState("");
  const [freq, setFreq] = useState<ChangeFreq | "">("");
  const [priority, setPriority] = useState("");
  const [lastmod, setLastmod] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [base, setBase] = useState("");
  const crawl = useTask<string[]>();
  const parsed = useMemo(
    () => parseUrlList(text, { changefreq: freq || undefined, priority: priority ? Number(priority) : undefined, lastmod: lastmod || undefined }),
    [text, freq, priority, lastmod],
  );
  const built = useMemo(() => (parsed.entries.length ? buildSitemaps(parsed.entries, { indexBaseUrl: base || (parsed.entries[0] ? new URL(parsed.entries[0].loc).origin : undefined) }) : null), [parsed, base]);

  const runCrawl = (start: string) =>
    crawl.run(async (ctx) => {
      const root = new URL(normalizeUrlInput(start));
      const seen = new Set<string>([root.href]);
      const queue = [root.href];
      const found: string[] = [];
      while (queue.length && found.length < maxPages) {
        const url = queue.shift()!;
        try {
          const r = await fetchPageHtml(url, { signal: ctx.signal });
          found.push(r.finalUrl);
          for (const l of extractLinks(parseHtml(r.html), r.finalUrl)) {
            if (l.kind !== "internal" || l.nofollow) continue;
            const u = new URL(l.href);
            u.hash = "";
            if (u.origin !== root.origin || /\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js)$/i.test(u.pathname)) continue;
            if (!seen.has(u.href)) {
              seen.add(u.href);
              queue.push(u.href);
            }
          }
        } catch (e) {
          if ((e as Error).name === "ApiUnavailableError" || (e as Error).name === "AbortError") throw e;
        }
        ctx.progress(found.length / maxPages, `Crawled ${found.length} pages`);
      }
      setText([...new Set(found)].join("\n"));
      setMode("list");
      return found;
    });

  return (
    <div className="space-y-4">
      <Segmented label="Source" value={mode} onChange={setMode} options={[{ value: "list", label: "From a URL list" }, { value: "crawl", label: "Crawl a site" }]} />
      {mode === "crawl" ? (
        <Panel title="Crawl (same-site links only)">
          <QueryBar placeholder="https://example.com" label="Crawl" inputMode="url" running={crawl.running} onSubmit={runCrawl}>
            <Select aria-label="Max pages" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} className="h-11 sm:w-36">
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n} pages
                </option>
              ))}
            </Select>
          </QueryBar>
          <p className="mt-2 text-xs text-fg-subtle">Pages are fetched one by one through UtilityHub&apos;s Cloudflare function. Found URLs are added to the list for review.</p>
          <div className="mt-3">
            <TaskProgress running={crawl.running} progress={crawl.progress} label={crawl.progressLabel} />
          </div>
          {crawl.error ? <ApiErrorNotice error={{ name: /Cloudflare function/.test(crawl.error) ? "ApiUnavailableError" : "Error", message: crawl.error }} /> : null}
        </Panel>
      ) : null}
      <Panel title="URLs (one per line – optionally followed by lastmod, changefreq, priority)">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://example.com/\nhttps://example.com/about 2026-11-01 monthly 0.8"} aria-label="URLs" data-testid="input" className="min-h-[180px]" />
      </Panel>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Default changefreq">
          {(id) => (
            <Select id={id} value={freq} onChange={(e) => setFreq(e.target.value as ChangeFreq | "")}>
              <option value="">(omit)</option>
              {CHANGEFREQS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Default priority" hint="0.0–1.0">{(id) => <Input id={id} value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="0.5" />}</Field>
        <Field label="Default lastmod">{(id) => <Input id={id} type="date" value={lastmod} onChange={(e) => setLastmod(e.target.value)} />}</Field>
        <Field label="Sitemap base URL" hint="for the index">{(id) => <Input id={id} value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://example.com" />}</Field>
      </div>
      {parsed.errors.length ? (
        <Alert tone="warning" title={`${parsed.errors.length} line(s) skipped`}>
          {parsed.errors.slice(0, 5).map((e) => `Line ${e.line}: ${e.message}`).join(" · ")}
        </Alert>
      ) : null}
      {built ? (
        <>
          <p className="flex flex-wrap gap-2 text-sm text-fg-muted">
            <Badge>{parsed.entries.length} URLs</Badge>
            {parsed.duplicates ? <Badge>{parsed.duplicates} duplicates removed</Badge> : null}
            {built.files.length > 1 ? <Badge>{built.files.length} sitemap files + index</Badge> : null}
          </p>
          {built.files.length === 1 ? (
            <TextOutput value={built.files[0].xml} filename="sitemap.xml" mime="application/xml" label="sitemap.xml" rows={14} />
          ) : (
            <FileResults
              files={[...built.files.map((f) => ({ name: f.name, blob: new Blob([f.xml], { type: "application/xml" }) })), ...(built.index ? [{ name: "sitemap-index.xml", blob: new Blob([built.index], { type: "application/xml" }) }] : [])]}
              zipName="sitemaps.zip"
              label="Sitemap files"
            />
          )}
          <Alert tone="info">Upload the file to your site root and reference it in robots.txt (Sitemap: https://your-site/sitemap.xml) or submit it in Google Search Console.</Alert>
        </>
      ) : null}
      <ActionBar onReset={() => (setText(""), crawl.reset())} />
    </div>
  );
}
