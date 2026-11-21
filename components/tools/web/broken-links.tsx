"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, Panel, TaskProgress } from "@/components/tools/shared";
import { callApi, fetchPageHtml, normalizeUrlInput, type LinkCheckResult } from "@/lib/processors/web/api";
import { checkableUrls, extractLinks, parseHtml, toCsv } from "@/lib/processors/web/html";
import { checkLinksInBatches, summarize } from "@/lib/processors/web/link-check";
import { useTask } from "@/lib/utils/hooks";
import { QueryBar, ApiErrorNotice, StatusPill } from "./common";
import { cn } from "@/lib/utils/cn";

const TONE: Record<LinkCheckResult["verdict"], string> = { ok: "text-success", redirect: "text-info", broken: "text-danger", error: "text-danger", blocked: "text-warning", skipped: "text-fg-subtle" };

export default function BrokenLinks(_props: ToolComponentProps) {
  const [internal, setInternal] = useState(true);
  const [external, setExternal] = useState(true);
  const [show, setShow] = useState<"problems" | "all">("problems");
  const task = useTask<{ page: string; results: LinkCheckResult[] }>();
  const run = (v: string) =>
    task.run(async (ctx) => {
      ctx.progress(null, "Fetching page…");
      const page = await fetchPageHtml(normalizeUrlInput(v), { signal: ctx.signal });
      const urls = checkableUrls(extractLinks(parseHtml(page.html), page.finalUrl), { internal, external }).slice(0, 500);
      if (!urls.length) throw new Error("No checkable http(s) links found on that page.");
      ctx.progress(0, `Checking ${urls.length} links…`);
      const results = await checkLinksInBatches(urls, {
        batchSize: 20,
        signal: ctx.signal,
        check: (batch, signal) => callApi<{ results: LinkCheckResult[] }>("/api/check-links", { method: "POST", body: { urls: batch }, signal }).then((r) => r.results),
        onProgress: (done, total) => ctx.progress(done / total, `Checked ${done} of ${total} links`),
      });
      return { page: page.finalUrl, results };
    });
  const r = task.result;
  const s = r ? summarize(r.results) : null;
  const rows = r ? r.results.filter((x) => show === "all" || !["ok", "redirect"].includes(x.verdict)) : [];
  const csv = r ? toCsv(["url", "verdict", "status", "final_url", "error"], r.results.map((x) => [x.url, x.verdict, x.status ?? "", x.finalUrl ?? "", x.error ?? ""])) : "";
  return (
    <div className="space-y-4">
      <QueryBar placeholder="https://example.com/page" label="Check links" inputMode="url" running={task.running} onSubmit={run} />
      <div className="flex flex-wrap gap-5">
        <Checkbox label="Internal links" checked={internal} onChange={setInternal} />
        <Checkbox label="External links" checked={external} onChange={setExternal} />
      </div>
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      {task.error ? <ApiErrorNotice error={{ name: /Cloudflare function/.test(task.error) ? "ApiUnavailableError" : "Error", message: task.error }} /> : null}
      {r && s ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Links checked" value={s.total} />
            <Stat label="OK" value={s.ok} />
            <Stat label="Redirects" value={s.redirect} />
            <Stat label="Broken / errors" value={s.broken + s.error} sub={s.blocked ? `${s.blocked} blocked bot access` : undefined} />
          </div>
          <Panel
            title={<Segmented label="Show" value={show} onChange={setShow} options={[{ value: "problems", label: "Problems" }, { value: "all", label: "All links" }]} />}
            actions={<DownloadButton text={csv} filename="link-check.csv" mime="text/csv" label="CSV" size="sm" variant="secondary" />}
          >
            {rows.length ? (
              <ul className="divide-y divide-border" data-testid="output">
                {rows.map((x) => (
                  <li key={x.url} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <StatusPill status={x.status} />
                    <span className={cn("w-20 text-xs font-medium capitalize", TONE[x.verdict])}>{x.verdict}</span>
                    <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate font-mono text-[13px] hover:underline">
                      {x.url}
                    </a>
                    {x.error ? <span className="text-xs text-fg-subtle">{x.error}</span> : x.redirects ? <span className="text-xs text-fg-subtle">→ {x.finalUrl}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success" data-testid="output">No broken links found on {r.page}.</p>
            )}
          </Panel>
          <p className="text-xs text-fg-subtle">“Blocked” means the site refused automated requests (e.g. 403/429 to bots); check those links manually. Up to 500 links per page are checked.</p>
        </>
      ) : null}
      <ActionBar onReset={task.reset} />
    </div>
  );
}
