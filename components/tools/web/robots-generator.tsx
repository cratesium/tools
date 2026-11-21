"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, Panel, TextOutput } from "@/components/tools/shared";
import { AI_CRAWLERS, PRESETS, generateRobotsTxt, isAllowed, parseRobotsTxt, type RobotsGroup } from "@/lib/processors/web/robots";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function Generator() {
  const [groups, setGroups] = useState<RobotsGroup[]>(PRESETS[0].build());
  const [sitemaps, setSitemaps] = useState("https://example.com/sitemap.xml");
  const out = useMemo(() => generateRobotsTxt({ groups, sitemaps: lines(sitemaps) }), [groups, sitemaps]);
  const upd = (i: number, patch: Partial<RobotsGroup>) => setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.id} size="sm" variant="secondary" onClick={() => setGroups(p.build())} title={p.description}>
            {p.label}
          </Button>
        ))}
      </div>
      {groups.map((g, i) => (
        <Panel
          key={i}
          title={`Rule group ${i + 1}`}
          actions={groups.length > 1 ? <Button size="icon" variant="ghost" aria-label="Remove group" onClick={() => setGroups((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button> : null}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="User-agents" hint="one per line">{(id) => <Textarea id={id} value={g.userAgents.join("\n")} onChange={(e) => upd(i, { userAgents: lines(e.target.value) })} className="min-h-[90px]" />}</Field>
            <Field label="Disallow" hint="paths">{(id) => <Textarea id={id} value={g.disallow.join("\n")} onChange={(e) => upd(i, { disallow: e.target.value.split("\n").map((x) => x.trim()) })} className="min-h-[90px]" placeholder="/admin/" />}</Field>
            <Field label="Allow" hint="exceptions">{(id) => <Textarea id={id} value={g.allow.join("\n")} onChange={(e) => upd(i, { allow: lines(e.target.value) })} className="min-h-[90px]" />}</Field>
            <Field label="Crawl-delay" hint="seconds, optional">{(id) => <Input id={id} type="number" min={0} value={g.crawlDelay ?? ""} onChange={(e) => upd(i, { crawlDelay: e.target.value ? Number(e.target.value) : null })} />}</Field>
          </div>
        </Panel>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setGroups((g) => [...g, { userAgents: ["*"], allow: [], disallow: [] }])}>
          Add group
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setGroups((g) => [...g, { userAgents: AI_CRAWLERS.map((c) => c.token), allow: [], disallow: ["/"] }])}>
          Add “block AI crawlers” group
        </Button>
      </div>
      <Field label="Sitemap URLs" hint="one per line, absolute">{(id) => <Textarea id={id} value={sitemaps} onChange={(e) => setSitemaps(e.target.value)} className="min-h-[60px]" />}</Field>
      <TextOutput value={out} filename="robots.txt" label="robots.txt" rows={12} />
      <Alert tone="info">robots.txt is a request, not access control – well-behaved crawlers follow it, others may not. Never rely on it to hide private pages.</Alert>
    </div>
  );
}

function Validator() {
  const [text, setText] = useState("User-agent: *\nDisallow: /private/\nAllow: /private/public.html\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml");
  const [agent, setAgent] = useState("Googlebot");
  const [path, setPath] = useState("/private/page.html");
  const parsed = useMemo(() => parseRobotsTxt(text), [text]);
  const v = useMemo(() => isAllowed(parsed, agent, path), [parsed, agent, path]);
  return (
    <div className="space-y-4">
      <Panel title="robots.txt">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="robots.txt" data-testid="input" className="min-h-[200px]" />
      </Panel>
      <Panel title={`Issues (${parsed.issues.length})`}>
        {parsed.issues.length ? (
          <ul className="space-y-1 text-sm" data-testid="output">
            {parsed.issues.map((i, k) => (
              <li key={k}>
                <Badge className={i.severity === "error" ? "text-danger" : i.severity === "warning" ? "text-warning" : ""}>line {i.line}</Badge> {i.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-success" data-testid="output">No problems found. {parsed.groups.length} group(s), {parsed.sitemaps.length} sitemap(s).</p>
        )}
      </Panel>
      <Panel title="Test a URL">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Crawler">{(id) => <Input id={id} value={agent} onChange={(e) => setAgent(e.target.value)} />}</Field>
          <Field label="Path or URL">{(id) => <Input id={id} value={path} onChange={(e) => setPath(e.target.value)} />}</Field>
        </div>
        <Alert tone={v.allowed ? "success" : "danger"} className="mt-3" title={v.allowed ? "Allowed" : "Blocked"}>
          {v.rule ? `Matched rule “${v.rule.type}: ${v.rule.path}”` : "No rule matched – allowed by default"}
          {v.matchedAgent ? ` in the group for “${v.matchedAgent}”.` : "."}
        </Alert>
      </Panel>
    </div>
  );
}

export default function RobotsGenerator(_props: ToolComponentProps) {
  const [tab, setTab] = useState<"gen" | "check">("gen");
  return (
    <div className="space-y-4">
      <Segmented label="Mode" value={tab} onChange={setTab} options={[{ value: "gen", label: "Generate" }, { value: "check", label: "Validate & test" }]} />
      {tab === "gen" ? <Generator /> : <Validator />}
      <ActionBar onReset={() => setTab((t) => t)} />
    </div>
  );
}
