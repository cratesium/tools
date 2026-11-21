"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, FileResult, Panel, TaskProgress } from "@/components/tools/shared";
import { planOrganize, type OrganizeMode } from "@/lib/processors/files/folder";
import { useTask } from "@/lib/utils/hooks";
import { FolderPicker, FolderSummary, toRecords, type FileSystemDirectoryHandleLike, type PickedFolder } from "./common";

async function getDir(root: FileSystemDirectoryHandleLike, path: string, create = false) {
  let d = root;
  for (const seg of path.split("/").filter(Boolean)) d = await d.getDirectoryHandle(seg, { create });
  return d;
}

export default function Organizer(_props: ToolComponentProps) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [mode, setMode] = useState<OrganizeMode>("category");
  const task = useTask<{ kind: "zip"; blob: Blob } | { kind: "inplace"; moved: number }>();
  const plan = useMemo(() => (folder ? planOrganize(toRecords(folder.files), mode) : []), [folder, mode]);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plan) m.set(p.folder, (m.get(p.folder) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [plan]);
  const byPath = useMemo(() => new Map(folder?.files.map((p) => [p.path, p.file]) ?? []), [folder]);

  const asZip = () =>
    task.run(async (ctx) => {
      const { createZip } = await import("@/lib/processors/archive/zipio");
      const blob = await createZip(plan.map((p) => ({ path: p.to, data: byPath.get(p.from)!, lastModified: byPath.get(p.from)!.lastModified })), { level: 0, signal: ctx.signal, onProgress: (x) => ctx.progress(x) });
      return { kind: "zip", blob };
    });

  const inPlace = () =>
    task.run(async (ctx) => {
      const root = folder!.handle!;
      const todo = plan.filter((p) => p.from !== p.to);
      for (let i = 0; i < todo.length; i++) {
        const p = todo[i];
        const fromDir = await getDir(root, p.from.split("/").slice(0, -1).join("/"));
        const name = p.from.split("/").pop()!;
        const toDir = await getDir(root, p.to.split("/").slice(0, -1).join("/"), true);
        const fh = await fromDir.getFileHandle(name);
        const target = p.to.split("/").pop()!;
        if (fh.move) await fh.move(toDir, target);
        else {
          const nh = await toDir.getFileHandle(target, { create: true });
          const w = await nh.createWritable();
          await w.write(await fh.getFile());
          await w.close();
          await fromDir.removeEntry(name);
        }
        ctx.progress((i + 1) / todo.length, `Moving ${name}`);
      }
      return { kind: "inplace", moved: todo.length };
    });

  return (
    <div className="space-y-4">
      {folder ? <FolderSummary folder={folder} onClear={() => (setFolder(null), task.reset())} /> : <FolderPicker onPick={(f) => (setFolder(f), task.reset())} writable label="Drop a messy folder (e.g. Downloads)" />}
      <Segmented
        label="Organise by"
        value={mode}
        onChange={(v) => (setMode(v), task.reset())}
        options={[
          { value: "category", label: "Type (Images, Documents…)" },
          { value: "extension", label: "Extension" },
          { value: "year", label: "Year" },
          { value: "month", label: "Year/Month" },
          { value: "size", label: "Size" },
        ]}
      />
      {groups.length ? (
        <Panel title="Planned folders">
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3" data-testid="output">
            {groups.map(([g, n]) => (
              <li key={g} className="flex justify-between rounded-md border border-border px-3 py-1.5">
                <span className="truncate">{g}/</span>
                <span className="text-fg-subtle">{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-subtle">Dates use each file&apos;s last-modified time. Name clashes inside a destination folder are resolved automatically.</p>
        </Panel>
      ) : null}
      <ActionBar onReset={() => (setFolder(null), task.reset())}>
        <Button size="lg" onClick={asZip} disabled={!plan.length || task.running} data-testid="run">
          Download organised ZIP
        </Button>
        {folder?.handle ? (
          <Button size="lg" variant="secondary" onClick={inPlace} disabled={!plan.length || task.running}>
            Organise folder in place
          </Button>
        ) : null}
      </ActionBar>
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel ?? "Working…"} />
      <ErrorMessage error={task.error} />
      {task.result?.kind === "zip" ? <FileResult blob={task.result.blob} filename={`${folder?.name || "files"}-organised.zip`} preview={false} label="Organised copy" /> : null}
      {task.result?.kind === "inplace" ? <Alert tone="success">Moved {task.result.moved} files into subfolders of “{folder?.name}”.</Alert> : null}
    </div>
  );
}
