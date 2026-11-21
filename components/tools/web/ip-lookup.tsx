"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { apiPath, callApi } from "@/lib/processors/web/api";
import type { IpRdap } from "../../../functions/api/_rdap";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

type Resp = ({ reserved: true; query: string; version: number; reservedReason: string; message: string } | (IpRdap & { reserved: false; version: number; rdapServer: string })) ;

export default function IpLookup(_props: ToolComponentProps) {
  const api = useApi<Resp>();
  const r = api.data;
  return (
    <div className="space-y-4">
      <QueryBar placeholder="8.8.8.8 or 2606:4700::1111" label="Look up" running={api.running} onSubmit={(v) => api.run(() => callApi<Resp>(apiPath("/api/ip", { ip: v })))} />
      <ApiErrorNotice error={api.error} />
      {r?.reserved ? <Alert tone="info" title={`Reserved address (${r.reservedReason})`}>{r.message}</Alert> : null}
      {r && !r.reserved ? (
        <Panel title={`${r.query} (IPv${r.version})`}>
          <div data-testid="output">
            <KeyValueTable
              rows={[
                ["Network name", r.name ?? "—"],
                ["Organisation", r.organization ?? "—"],
                ["Country (registered)", r.country ?? "—"],
                ["Range", r.startAddress && r.endAddress ? `${r.startAddress} – ${r.endAddress}` : "—"],
                ["CIDR", r.cidrs.join(", ") || "—"],
                ["Registry", r.registry ?? "—"],
                ["Handle", r.handle ?? "—"],
                ["Abuse contact", r.abuseEmail ?? "—"],
                ["Status", r.status.join(", ") || "—"],
              ]}
            />
          </div>
          <p className="mt-3 text-xs text-fg-subtle">Ownership data from the regional internet registry (via RDAP). The registered country is where the network is registered, which may differ from where a device physically is.</p>
        </Panel>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
