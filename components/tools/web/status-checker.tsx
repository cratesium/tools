"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Textarea } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, Panel, TaskProgress } from "@/components/tools/shared";
import { apiPath, callApi, normalizeUrlInput, type InspectResponse } from "@/lib/processors/web/api";
import { statusInfo } from "@/lib/processors/web/headers";
import { useTask } from "@/lib/utils/hooks";
import { ApiErrorNotice, StatusPill } from "./common";

type Row = { input: string; result: InspectResponse | null; error: unknown };

export default function StatusChecker(_props: ToolComponentProps) {
  const [text, setText] = useState("");
  const task = useTask<Row[]>();
  const run = () =>
    task.run(async (ctx) => {
      const lines = [...new Set(text.split(/\s+/).map((s) => s.trim()).filter(Boolean))].slice(0, 25);
      if (!lines.length) throw new Error("Enter at least one URL.");
      const rows: Row[] = [];
      for (let i = 0; i < lines.length; i++) {
        let url = lines[i];
        try {
          url = normalizeUrlInput(lines[i]);
          rows.push({ input: url, result: await callApi<InspectResponse>(apiPath("/api/inspect", { url }), { signal: ctx.signal }), error: null });
        } catch (e) {
          if ((e as Error).name === "ApiUnavailableError") throw e;
          rows.push({ input: url, result: null, error: e });
        }
        ctx.progress((i + 1) / lines.length, `Checking ${url}`);
      }
      return rows;
    });
  const up = task.result?.filter((r) => r.result && r.result.status < 400).length ?? 0;
  return (
    <div className="space-y-4">
      <Panel title="Websites (one per line, up to 25)">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"example.com\nhttps://github.com"} aria-label="URLs" data-testid="input" className="min-h-[110px]" />
      </Panel>
      <ActionBar onRun={run} runLabel="Check status" running={task.running} disabled={!text.trim()} onCancel={task.cancel} onReset={() => (setText(""), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      {task.error ? <ApiErrorNotice error={{ name: task.error.includes("Cloudflare function") ? "ApiUnavailableError" : "Error", message: task.error }} /> : null}
      {task.result ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Up" value={up} />
            <Stat label="Down or erroring" value={task.result.length - up} />
          </div>
          <Panel title="Results">
            <ul className="divide-y divide-border" data-testid="output">
              {task.result.map((r) => (
                <li key={r.input} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <StatusPill status={r.result?.status ?? null} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{r.input}</span>
                  {r.result ? (
                    <span className="text-xs text-fg-muted">
                      {statusInfo(r.result.status).phrase} · {r.result.timingMs} ms{r.result.redirects.length ? ` · ${r.result.redirects.length} redirect(s)` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-danger">{(r.error as Error)?.message}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-xs text-fg-subtle">Checked from Cloudflare&apos;s network (the data centre nearest you), not from your own connection.</p>
        </>
      ) : null}
    </div>
  );
}
