"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented } from "@/components/ui/field";
import { Dropzone } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

/** Concatenates files in order: binary (e.g. split parts) or text with a separator. */
export default function FileMerger(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"binary" | "text">("binary");
  const [sep, setSep] = useState("\\n");
  const [name, setName] = useState("");
  const task = useTask<Blob>();
  const add = (f: File[]) => {
    const all = [...files, ...f].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
    setFiles(all);
    if (!name && all[0]) setName(all[0].name.replace(/\.(part\d+|\d{3})$/i, "").replace(/\.(\d+)$/, ""));
    task.reset();
  };
  const move = (i: number, d: number) => setFiles((p) => {
    const n = [...p];
    const j = i + d;
    if (j < 0 || j >= n.length) return p;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const run = () =>
    task.run(async () => {
      if (files.length < 2) throw new Error("Add at least two files.");
      if (mode === "binary") return new Blob(files);
      const s = sep.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      const parts: BlobPart[] = [];
      files.forEach((f, i) => {
        if (i) parts.push(s);
        parts.push(f);
      });
      return new Blob(parts, { type: "text/plain;charset=utf-8" });
    });
  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Parts (.001, .002 …) or text files" onFiles={add} />
      {files.length ? (
        <Panel title={`Order (${files.length} files · ${formatBytes(files.reduce((s, f) => s + f.size, 0))})`}>
          <ol className="divide-y divide-border text-sm" data-testid="output">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 py-1.5">
                <span className="w-6 text-xs text-fg-subtle">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="font-mono text-xs text-fg-subtle">{formatBytes(f.size)}</span>
                <button className="rounded p-1 hover:bg-bg-muted" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1 hover:bg-bg-muted" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></button>
                <button className="rounded p-1 hover:bg-bg-muted" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: "binary", label: "Join bytes" }, { value: "text", label: "Join text" }]} />
        {mode === "text" ? <Field label="Separator" hint="\n = new line">{(id) => <Input id={id} value={sep} onChange={(e) => setSep(e.target.value)} />}</Field> : null}
        <Field label="Output file name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="merged.bin" />}</Field>
      </div>
      <ActionBar onRun={run} runLabel="Merge files" running={task.running} disabled={files.length < 2} onReset={() => (setFiles([]), setName(""), task.reset())} />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResult blob={task.result} filename={name || (mode === "text" ? "merged.txt" : "merged.bin")} preview={false} label="Merged file" /> : null}
    </div>
  );
}
