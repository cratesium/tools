"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Alert, Badge, Stat } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { apiPath, callApi } from "@/lib/processors/web/api";
import type { CtCertificate, HttpsProbe } from "../../../functions/api/ssl";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

type Resp = { host: string; https: HttpsProbe; current: CtCertificate | null; certificates: CtCertificate[]; totalCertificates: number; ctError: string | null; statusNote: string };

export default function SslChecker(_props: ToolComponentProps) {
  const api = useApi<Resp>();
  const r = api.data;
  const c = r?.current;
  return (
    <div className="space-y-4">
      <QueryBar placeholder="example.com" label="Check SSL" running={api.running} onSubmit={(v) => api.run(() => callApi<Resp>(apiPath("/api/ssl", { host: v.replace(/^https?:\/\//, "").split("/")[0] })))} />
      <ApiErrorNotice error={api.error} />
      {r ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="output">
            <Stat label="HTTPS" value={r.https.reachable ? "Reachable" : "Unreachable"} sub={r.https.reachable ? `HTTP ${r.https.status} in ${r.https.timingMs} ms` : r.https.error ?? undefined} />
            <Stat label="Current certificate" value={c ? (c.daysRemaining >= 0 ? `${c.daysRemaining} days left` : "Expired") : "Not found in CT logs"} sub={c ? `expires ${c.notAfter.slice(0, 10)}` : undefined} />
            <Stat label="HSTS" value={r.https.hsts ? "Enabled" : "Not set"} sub={r.https.hsts ?? undefined} />
          </div>
          {c && c.daysRemaining < 21 && c.daysRemaining >= 0 ? <Alert tone="warning">The current certificate expires in {c.daysRemaining} days. Make sure automatic renewal is working.</Alert> : null}
          {!r.https.reachable ? <Alert tone="danger" title="HTTPS connection failed">{r.https.error}</Alert> : null}
          {c ? (
            <Panel title="Most recent valid certificate (from Certificate Transparency logs)">
              <KeyValueTable
                rows={[
                  ["Common name", c.commonName],
                  ["Issuer", c.issuerOrg ? `${c.issuerOrg} (${c.issuer})` : c.issuer],
                  ["Valid from", c.notBefore],
                  ["Valid until", c.notAfter],
                  ["Subject alternative names", c.sans.slice(0, 30).join(", ") + (c.sans.length > 30 ? ` … (+${c.sans.length - 30})` : "")],
                  ["Serial number", c.serial],
                  ["Logged", c.loggedAt ?? "—"],
                ]}
              />
            </Panel>
          ) : null}
          {r.certificates.length ? (
            <Panel title={`Certificate history (${r.totalCertificates})`}>
              <ul className="divide-y divide-border text-[13px]">
                {r.certificates.map((x) => (
                  <li key={x.serial} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="w-48 font-mono text-fg-muted">{x.notBefore.slice(0, 10)} → {x.notAfter.slice(0, 10)}</span>
                    <span className="min-w-0 flex-1 truncate">{x.issuerOrg ?? x.issuer}</span>
                    {x.validNow ? <Badge className="text-success">valid now</Badge> : <Badge>expired</Badge>}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {r.ctError ? <Alert tone="warning">Certificate Transparency lookup problem: {r.ctError}</Alert> : null}
          <p className="text-xs text-fg-subtle">{r.statusNote}</p>
        </>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
