"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, TaskProgress } from "@/components/tools/shared";
import { looksLikeText, readHead } from "@/lib/processors/files/signatures";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

type Result = { identical: boolean; firstDiff: number | null; diffBytes: number; sha: [string, string]; sizes: [number, number]; text: { added: number; removed: number; parts: { value: string; added?: boolean; removed?: boolean }[] } | null };

const CHUNK = 4 * 1024 * 1024;

export default function FileCompare(_props: ToolComponentProps) {
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const task = useTask<Result>();
  const run = () =>
    task.run(async (ctx) => {
      if (!a || !b) throw new Error("Add both files.");
      const { hashBlob, encodeDigest } = await import("@/lib/processors/security/hash");
      let firstDiff: number | null = null;
      let diffBytes = 0;
      const n = Math.max(a.size, b.size);
      for (let off = 0; off < n; off += CHUNK) {
        const [x, y] = await Promise.all([a.slice(off, off + CHUNK).arrayBuffer(), b.slice(off, off + CHUNK).arrayBuffer()]).then(([p, q]) => [new Uint8Array(p), new Uint8Array(q)]);
        const len = Math.max(x.length, y.length);
        for (let i = 0; i < len; i++) {
          if (x[i] !== y[i]) {
            if (firstDiff == null) firstDiff = off + i;
            diffBytes++;
          }
        }
        ctx.progress(Math.min(1, (off + CHUNK) / n) * 0.7, "Comparing bytes…");
      }
      const [ha, hb] = await Promise.all([hashBlob(a, ["sha256"]), hashBlob(b, ["sha256"])]);
      let text: Result["text"] = null;
      const [ta, tb] = await Promise.all([readHead(a), readHead(b)]);
      if (firstDiff != null && a.size < 5e6 && b.size < 5e6 && looksLikeText(ta).text && looksLikeText(tb).text) {
        const { diffLines } = await import("diff");
        const parts = diffLines(await a.text(), await b.text());
        text = { parts, added: parts.filter((p) => p.added).reduce((s, p) => s + (p.count ?? 0), 0), removed: parts.filter((p) => p.removed).reduce((s, p) => s + (p.count ?? 0), 0) };
      }
      return { identical: firstDiff == null, firstDiff, diffBytes, sha: [encodeDigest(ha.sha256, "hex"), encodeDigest(hb.sha256, "hex")], sizes: [a.size, b.size], text };
    });
  const r = task.result;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="File A">{a ? <FileList files={[a]} onClear={() => (setA(null), task.reset())} /> : <Dropzone formatsLabel="Any file" onFiles={([f]) => (setA(f), task.reset())} />}</Panel>
        <Panel title="File B">{b ? <FileList files={[b]} onClear={() => (setB(null), task.reset())} /> : <Dropzone formatsLabel="Any file" onFiles={([f]) => (setB(f), task.reset())} />}</Panel>
      </div>
      <ActionBar onRun={run} runLabel="Compare files" running={task.running} disabled={!a || !b} onReset={() => (setA(null), setB(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {r ? (
        <>
          {r.identical ? <Alert tone="success" title="The files are identical">Every byte matches.</Alert> : <Alert tone="warning" title="The files are different">First difference at byte offset {r.firstDiff?.toLocaleString()} (0x{r.firstDiff?.toString(16)}).</Alert>}
          <Panel title="Details">
            <KeyValueTable
              rows={[
                ["Size A", `${formatBytes(r.sizes[0])} (${r.sizes[0].toLocaleString()} B)`],
                ["Size B", `${formatBytes(r.sizes[1])} (${r.sizes[1].toLocaleString()} B)`],
                ["Differing bytes", r.diffBytes.toLocaleString()],
                ["SHA-256 A", r.sha[0]],
                ["SHA-256 B", r.sha[1]],
              ]}
            />
          </Panel>
          {r.text ? (
            <Panel title={`Text differences (+${r.text.added} / −${r.text.removed} lines)`}>
              <pre className="max-h-96 overflow-auto rounded-lg bg-bg-subtle p-3 font-mono text-xs" data-testid="output">
                {r.text.parts.map((p, i) => (
                  <span key={i} className={p.added ? "bg-success-bg text-success" : p.removed ? "bg-danger-bg text-danger line-through" : "text-fg-muted"}>
                    {p.value}
                  </span>
                ))}
              </pre>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
