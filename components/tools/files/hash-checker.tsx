"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, CopyButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { HASH_INFO, encodeDigest, extractDigest, hashBlob, type HashAlgorithm } from "@/lib/processors/security/hash";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

const ALGOS: HashAlgorithm[] = ["md5", "sha1", "sha256", "sha512", "crc32"];
type Row = { name: string; size: number; hex: Record<string, string> };

/** Every common hash of one or more files at a glance, with instant match highlighting against a pasted hash. */
export default function HashChecker(_props: ToolComponentProps) {
  const [expected, setExpected] = useState("");
  const task = useTask<Row[]>();
  const want = extractDigest(expected).toLowerCase();
  const run = (files: File[]) =>
    task.run(async (ctx) => {
      const rows: Row[] = [...(task.result ?? [])];
      const total = files.reduce((s, f) => s + f.size, 0) || 1;
      let done = 0;
      for (const f of files) {
        const d = await hashBlob(f, ALGOS, { signal: ctx.signal, onProgress: (x) => ctx.progress((done + x * f.size) / total, `Hashing ${f.name}`) });
        done += f.size;
        rows.push({ name: f.name, size: f.size, hex: Object.fromEntries(ALGOS.map((a) => [a, encodeDigest(d[a], "hex")])) });
      }
      return rows;
    });
  const matches = task.result?.flatMap((r) => ALGOS.filter((a) => want && r.hex[a] === want).map((a) => `${r.name} (${HASH_INFO[a].label})`)) ?? [];
  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Any files, any size" onFiles={run} />
      <Field label="Compare with a known hash (optional)">
        {(id) => <Input id={id} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Paste a hash to highlight matches" className="font-mono" data-testid="input" />}
      </Field>
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {want && task.result?.length ? (
        matches.length ? <Alert tone="success" title="Match found">{matches.join(", ")}</Alert> : <Alert tone="danger" title="No match">None of the files&apos; hashes equal the value you pasted.</Alert>
      ) : null}
      {task.result?.map((r, i) => (
        <Panel key={`${r.name}-${i}`} title={`${r.name} · ${formatBytes(r.size)}`}>
          <ul className="space-y-1" data-testid="output">
            {ALGOS.map((a) => (
              <li key={a} className={`flex items-center gap-3 rounded px-1 ${want && r.hex[a] === want ? "bg-success-bg" : ""}`}>
                <span className="w-20 shrink-0 text-xs text-fg-muted">{HASH_INFO[a].label}</span>
                <code className="min-w-0 flex-1 font-mono text-[12px] break-all">{r.hex[a]}</code>
                <CopyButton text={r.hex[a]} label="" />
              </li>
            ))}
          </ul>
        </Panel>
      ))}
      <ActionBar onReset={() => (setExpected(""), task.reset())} />
    </div>
  );
}
