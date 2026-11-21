"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { fetchPageHtml, normalizeUrlInput } from "@/lib/processors/web/api";
import { extractSocialTags, parseHtml, type SocialTags } from "@/lib/processors/web/html";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

/* eslint-disable @next/next/no-img-element */
function Img({ src, className }: { src: string | null; className: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <div className={`${className} flex items-center justify-center bg-bg-muted text-xs text-fg-subtle`}>No image</div>;
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} className={`${className} object-cover`} />;
}

function Cards({ t }: { t: SocialTags }) {
  const large = (t.twitterCard ?? "summary_large_image") !== "summary";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-fg-subtle">Facebook / LinkedIn</p>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Img src={t.image} className="aspect-[1.91/1] w-full" />
          <div className="space-y-0.5 border-t border-border bg-bg-subtle px-3 py-2.5">
            <div className="text-[11px] tracking-wide text-fg-subtle uppercase">{t.domain}</div>
            <div className="line-clamp-2 text-[15px] font-semibold text-fg">{t.title ?? "No title"}</div>
            <div className="line-clamp-1 text-[13px] text-fg-muted">{t.description}</div>
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-fg-subtle">X (Twitter) – {large ? "large image" : "summary"} card</p>
        {large ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative">
              <Img src={t.twitter["twitter:image"] ?? t.image} className="aspect-[1.91/1] w-full" />
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[12px] text-white">{t.domain}</span>
            </div>
          </div>
        ) : (
          <div className="flex overflow-hidden rounded-2xl border border-border bg-card">
            <Img src={t.twitter["twitter:image"] ?? t.image} className="h-28 w-28 shrink-0" />
            <div className="min-w-0 space-y-0.5 p-3">
              <div className="text-[13px] text-fg-subtle">{t.domain}</div>
              <div className="truncate text-[15px] text-fg">{t.twitter["twitter:title"] ?? t.title}</div>
              <div className="line-clamp-2 text-[13px] text-fg-muted">{t.twitter["twitter:description"] ?? t.description}</div>
            </div>
          </div>
        )}
      </div>
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-medium text-fg-subtle">Slack / Discord unfurl</p>
        <div className="flex max-w-xl gap-3 border-l-4 py-1 pl-3" style={{ borderColor: t.themeColor ?? "var(--border-strong)" }}>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
              {t.favicon ? <img src={t.favicon} alt="" className="h-4 w-4" referrerPolicy="no-referrer" /> : null}
              {t.siteName ?? t.domain}
            </div>
            <div className="text-[15px] font-semibold text-info">{t.title}</div>
            <div className="line-clamp-3 text-[14px] text-fg-muted">{t.description}</div>
          </div>
          <Img src={t.image} className="h-20 w-20 shrink-0 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function OgPreview(_props: ToolComponentProps) {
  const [mode, setMode] = useState<"url" | "html">("url");
  const [html, setHtml] = useState("");
  const api = useApi<SocialTags>();
  const t = api.data;
  const missing = t ? ["og:title", "og:description", "og:image", "og:url"].filter((k) => !t.og[k]) : [];
  return (
    <div className="space-y-4">
      <Segmented label="Source" value={mode} onChange={setMode} options={[{ value: "url", label: "Fetch a URL" }, { value: "html", label: "Paste tags" }]} />
      {mode === "url" ? (
        <QueryBar placeholder="https://example.com/article" label="Preview" inputMode="url" running={api.running} onSubmit={(v) => api.run(async () => { const r = await fetchPageHtml(normalizeUrlInput(v)); return extractSocialTags(parseHtml(r.html), r.finalUrl); })} />
      ) : (
        <Panel title="<head> tags" actions={<Button size="sm" disabled={!html.trim()} onClick={() => api.run(async () => extractSocialTags(parseHtml(html), "https://example.com/"))}>Preview</Button>}>
          <Textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder={'<meta property="og:title" content="…">'} aria-label="Meta tags" className="min-h-[140px]" />
        </Panel>
      )}
      <ApiErrorNotice error={api.error} />
      {t ? (
        <>
          <div data-testid="output">
            <Cards t={t} />
          </div>
          {missing.length ? <Alert tone="warning" title="Missing recommended tags">{missing.join(", ")} – platforms fall back to the page title and description, and may show no image.</Alert> : <Alert tone="success">All core Open Graph tags are present.</Alert>}
          <Panel title="Detected tags">
            <KeyValueTable rows={[...Object.entries(t.og), ...Object.entries(t.twitter)]} empty="No Open Graph or Twitter tags found" />
          </Panel>
          <p className="text-xs text-fg-subtle">Previews approximate each platform&apos;s current layout; platforms cache previews, so use their debuggers to refresh after changes. Images load directly from the site.</p>
        </>
      ) : null}
      <ActionBar onReset={() => (api.reset(), setHtml(""))} />
    </div>
  );
}
