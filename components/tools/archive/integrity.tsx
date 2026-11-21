"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Alert, Badge, Stat } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { ARCHIVE_LABEL } from "@/lib/processors/archive/detect";
import { formatBytes } from "@/lib/utils/format";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { isPasswordError, openAny } from "./common";

type Row = { path: string; size: number; ok: boolean; error?: string };
type Result = { format: string; rows: Row[]; notes: string[]; verified: string };

/** Reads every entry, verifying CRC-32 (ZIP/GZIP), AES authentication, TAR header checksums or libarchive decoding. */
export default function IntegrityTester(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");
  const [needPw, setNeedPw] = useState(false);
  const task = useTask<Result>();

  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Add an archive.");
      let arch;
      try {
        arch = await openAny(file, pw);
      } catch (e) {
        if (isPasswordError(e)) {
          setNeedPw(true);
          throw new Error(pw ? "Wrong password." : "This archive is encrypted. Enter the password to test its contents.");
        }
        throw new Error(`The archive structure is damaged or unsupported: ${errorMessage(e)}`);
      }
      try {
        if (arch.encrypted && !pw) {
          setNeedPw(true);
          throw new Error("This archive is encrypted. Enter the password to test its contents.");
        }
        const items = arch.items.filter((i) => !i.directory);
        const total = items.reduce((s, i) => s + (i.size || 1), 0) || 1;
        let done = 0;
        const rows: Row[] = [];
        for (const it of items) {
          if (ctx.signal.aborted) break;
          try {
            await it.read();
            rows.push({ path: it.path, size: it.size, ok: true });
          } catch (e) {
            rows.push({ path: it.path, size: it.size, ok: false, error: errorMessage(e) });
          }
          done += it.size || 1;
          ctx.progress(done / total, `Testing ${it.path}`);
        }
        const verified =
          arch.format === "zip" ? "CRC-32 of every entry (and AES authentication codes for AES-encrypted entries)" : arch.format === "gzip" || arch.format === "tgz" ? "GZIP CRC-32 and length, plus TAR header checksums" : arch.format === "tar" ? "TAR header checksums (TAR stores no content checksums)" : "full decompression with libarchive, including the format's own checks";
        return { format: ARCHIVE_LABEL[arch.format] ?? arch.format, rows, notes: arch.notes, verified };
      } finally {
        await arch.close();
      }
    });

  const bad = task.result?.rows.filter((r) => !r.ok) ?? [];

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), setNeedPw(false), task.reset())} /> : <Dropzone formatsLabel="ZIP, RAR, 7Z, TAR, GZ, TGZ" maxSize={2 * 1024 * 1024 * 1024} onFiles={([f]) => (setFile(f), task.reset())} />}
      {needPw ? (
        <Field label="Archive password" className="max-w-xs">
          {(id) => <Input id={id} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />}
        </Field>
      ) : null}
      <ActionBar onRun={run} runLabel="Test archive" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), setPw(""), setNeedPw(false), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          {bad.length || task.result.notes.length ? (
            <Alert tone="danger" title={`${bad.length} of ${task.result.rows.length} entries failed`}>
              The archive is damaged. Entries marked as failed cannot be extracted correctly.
            </Alert>
          ) : (
            <Alert tone="success" title="No errors found">
              All {task.result.rows.length} entries were read successfully.
            </Alert>
          )}
          {task.result.notes.map((n) => (
            <Alert key={n} tone="warning">
              {n}
            </Alert>
          ))}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Format" value={<Badge>{task.result.format}</Badge>} />
            <Stat label="Entries tested" value={task.result.rows.length} />
            <Stat label="Failed" value={bad.length} />
          </div>
          <Panel title="Results">
            <p className="mb-3 text-xs text-fg-subtle">Verified: {task.result.verified}.</p>
            <ul className="max-h-96 divide-y divide-border overflow-auto rounded-lg border border-border text-[13px]" data-testid="output">
              {[...bad, ...task.result.rows.filter((r) => r.ok)].slice(0, 3000).map((r) => (
                <li key={r.path} className="flex items-center gap-3 px-3 py-1.5">
                  <span className={r.ok ? "text-success" : "text-danger"}>{r.ok ? "✓" : "✗"}</span>
                  <span className="min-w-0 flex-1 truncate font-mono" title={r.path}>
                    {r.path}
                  </span>
                  {r.error ? <span className="truncate text-xs text-danger">{r.error}</span> : <span className="font-mono text-xs text-fg-subtle">{formatBytes(r.size)}</span>}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
