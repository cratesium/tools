"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Textarea } from "@/components/ui/field";
import { Badge, Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { fetchPageHtml, normalizeUrlInput } from "@/lib/processors/web/api";
import { analyzeMeta, parseHtml, type MetaAnalysis } from "@/lib/processors/web/html";
import { ApiErrorNotice, CheckIcon, QueryBar, useApi } from "./common";

export default function MetaAnalyzer(_props: ToolComponentProps) {
  const [mode, setMode] = useState<"url" | "html">("url");
  const [html, setHtml] = useState("");
  const api = useApi<{ a: MetaAnalysis; url: string | null }>();
  const a = api.data?.a;
  return (
    <div className="space-y-4">
      <Segmented label="Source" value={mode} onChange={setMode} options={[{ value: "url", label: "Fetch a URL" }, { value: "html", label: "Paste HTML" }]} />
      {mode === "url" ? (
        <QueryBar
          placeholder="https://example.com/page"
          label="Analyse"
          inputMode="url"
          running={api.running}
          onSubmit={(v) =>
            api.run(async () => {
              const r = await fetchPageHtml(normalizeUrlInput(v));
              return { a: analyzeMeta(parseHtml(r.html), r.finalUrl), url: r.finalUrl };
            })
          }
        />
      ) : (
        <Panel title="HTML" actions={<Button size="sm" onClick={() => api.run(async () => ({ a: analyzeMeta(parseHtml(html), null), url: null }))} disabled={!html.trim()}>Analyse</Button>}>
          <Textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<html><head>…</head></html>" aria-label="HTML" className="min-h-[160px]" />
        </Panel>
      )}
      <ApiErrorNotice error={api.error} />
      {a ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Score" value={`${a.score}/100`} />
            <Stat label="Passed" value={a.checks.filter((c) => c.status === "pass").length} />
            <Stat label="Warnings" value={a.checks.filter((c) => c.status === "warn").length} />
            <Stat label="Problems" value={a.checks.filter((c) => c.status === "fail").length} />
          </div>
          <Panel title="Checks">
            <ul className="space-y-2.5" data-testid="output">
              {a.checks.map((c) => (
                <li key={c.id} className="flex gap-3 text-sm">
                  <CheckIcon status={c.status} />
                  <div>
                    <div className="font-medium text-fg">{c.label}</div>
                    <div className="text-fg-muted">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Key tags">
            <KeyValueTable
              rows={[
                ["Title", a.title ? `${a.title} (${a.title.length} chars)` : "—"],
                ["Description", a.description ? `${a.description} (${a.description.length} chars)` : "—"],
                ["Canonical", a.canonical ?? "—"],
                ["Robots", a.robots ?? "—"],
                ["Viewport", a.viewport ?? "—"],
                ["Language", a.lang ?? "—"],
                ["Charset", a.charset ?? "—"],
                ["Open Graph", Object.keys(a.social.og).length ? `${Object.keys(a.social.og).length} tags` : "none"],
                ["Twitter card", a.social.twitterCard ?? "—"],
                ["Structured data", a.structuredData.jsonLdBlocks ? `${a.structuredData.jsonLdBlocks} JSON-LD (${a.structuredData.types.join(", ")})` : "none"],
                ["Images", `${a.images.total} total, ${a.images.missingAlt} missing alt`],
                ["hreflang", a.hreflang.map((h) => h.lang).join(", ") || "—"],
              ]}
            />
          </Panel>
          {a.headings.length ? (
            <Panel title="Heading outline">
              <ul className="space-y-1 text-sm">
                {a.headings.slice(0, 80).map((h, i) => (
                  <li key={i} style={{ paddingLeft: (h.level - 1) * 16 }} className="flex items-baseline gap-2">
                    <Badge>H{h.level}</Badge> <span className="text-fg">{h.text || <em className="text-fg-subtle">empty</em>}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title={`All meta tags (${a.allMeta.length})`}>
            <KeyValueTable rows={a.allMeta.map((m) => [m.key, m.content])} />
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={() => (api.reset(), setHtml(""))} />
    </div>
  );
}
