"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { apiPath, callApi, normalizeUrlInput, type InspectResponse } from "@/lib/processors/web/api";
import { HEADER_DOCS, analyzeSecurityHeaders, statusInfo } from "@/lib/processors/web/headers";
import { ApiErrorNotice, CheckIcon, QueryBar, StatusPill, useApi } from "./common";

export default function HeaderChecker(_props: ToolComponentProps) {
  const api = useApi<InspectResponse>();
  const r = api.data;
  const checks = r ? analyzeSecurityHeaders(r.headers, r.finalUrl.startsWith("https:")) : [];
  const raw = r ? `HTTP ${r.status} ${r.statusText}\n${r.headers.map((h) => `${h.name}: ${h.value}`).join("\n")}` : "";
  return (
    <div className="space-y-4">
      <QueryBar placeholder="https://example.com" label="Get headers" running={api.running} inputMode="url" onSubmit={(v) => api.run(() => callApi<InspectResponse>(apiPath("/api/inspect", { url: normalizeUrlInput(v) })))} />
      <ApiErrorNotice error={api.error} />
      {r ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={r.status} />
            <span className="text-fg">{statusInfo(r.status).phrase}</span>
            <span className="text-fg-muted">· {r.timingMs} ms · {r.headers.length} headers</span>
            {r.redirects.length ? <Badge>{r.redirects.length} redirects followed</Badge> : null}
          </div>
          <Panel title="Response headers" actions={<CopyButton text={raw} label="Copy raw" />}>
            <div data-testid="output">
              <KeyValueTable rows={r.headers.map((h) => [h.name, <span key={h.name} title={HEADER_DOCS[h.name.toLowerCase()]}>{h.value}</span>])} />
            </div>
          </Panel>
          <Panel title="Security headers">
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.header} className="flex gap-3 text-sm">
                  <CheckIcon status={c.status} />
                  <div>
                    <div className="font-mono text-[13px] font-medium text-fg">{c.header}</div>
                    <div className="text-fg-muted">{c.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          {r.redirects.length ? (
            <Panel title="Redirects">
              <ol className="space-y-1 text-[13px]">
                {r.redirects.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <StatusPill status={h.status} /> <span className="font-mono break-all">{h.url}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
        </>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
