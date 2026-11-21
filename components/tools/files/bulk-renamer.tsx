"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, ErrorMessage, FileResult, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { renameAll, validateRegex, type CaseMode, type RenameRules } from "@/lib/processors/files/rename";
import { useTask } from "@/lib/utils/hooks";
import { FolderPicker, FolderSummary, type FileSystemDirectoryHandleLike, type PickedFolder } from "./common";
import { cn } from "@/lib/utils/cn";

const DEFAULT: RenameRules = {
  find: "",
  replace: "",
  useRegex: false,
  caseSensitive: false,
  prefix: "",
  suffix: "",
  numbering: { enabled: false, start: 1, step: 1, padding: 3, position: "prefix", separator: "-" },
  caseMode: "keep",
  extension: "",
  extensionCase: "keep",
  trimSpaces: true,
};

async function dirFor(root: FileSystemDirectoryHandleLike, path: string): Promise<FileSystemDirectoryHandleLike> {
  let d = root;
  for (const seg of path.split("/").slice(0, -1).filter(Boolean)) d = await d.getDirectoryHandle(seg);
  return d;
}

export default function BulkRenamer(_props: ToolComponentProps) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [rules, setRules] = useState<RenameRules>(DEFAULT);
  const task = useTask<{ kind: "zip"; blob: Blob } | { kind: "inplace"; count: number }>();
  const set = <K extends keyof RenameRules>(k: K, v: RenameRules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const num = rules.numbering!;
  const setNum = (patch: Partial<typeof num>) => setRules((r) => ({ ...r, numbering: { ...r.numbering!, ...patch } }));
  const regexError = rules.useRegex && rules.find ? validateRegex(rules.find, rules.caseSensitive ? "g" : "gi") : null;

  const preview = useMemo(() => {
    if (!folder || regexError) return [];
    // Rename per directory so numbering and conflicts are scoped to siblings.
    const byDir = new Map<string, number[]>();
    folder.files.forEach((f, i) => {
      const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
      byDir.set(dir, [...(byDir.get(dir) ?? []), i]);
    });
    const out: { dir: string; from: string; to: string; changed: boolean; conflict: boolean; index: number }[] = [];
    for (const [dir, idx] of byDir) {
      const names = idx.map((i) => folder.files[i].file.name);
      renameAll(names, rules).forEach((r, k) => out.push({ dir, ...r, index: idx[k] }));
    }
    return out.sort((a, b) => a.index - b.index);
  }, [folder, rules, regexError]);
  const changedCount = preview.filter((p) => p.changed).length;

  const asZip = () =>
    task.run(async (ctx) => {
      const { createZip } = await import("@/lib/processors/archive/zipio");
      const blob = await createZip(
        preview.map((p) => ({ path: p.dir + p.to, data: folder!.files[p.index].file, lastModified: folder!.files[p.index].file.lastModified })),
        { level: 0, signal: ctx.signal, onProgress: (x) => ctx.progress(x) },
      );
      return { kind: "zip", blob };
    });

  const inPlace = () =>
    task.run(async (ctx) => {
      const root = folder!.handle!;
      const todo = preview.filter((p) => p.changed);
      for (let i = 0; i < todo.length; i++) {
        const p = todo[i];
        const dir = await dirFor(root, p.dir + p.from);
        const fh = await dir.getFileHandle(p.from);
        if (fh.move) await fh.move(p.to);
        else {
          // Fallback: copy to the new name, then delete the original.
          const nh = await dir.getFileHandle(p.to, { create: true });
          const w = await nh.createWritable();
          await w.write(await fh.getFile());
          await w.close();
          await dir.removeEntry(p.from);
        }
        ctx.progress((i + 1) / todo.length, `Renaming ${p.from}`);
      }
      return { kind: "inplace", count: todo.length };
    });

  return (
    <div className="space-y-4">
      {folder ? <FolderSummary folder={folder} onClear={() => (setFolder(null), task.reset())} /> : <FolderPicker onPick={(f) => (setFolder(f), task.reset())} allowFiles writable label="Drop a folder or files to rename" />}
      <Panel title="Rename rules">
        <div className="space-y-4">
          <Settings>
            <Field label="Find">{(id) => <Input id={id} value={rules.find} onChange={(e) => set("find", e.target.value)} placeholder="IMG_" data-testid="input" />}</Field>
            <Field label="Replace with">{(id) => <Input id={id} value={rules.replace} onChange={(e) => set("replace", e.target.value)} placeholder="Holiday-" />}</Field>
            <div className="flex flex-col gap-2 pt-6">
              <Checkbox label="Regular expression" description="Use $1, $2 for groups" checked={!!rules.useRegex} onChange={(v) => set("useRegex", v)} />
              <Checkbox label="Case-sensitive" checked={!!rules.caseSensitive} onChange={(v) => set("caseSensitive", v)} />
            </div>
            <Field label="Add prefix">{(id) => <Input id={id} value={rules.prefix} onChange={(e) => set("prefix", e.target.value)} />}</Field>
            <Field label="Add suffix" hint="before the extension">{(id) => <Input id={id} value={rules.suffix} onChange={(e) => set("suffix", e.target.value)} />}</Field>
            <Field label="Change case">
              {(id) => (
                <Select id={id} value={rules.caseMode} onChange={(e) => set("caseMode", e.target.value as CaseMode)}>
                  <option value="keep">Keep</option>
                  <option value="lower">lowercase</option>
                  <option value="upper">UPPERCASE</option>
                  <option value="title">Title Case</option>
                  <option value="sentence">Sentence case</option>
                  <option value="kebab">kebab-case</option>
                  <option value="snake">snake_case</option>
                  <option value="camel">camelCase</option>
                </Select>
              )}
            </Field>
            <Field label="New extension" hint="empty = keep, “-” = remove">{(id) => <Input id={id} value={rules.extension} onChange={(e) => set("extension", e.target.value)} placeholder="jpg" />}</Field>
            <Field label="Extension case">
              {(id) => (
                <Select id={id} value={rules.extensionCase} onChange={(e) => set("extensionCase", e.target.value as "keep" | "lower" | "upper")}>
                  <option value="keep">Keep</option>
                  <option value="lower">lowercase</option>
                  <option value="upper">UPPERCASE</option>
                </Select>
              )}
            </Field>
            <div className="pt-6">
              <Checkbox label="Trim and collapse spaces" checked={!!rules.trimSpaces} onChange={(v) => set("trimSpaces", v)} />
            </div>
          </Settings>
          <div className="rounded-lg border border-border p-3">
            <Checkbox label="Add sequence numbers" checked={num.enabled} onChange={(v) => setNum({ enabled: v })} />
            {num.enabled ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-5">
                <Field label="Start">{(id) => <Input id={id} type="number" value={num.start} onChange={(e) => setNum({ start: Number(e.target.value) })} />}</Field>
                <Field label="Step">{(id) => <Input id={id} type="number" value={num.step} onChange={(e) => setNum({ step: Number(e.target.value) || 1 })} />}</Field>
                <Field label="Digits">{(id) => <Input id={id} type="number" min={1} max={10} value={num.padding} onChange={(e) => setNum({ padding: Number(e.target.value) || 1 })} />}</Field>
                <Field label="Position">
                  {(id) => (
                    <Select id={id} value={num.position} onChange={(e) => setNum({ position: e.target.value as "prefix" | "suffix" | "replace" })}>
                      <option value="prefix">Before name</option>
                      <option value="suffix">After name</option>
                      <option value="replace">Replace name</option>
                    </Select>
                  )}
                </Field>
                <Field label="Separator">{(id) => <Input id={id} value={num.separator} onChange={(e) => setNum({ separator: e.target.value })} maxLength={3} />}</Field>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>
      <ErrorMessage error={regexError ? `Invalid regular expression: ${regexError}` : null} />
      {preview.length ? (
        <Panel title={<span className="flex items-center gap-2">Preview <Badge>{changedCount} of {preview.length} change</Badge></span>}>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
            <table className="w-full text-[13px]" data-testid="output">
              <thead className="sticky top-0 bg-bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Current name</th>
                  <th className="px-3 py-2 font-medium">New name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {preview.slice(0, 1000).map((p) => (
                  <tr key={p.index}>
                    <td className="max-w-0 truncate px-3 py-1.5 text-fg-muted" title={p.dir + p.from}>
                      {p.dir}
                      {p.from}
                    </td>
                    <td className={cn("max-w-0 truncate px-3 py-1.5", p.changed ? "text-fg" : "text-fg-subtle", p.conflict && "text-warning")} title={p.conflict ? "Renamed to avoid a duplicate name" : undefined}>
                      {p.to}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      <ActionBar onReset={() => (setFolder(null), setRules(DEFAULT), task.reset())}>
        <Button size="lg" onClick={asZip} disabled={!changedCount || task.running} data-testid="run">
          Download renamed as ZIP
        </Button>
        {folder?.handle ? (
          <Button size="lg" variant="secondary" onClick={inPlace} disabled={!changedCount || task.running}>
            Rename files in place
          </Button>
        ) : null}
      </ActionBar>
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel ?? "Working…"} />
      <ErrorMessage error={task.error} />
      {task.result?.kind === "zip" ? <FileResult blob={task.result.blob} filename={`${folder?.name || "renamed"}-renamed.zip`} preview={false} label="Renamed files" /> : null}
      {task.result?.kind === "inplace" ? <Alert tone="success">Renamed {task.result.count} files in “{folder?.name}”. Re-open the folder to keep working with the new names.</Alert> : null}
    </div>
  );
}
