"use client";

import { useEffect } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, CopyButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { callApi } from "@/lib/processors/web/api";
import { ApiErrorNotice, useApi } from "./common";

type MyIp = {
  ip: string; version: 4 | 6 | null; country: string | null; city: string | null; region: string | null; postalCode: string | null; latitude: number | null; longitude: number | null;
  timezone: string | null; continent: string | null; isEU: boolean; asn: number | null; asOrganization: string | null; colo: string | null; httpProtocol: string | null; tlsVersion: string | null;
  tlsCipher: string | null; clientTcpRtt: number | null; userAgent: string | null; acceptLanguage: string | null;
};

export default function MyIp(_props: ToolComponentProps) {
  const api = useApi<MyIp>();
  const load = () => api.run(() => callApi<MyIp>("/api/myip"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), []);
  const r = api.data;
  return (
    <div className="space-y-4">
      <ApiErrorNotice error={api.error} />
      {api.running && !r ? <p className="text-sm text-fg-subtle">Detecting…</p> : null}
      {r ? (
        <>
          <Panel title="Your public IP address" actions={<CopyButton text={r.ip} />}>
            <p className="font-mono text-2xl font-semibold tracking-tight break-all text-fg sm:text-3xl" data-testid="output">
              {r.ip}
            </p>
            <p className="mt-1 text-sm text-fg-muted">IPv{r.version ?? "?"} · as seen by Cloudflare</p>
          </Panel>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Approximate location" value={[r.city, r.country].filter(Boolean).join(", ") || "—"} sub={r.region ?? undefined} />
            <Stat label="Network (ISP)" value={r.asOrganization ?? "—"} sub={r.asn ? `AS${r.asn}` : undefined} />
            <Stat label="Time zone" value={r.timezone ?? "—"} />
          </div>
          <Panel title="Connection details">
            <KeyValueTable
              rows={[
                ["Protocol", r.httpProtocol ?? "—"],
                ["TLS", [r.tlsVersion, r.tlsCipher].filter(Boolean).join(" · ") || "—"],
                ["Round-trip time", r.clientTcpRtt != null ? `${r.clientTcpRtt} ms` : "—"],
                ["Cloudflare data centre", r.colo ?? "—"],
                ["Coordinates (approx.)", r.latitude != null ? `${r.latitude}, ${r.longitude}` : "—"],
                ["Postal code (approx.)", r.postalCode ?? "—"],
                ["Languages", r.acceptLanguage ?? "—"],
                ["User agent", r.userAgent ?? "—"],
              ]}
            />
          </Panel>
          <p className="text-xs text-fg-subtle">Location is estimated from the IP address and is often only accurate to the city or ISP level. If you use a VPN or proxy, you see its address. Nothing is stored.</p>
        </>
      ) : null}
      <ActionBar onRun={load} runLabel="Refresh" running={api.running} />
    </div>
  );
}
