"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Input, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, CopyButton, DownloadButton, Panel } from "@/components/tools/shared";
import { fetchPageHtml, normalizeUrlInput } from "@/lib/processors/web/api";
import { extractLinks, linksToCsv, parseHtml, type ExtractedLink, type LinkKind } from "@/lib/processors/web/html";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

export default function LinkExtractor(_props: ToolComponentProps) {
  const [resources, setResources] = useState(false);
  const [kind, setKind] = useState<"all" | LinkKind>("all");
  const [q, setQ] = useState("");
  const api = useApi<{ html: string; url: string }>();
  const links = useMemo<ExtractedLink[]>(() => (api.data ? extractLinks(parseHtml(api.data.html), api.data.url, { includeResources: resources }) : []), [api.data, resources]);
  const shown = links.filter((l) => (kind === "all" || l.kind === kind) && (!q || l.href.toLowerCase().includes(q.toLowerCase()) || l.text.toLowerCase().includes(q.toLowerCase())));
  const c = (k: LinkKind) => links.filter((l) => l.kind === k).length;
  return (
    <div className="space-y-4">
      <QueryBar placeholder="https://example.com" label="Extract links" inputMode="url" running={api.running} onSubmit={(v) => api.run(async () => { const r = await fetchPageHtml(normalizeUrlInput(v)); return { html: r.html, url: r.finalUrl }; })} />
      <Checkbox label="Include resources (images, scripts, stylesheets, iframes, media)" checked={resources} onChange={setResources} />
      <ApiErrorNotice error={api.error} />
      {api.data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={links.length} />
            <Stat label="Internal" value={c("internal")} />
            <Stat label="External" value={c("external")} />
            <Stat label="Nofollow" value={links.filter((l) => l.nofollow).length} />
          </div>
          <Panel
            title={<Segmented label="Filter" value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "internal", label: "Internal" }, { value: "external", label: "External" }, { value: "mailto", label: "Email" }, { value: "anchor", label: "Anchors" }]} />}
            actions={
              <>
                <CopyButton text={shown.map((l) => l.href).join("\n")} label="Copy URLs" />
                <DownloadButton text={linksToCsv(shown)} filename="links.csv" mime="text/csv" label="CSV" size="sm" variant="secondary" />
              </>
            }
          >
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by URL or anchor text" aria-label="Filter links" className="mb-3" />
            <div className="max-h-[480px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-[13px]" data-testid="output">
                <thead className="sticky top-0 bg-bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">URL</th>
                    <th className="px-3 py-2 font-medium">Anchor text</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">rel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.slice(0, 2000).map((l, i) => (
                    <tr key={`${l.href}-${i}`}>
                      <td className="max-w-0 truncate px-3 py-1.5 font-mono" title={l.href}>{l.href}</td>
                      <td className="max-w-0 truncate px-3 py-1.5 text-fg-muted" title={l.text}>{l.text || <em>{l.tag}</em>}</td>
                      <td className="px-3 py-1.5 text-fg-muted">{l.kind}</td>
                      <td className="px-3 py-1.5 text-xs text-fg-subtle">{[l.nofollow && "nofollow", l.sponsored && "sponsored", l.ugc && "ugc", l.newTab && "new tab"].filter(Boolean).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
