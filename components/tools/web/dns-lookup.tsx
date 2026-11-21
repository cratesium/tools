"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Select } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { DOH_ENDPOINTS, RECORD_TYPE_LIST, describeRecord, dohQuery, normalizeDnsName, reverseName, type DnsResult, type DohProvider, type RecordType } from "@/lib/processors/web/dns";
import { useTask } from "@/lib/utils/hooks";
import { QueryBar } from "./common";

const COMMON: RecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "CAA"];

export default function DnsLookup(_props: ToolComponentProps) {
  const [type, setType] = useState<RecordType | "ALL">("ALL");
  const [provider, setProvider] = useState<DohProvider>("cloudflare");
  const [compare, setCompare] = useState(false);
  const task = useTask<{ name: string; results: DnsResult[] }>();
  const run = (raw: string) =>
    task.run(async (ctx) => {
      const ptr = reverseName(raw.trim());
      const name = ptr ?? normalizeDnsName(raw);
      const types: RecordType[] = ptr ? ["PTR"] : type === "ALL" ? COMMON : [type];
      const providers: DohProvider[] = compare ? ["cloudflare", "google"] : [provider];
      const jobs = providers.flatMap((p) => types.map((t) => ({ p, t })));
      let done = 0;
      const results = await Promise.all(
        jobs.map(async ({ p, t }) => {
          const r = await dohQuery(name, t, { provider: p, signal: ctx.signal });
          ctx.progress(++done / jobs.length);
          return r;
        }),
      );
      return { name, results };
    });
  const r = task.result;
  return (
    <div className="space-y-4">
      <QueryBar placeholder="example.com, a URL, or an IP for reverse DNS" label="Look up" running={task.running} onSubmit={run}>
        <Select aria-label="Record type" value={type} onChange={(e) => setType(e.target.value as RecordType | "ALL")} className="h-11 sm:w-36">
          <option value="ALL">Common types</option>
          {RECORD_TYPE_LIST.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </QueryBar>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Select aria-label="Resolver" value={provider} onChange={(e) => setProvider(e.target.value as DohProvider)} className="w-56" disabled={compare}>
          {(Object.keys(DOH_ENDPOINTS) as DohProvider[]).map((p) => (
            <option key={p} value={p}>
              {DOH_ENDPOINTS[p].label}
            </option>
          ))}
        </Select>
        <Checkbox label="Compare Cloudflare and Google" checked={compare} onChange={setCompare} />
      </div>
      <TaskProgress running={task.running} progress={task.progress} label="Querying DNS over HTTPS…" />
      <ErrorMessage error={task.error} />
      {r ? (
        <div className="space-y-3" data-testid="output">
          {r.results.map((x) => (
            <Panel
              key={`${x.provider}-${x.type}`}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{x.type}</span>
                  {compare ? <Badge>{DOH_ENDPOINTS[x.provider].label}</Badge> : null}
                  <span className="text-xs font-normal text-fg-subtle">
                    {x.statusName} · {x.timingMs} ms{x.ad ? " · DNSSEC validated" : ""}
                  </span>
                </span>
              }
            >
              {x.answers.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <tbody className="divide-y divide-border">
                      {x.answers.map((a, i) => (
                        <tr key={i} className="align-top">
                          <td className="py-1.5 pr-3 font-mono text-fg-muted">{a.typeName}</td>
                          <td className="py-1.5 pr-3 font-mono break-all text-fg">{a.data}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs whitespace-nowrap text-fg-subtle">TTL {a.ttl}s</td>
                          <td className="hidden py-1.5 text-xs text-fg-muted md:table-cell">{describeRecord(a)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-fg-subtle">{x.status === 3 ? "Domain does not exist (NXDOMAIN)." : "No records of this type."}</p>
              )}
            </Panel>
          ))}
        </div>
      ) : null}
      <Alert tone="info">Queries go directly from your browser to the public DNS-over-HTTPS resolver you choose; UtilityHub&apos;s servers are not involved.</Alert>
      <ActionBar onReset={task.reset} />
    </div>
  );
}
