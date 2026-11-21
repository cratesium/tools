"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, CopyButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { callApi, normalizeUrlInput } from "@/lib/processors/web/api";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

type Resp = { code: string; shortUrl: string; url: string; createdAt: string };

export default function UrlShortener(_props: ToolComponentProps) {
  const api = useApi<Resp>();
  const r = api.data;
  return (
    <div className="space-y-4">
      <QueryBar placeholder="https://example.com/a/very/long/link?with=parameters" label="Shorten" inputMode="url" running={api.running} onSubmit={(v) => api.run(() => callApi<Resp>("/api/shorten", { method: "POST", body: { url: normalizeUrlInput(v) } }))} />
      <ApiErrorNotice error={api.error} />
      {r ? (
        <Panel title="Your short link" actions={<CopyButton text={r.shortUrl} />}>
          <a href={r.shortUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xl font-semibold break-all text-fg hover:underline" data-testid="output">
            {r.shortUrl}
          </a>
          <div className="mt-3">
            <KeyValueTable rows={[["Destination", r.url], ["Code", r.code], ["Created", new Date(r.createdAt).toLocaleString()]]} />
          </div>
        </Panel>
      ) : null}
      <Alert tone="info">Short links are stored in this site&apos;s Cloudflare KV storage (destination URL and creation time only) and redirect with HTTP 301. They don&apos;t expire, and there is no click tracking.</Alert>
      <ActionBar onReset={api.reset} />
    </div>
  );
}
