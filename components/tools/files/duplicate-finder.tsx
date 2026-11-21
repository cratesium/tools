"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Alert, Stat } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { groupByDigest, groupBySize } from "@/lib/processors/files/folder";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { FolderPicker, FolderSummary, type PickedFile, type PickedFolder } from "./common";

export default function DuplicateFinder(_props: ToolComponentProps) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const task = useTask<{ groups: PickedFile[][]; hashed: number }>();
  const run = (f: PickedFolder) =>
    task.run(async (ctx) => {
      const { hashBlob, encodeDigest } = await import("@/lib/processors/security/hash");
      const candidates = groupBySize(f.files.filter((p) => p.file.size > 0).map((p) => ({ ...p, size: p.file.size }))).flat();
      const total = candidates.reduce((s, c) => s + c.size, 0) || 1;
      let done = 0;
      const pairs: { item: PickedFile; digest: string }[] = [];
      for (const c of candidates) {
        const d = await hashBlob(c.file, ["sha256"], { signal: ctx.signal, onProgress: (x) => ctx.progress((done + x * c.size) / total, `Hashing ${c.path}`) });
        done += c.size;
        pairs.push({ item: c, digest: encodeDigest(d.sha256, "hex") });
      }
      const groups = groupByDigest(pairs).sort((a, b) => b[0].file.size * (b.length - 1) - a[0].file.size * (a.length - 1));
      return { groups, hashed: candidates.length };
    });
  const wasted = task.result?.groups.reduce((s, g) => s + g[0].file.size * (g.length - 1), 0) ?? 0;
  const report = task.result ? task.result.groups.map((g, i) => `# Group ${i + 1} – ${formatBytes(g[0].file.size)} each\n${g.map((p) => p.path).join("\n")}`).join("\n\n") + "\n" : "";
  return (
    <div className="space-y-4">
      {folder ? <FolderSummary folder={folder} onClear={() => (setFolder(null), task.reset())} /> : <FolderPicker onPick={(f) => (setFolder(f), run(f))} allowFiles label="Drop a folder to scan for duplicates" />}
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Duplicate groups" value={task.result.groups.length} />
            <Stat label="Redundant copies" value={task.result.groups.reduce((s, g) => s + g.length - 1, 0)} />
            <Stat label="Space you could free" value={formatBytes(wasted)} />
          </div>
          {task.result.groups.length ? (
            <Panel title="Identical files" actions={<DownloadButton text={report} filename="duplicates.txt" label="Report" size="sm" variant="secondary" />}>
              <ol className="space-y-3" data-testid="output">
                {task.result.groups.map((g, i) => (
                  <li key={i} className="rounded-lg border border-border p-3">
                    <p className="mb-1.5 text-xs text-fg-subtle">
                      {g.length} copies · {formatBytes(g[0].file.size)} each
                    </p>
                    <ul className="space-y-0.5 font-mono text-[13px]">
                      {g.map((p) => (
                        <li key={p.path} className="truncate" title={p.path}>
                          {p.path}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : (
            <Alert tone="success">No duplicate files found among {folder?.files.length} files.</Alert>
          )}
          <p className="text-xs text-fg-subtle">Files are grouped by size first; only same-size files ({task.result.hashed}) are hashed with SHA-256, so matches are exact byte-for-byte duplicates. Nothing is deleted.</p>
        </>
      ) : null}
      <ActionBar onReset={() => (setFolder(null), task.reset())} />
    </div>
  );
}
