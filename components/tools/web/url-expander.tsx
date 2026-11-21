"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, CopyButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { apiPath, callApi, normalizeUrlInput, type InspectResponse } from "@/lib/processors/web/api";
import { statusInfo } from "@/lib/processors/web/headers";
import { ApiErrorNotice, QueryBar, StatusPill, useApi } from "./common";

const TRACKING = /^(utm_|fbclid|gclid|mc_eid|mc_cid|igshid|si$|ref$|ref_src)/i;

export default function UrlExpander(_props: ToolComponentProps) {
  const api = useApi<InspectResponse>();
  const r = api.data;
  const clean = (() => {
    if (!r) return "";
    try {
      const u = new URL(r.finalUrl);
      [...u.searchParams.keys()].forEach((k) => TRACKING.test(k) && u.searchParams.delete(k));
      return u.href;
    } catch {
      return r.finalUrl;
    }
  })();
  return (
    <div className="space-y-4">
      <QueryBar placeholder="Paste a short link, e.g. bit.ly/xyz" label="Expand" running={api.running} inputMode="url" onSubmit={(v) => api.run(() => callApi<InspectResponse>(apiPath("/api/inspect", { url: normalizeUrlInput(v), method: "HEAD" })))} />
      <ApiErrorNotice error={api.error} />
      {r ? (
        <>
          <Panel title="Final destination" actions={<CopyButton text={r.finalUrl} />}>
            <p className="font-mono text-sm break-all text-fg" data-testid="output">
              {r.finalUrl}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
              <StatusPill status={r.status} /> {statusInfo(r.status).phrase} · {r.redirects.length} redirect{r.redirects.length === 1 ? "" : "s"} · {r.timingMs} ms
            </p>
            {clean !== r.finalUrl ? (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-fg-subtle">Without tracking parameters:</span>
                <code className="truncate font-mono">{clean}</code>
                <CopyButton text={clean} label="" />
              </div>
            ) : null}
          </Panel>
          {r.redirects.length ? (
            <Panel title="Redirect chain">
              <ol className="space-y-2 text-sm">
                {r.redirects.map((h, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <StatusPill status={h.status} />
                    <span className="font-mono text-[13px] break-all">{h.url}</span>
                  </li>
                ))}
                <li className="flex items-start gap-3">
                  <StatusPill status={r.status} />
                  <span className="font-mono text-[13px] font-medium break-all">{r.finalUrl}</span>
                </li>
              </ol>
            </Panel>
          ) : (
            <Alert tone="info">This URL does not redirect – it is already the final address.</Alert>
          )}
          <Panel title="Response">
            <KeyValueTable rows={[["Content type", r.contentType ?? "—"], ["Server", r.headers.find((h) => h.name.toLowerCase() === "server")?.value ?? "—"]]} />
          </Panel>
        </>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
