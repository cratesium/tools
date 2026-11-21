"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import type { FolderDiffRow } from "@/lib/processors/files/folder";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { FolderPicker, FolderSummary, toRecords, type PickedFolder } from "./common";
import { cn } from "@/lib/utils/cn";

const LABEL: Record<FolderDiffRow["status"], [string, string]> = {
  changed: ["Changed", "text-warning"],
  "only-a": ["Only in A", "text-danger"],
  "only-b": ["Only in B", "text-success"],
  "maybe-same": ["Same size", "text-fg-subtle"],
  same: ["Identical", "text-fg-subtle"],
};

export default function FolderCompare(_props: ToolComponentProps) {
  const [a, setA] = useState<PickedFolder | null>(null);
  const [b, setB] = useState<PickedFolder | null>(null);
  const [deep, setDeep] = useState(true);
  const [show, setShow] = useState<"diff" | "all">("diff");
  const task = useTask<FolderDiffRow[]>();
  const run = () =>
    task.run(async (ctx) => {
      if (!a || !b) throw new Error("Choose both folders.");
      const { compareFolders } = await import("@/lib/processors/files/folder");
      const ra = toRecords(a.files);
      const rb = toRecords(b.files);
      if (!deep) return compareFolders(ra, rb);
      const { hashBlob, encodeDigest } = await import("@/lib/processors/security/hash");
      const mb = new Map(b.files.map((p) => [p.path, p.file]));
      const pairs = a.files.filter((p) => mb.get(p.path)?.size === p.file.size);
      const da = new Map<string, string>();
      const db = new Map<string, string>();
      for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        const [x, y] = await Promise.all([hashBlob(p.file, ["xxh64"]), hashBlob(mb.get(p.path)!, ["xxh64"])]);
        da.set(p.path, encodeDigest(x.xxh64, "hex"));
        db.set(p.path, encodeDigest(y.xxh64, "hex"));
        ctx.progress((i + 1) / pairs.length, `Comparing ${p.path}`);
      }
      return compareFolders(ra, rb, da, db);
    });
  const rows = useMemo(() => (task.result ?? []).filter((r) => show === "all" || (r.status !== "same" && r.status !== "maybe-same")), [task.result, show]);
  const count = (s: FolderDiffRow["status"]) => task.result?.filter((r) => r.status === s).length ?? 0;
  const csv = task.result ? "status,path,size_a,size_b\n" + task.result.map((r) => `${r.status},${JSON.stringify(r.path)},${r.sizeA ?? ""},${r.sizeB ?? ""}`).join("\n") : "";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Folder A">{a ? <FolderSummary folder={a} onClear={() => (setA(null), task.reset())} /> : <FolderPicker compact onPick={(f) => (setA(f), task.reset())} label="Drop folder A" />}</Panel>
        <Panel title="Folder B">{b ? <FolderSummary folder={b} onClear={() => (setB(null), task.reset())} /> : <FolderPicker compact onPick={(f) => (setB(f), task.reset())} label="Drop folder B" />}</Panel>
      </div>
      <Checkbox label="Compare file contents" description="Hash same-size files (xxHash64) to separate identical from changed" checked={deep} onChange={setDeep} />
      <ActionBar onRun={run} runLabel="Compare folders" running={task.running} disabled={!a || !b} onReset={() => (setA(null), setB(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Only in A" value={count("only-a")} />
            <Stat label="Only in B" value={count("only-b")} />
            <Stat label="Changed" value={count("changed")} />
            <Stat label={deep ? "Identical" : "Same size"} value={count("same") + count("maybe-same")} />
          </div>
          <Panel
            title="Differences"
            actions={
              <>
                <Segmented label="Show" value={show} onChange={setShow} options={[{ value: "diff", label: "Differences" }, { value: "all", label: "All" }]} />
                <DownloadButton text={csv} filename="folder-diff.csv" label="CSV" size="sm" variant="secondary" />
              </>
            }
          >
            <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-[13px]" data-testid="output">
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 3000).map((r) => (
                    <tr key={r.path}>
                      <td className={cn("w-28 px-3 py-1.5 font-medium", LABEL[r.status][1])}>{LABEL[r.status][0]}</td>
                      <td className="max-w-0 truncate px-3 py-1.5 font-mono" title={r.path}>
                        {r.path}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap text-fg-muted">
                        {r.sizeA != null ? formatBytes(r.sizeA) : "—"} → {r.sizeB != null ? formatBytes(r.sizeB) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length ? <p className="p-4 text-sm text-success">No differences.</p> : null}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
