"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Textarea } from "@/components/ui/field";
import { Badge, Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, CopyButton, KeyValueTable, Panel } from "@/components/tools/shared";
import { parseUserAgent } from "@/lib/processors/web/user-agent";

type Hints = Record<string, unknown> | null;

export default function UserAgentChecker(_props: ToolComponentProps) {
  // Client-only tool UI (mounted after hydration), so navigator is available.
  const [own] = useState(() => navigator.userAgent);
  const [ua, setUa] = useState(own);
  const [hints, setHints] = useState<Hints>(null);
  const p = useMemo(() => parseUserAgent(ua), [ua]);
  useEffect(() => {
    const uaData = (navigator as unknown as { userAgentData?: { getHighEntropyValues(k: string[]): Promise<Record<string, unknown>> } }).userAgentData;
    uaData
      ?.getHighEntropyValues(["platform", "platformVersion", "architecture", "bitness", "model", "fullVersionList", "mobile", "formFactors"])
      .then(setHints)
      .catch(() => setHints(null));
  }, []);
  const nv = (n: { name: string | null; version: string | null }) => [n.name, n.version].filter(Boolean).join(" ") || "Unknown";
  return (
    <div className="space-y-4">
      <Panel title={ua === own ? "Your browser's user agent" : "User agent to analyse"} actions={<><CopyButton text={ua} />{ua !== own ? <Button size="sm" variant="ghost" onClick={() => setUa(own)}>Use mine</Button> : null}</>}>
        <Textarea value={ua} onChange={(e) => setUa(e.target.value)} aria-label="User agent" data-testid="input" className="min-h-[90px]" />
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="output">
        <Stat label="Browser" value={nv(p.browser)} />
        <Stat label="Engine" value={nv(p.engine)} />
        <Stat label="Operating system" value={nv(p.os)} />
        <Stat label="Device" value={<span className="capitalize">{p.device.type}</span>} sub={[p.device.vendor, p.device.model].filter(Boolean).join(" ") || undefined} />
      </div>
      {p.bot.isBot ? <Badge className="text-info">Bot detected: {p.bot.name} ({p.bot.category})</Badge> : null}
      {p.isWebView ? <Badge>In-app browser / WebView</Badge> : null}
      {p.notes.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {ua === own && hints ? (
        <Panel title="User-Agent Client Hints (more accurate, Chromium only)">
          <KeyValueTable
            rows={Object.entries(hints).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? `${(x as { brand: string }).brand} ${(x as { version: string }).version}` : String(x))).join(", ") : String(v)])}
          />
        </Panel>
      ) : null}
      {ua === own ? (
        <Panel title="Other browser details">
          <KeyValueTable
            rows={[
              ["Screen", `${screen.width} × ${screen.height} @ ${window.devicePixelRatio}x`],
              ["Viewport", `${window.innerWidth} × ${window.innerHeight}`],
              ["Languages", navigator.languages?.join(", ") ?? navigator.language],
              ["Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone],
              ["Cookies enabled", String(navigator.cookieEnabled)],
              ["Touch points", String(navigator.maxTouchPoints ?? 0)],
              ["CPU threads", String(navigator.hardwareConcurrency ?? "—")],
            ]}
          />
        </Panel>
      ) : null}
      <ActionBar onReset={() => setUa(own)} />
    </div>
  );
}
