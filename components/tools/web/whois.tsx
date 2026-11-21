"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Badge } from "@/components/ui/feedback";
import { ActionBar, CopyButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { apiPath, callApi } from "@/lib/processors/web/api";
import type { DomainRdap } from "../../../functions/api/_rdap";
import { ApiErrorNotice, QueryBar, useApi } from "./common";

type Resp = DomainRdap & { query: string; rdapServer: string; raw: unknown; fetchedAt: number };

const d = (s: string | null) => (s ? `${new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} (${s.slice(0, 10)})` : "—");

export default function Whois(_props: ToolComponentProps) {
  const api = useApi<Resp>();
  const r = api.data;
  const days = r?.expires ? Math.round((Date.parse(r.expires) - r.fetchedAt) / 86400000) : null;
  return (
    <div className="space-y-4">
      <QueryBar placeholder="example.com" label="Look up" running={api.running} onSubmit={(v) => api.run(async () => ({ ...(await callApi<Omit<Resp, "fetchedAt">>(apiPath("/api/whois", { domain: v.replace(/^https?:\/\//, "").split("/")[0] }))), fetchedAt: Date.now() }))} />
      <ApiErrorNotice error={api.error} />
      {r ? (
        <>
          <Panel title={<span className="flex items-center gap-2">{r.unicodeName ?? r.domain} {days != null ? <Badge className={days < 30 ? "text-warning" : ""}>{days >= 0 ? `expires in ${days} days` : "expired"}</Badge> : null}</span>}>
            <div data-testid="output">
              <KeyValueTable
                rows={[
                  ["Registrar", r.registrar ?? "—"],
                  ["Registered", d(r.created)],
                  ["Updated", d(r.updated)],
                  ["Expires", d(r.expires)],
                  ["Status", r.status.join(", ") || "—"],
                  ["Name servers", r.nameservers.join(", ") || "—"],
                  ["DNSSEC", r.dnssec == null ? "unknown" : r.dnssec ? "signed" : "unsigned"],
                  ["Abuse contact", [r.abuseEmail, r.abusePhone].filter(Boolean).join(" · ") || "—"],
                  ["Registrar URL", r.registrarUrl ?? "—"],
                ]}
              />
            </div>
          </Panel>
          {r.contacts.length ? (
            <Panel title="Contacts (as published)">
              <ul className="space-y-2 text-sm">
                {r.contacts.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium capitalize">{c.roles.join(", ")}</span>: <span className="text-fg-muted">{[c.name, c.org, c.email].filter(Boolean).join(" · ") || "redacted for privacy"}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title="Raw RDAP response" actions={<CopyButton text={JSON.stringify(r.raw, null, 2)} />}>
            <details>
              <summary className="cursor-pointer text-sm text-fg-muted">Show JSON from {r.rdapServer}</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-bg-subtle p-3 font-mono text-xs">{JSON.stringify(r.raw, null, 2)}</pre>
            </details>
          </Panel>
          <p className="text-xs text-fg-subtle">Data comes from the registry&apos;s RDAP service, the modern replacement for WHOIS. Personal contact details are usually redacted under GDPR.</p>
        </>
      ) : null}
      <ActionBar onReset={api.reset} />
    </div>
  );
}
