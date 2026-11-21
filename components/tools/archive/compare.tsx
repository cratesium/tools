"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, DownloadButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import type { DiffRow, DiffStatus, EntrySignature } from "@/lib/processors/archive/compare";
import { formatBytes } from "@/lib/utils/format";
import { useTask, type TaskContext } from "@/lib/utils/hooks";
import { openAny } from "./common";
import { cn } from "@/lib/utils/cn";

async function signatures(file: File, deep: boolean, ctx: TaskContext, base: number): Promise<EntrySignature[]> {
  const arch = await openAny(file);
  try {
    const { crc32, crc32Hex } = await import("@/lib/processors/archive/crc32");
    const items = arch.items.filter((i) => !i.directory);
    const out: EntrySignature[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let digest = it.crc32 != null ? crc32Hex(it.crc32) : undefined;
      if (!digest && deep) digest = crc32Hex(crc32(await it.read()));
      out.push({ path: it.path, size: it.size, digest });
      ctx.progress(base + ((i + 1) / items.length) * 0.5, `Reading ${file.name}`);
    }
    return out;
  } finally {
    await arch.close();
  }
}

const TONE: Record<DiffStatus, string> = { added: "text-success", removed: "text-danger", changed: "text-warning", unchanged: "text-fg-subtle" };

export default function CompareArchives(_props: ToolComponentProps) {
  const [a, setA] = useState<File | null>(null);
  const [b, setB] = useState<File | null>(null);
  const [deep, setDeep] = useState(true);
  const [show, setShow] = useState<"diff" | "all">("diff");
  const task = useTask<{ rows: DiffRow[]; summary: Record<DiffStatus, number> }>();

  const run = () =>
    task.run(async (ctx) => {
      if (!a || !b) throw new Error("Add both archives.");
      const { diffArchiveEntries, summariseDiff } = await import("@/lib/processors/archive/compare");
      const sa = await signatures(a, deep, ctx, 0);
      const sb = await signatures(b, deep, ctx, 0.5);
      const rows = diffArchiveEntries(sa, sb);
      return { rows, summary: summariseDiff(rows) };
    });

  const rows = useMemo(() => (task.result ? task.result.rows.filter((r) => show === "all" || r.status !== "unchanged") : []), [task.result, show]);
  const csv = task.result ? "status,path,size_a,size_b,digest_a,digest_b\n" + task.result.rows.map((r) => [r.status, JSON.stringify(r.path), r.sizeA ?? "", r.sizeB ?? "", r.digestA ?? "", r.digestB ?? ""].join(",")).join("\n") : "";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Archive A (original)">{a ? <FileList files={[a]} onClear={() => (setA(null), task.reset())} /> : <Dropzone formatsLabel="ZIP, RAR, 7Z, TAR, TGZ" onFiles={([f]) => (setA(f), task.reset())} />}</Panel>
        <Panel title="Archive B (new)">{b ? <FileList files={[b]} onClear={() => (setB(null), task.reset())} /> : <Dropzone formatsLabel="ZIP, RAR, 7Z, TAR, TGZ" onFiles={([f]) => (setB(f), task.reset())} />}</Panel>
      </div>
      <Checkbox label="Compare contents" description="Compute CRC-32 for formats that don't store it (TAR, 7Z, RAR). Slower, but detects same-size changes." checked={deep} onChange={setDeep} />
      <ActionBar onRun={run} runLabel="Compare" running={task.running} disabled={!a || !b} onReset={() => (setA(null), setB(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Added in B" value={task.result.summary.added} />
            <Stat label="Removed from A" value={task.result.summary.removed} />
            <Stat label="Changed" value={task.result.summary.changed} />
            <Stat label="Unchanged" value={task.result.summary.unchanged} />
          </div>
          <Panel
            title="Entries"
            actions={
              <>
                <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "diff", label: "Differences" }, { value: "all", label: "All" }]} />
                <DownloadButton text={csv} filename="archive-diff.csv" label="CSV" size="sm" variant="secondary" />
              </>
            }
          >
            {rows.length ? (
              <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
                <table className="w-full text-[13px]" data-testid="output">
                  <thead className="sticky top-0 bg-bg-muted text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Path</th>
                      <th className="px-3 py-2 text-right font-medium">Size A</th>
                      <th className="px-3 py-2 text-right font-medium">Size B</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.path}>
                        <td className={cn("px-3 py-1.5 font-medium capitalize", TONE[r.status])}>{r.status}</td>
                        <td className="max-w-0 truncate px-3 py-1.5 font-mono" title={r.reason ? `${r.path} – ${r.reason}` : r.path}>
                          {r.path}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-fg-muted">{r.sizeA != null ? formatBytes(r.sizeA) : "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-fg-muted">{r.sizeB != null ? formatBytes(r.sizeB) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-success">The archives contain identical files.</p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
