"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

const UNIT = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 } as const;

/** Splits a file into byte-exact parts named name.001, name.002 … (compatible with cat / 7-Zip / the File Merger). */
export default function FileSplitter(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"size" | "count">("size");
  const [size, setSize] = useState(10);
  const [unit, setUnit] = useState<keyof typeof UNIT>("MB");
  const [count, setCount] = useState(3);
  const task = useTask<{ name: string; blob: Blob }[]>();
  const partSize = file ? (mode === "size" ? Math.max(1, Math.floor(size * UNIT[unit])) : Math.ceil(file.size / Math.max(1, count))) : 0;
  const parts = file && partSize ? Math.ceil(file.size / partSize) : 0;
  const run = () =>
    task.run(async () => {
      if (!file) throw new Error("Add a file.");
      if (parts > 1000) throw new Error(`That would create ${parts} parts; use a larger part size (maximum 1,000 parts).`);
      if (parts < 2) throw new Error("The part size is larger than the file – nothing to split.");
      const digits = Math.max(3, String(parts).length);
      return Array.from({ length: parts }, (_, i) => ({ name: `${file.name}.${String(i + 1).padStart(digits, "0")}`, blob: file.slice(i * partSize, (i + 1) * partSize) }));
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone formatsLabel="Any file" onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Split by">
        <div className="flex flex-wrap items-end gap-4">
          <Segmented label="Split by" value={mode} onChange={setMode} options={[{ value: "size", label: "Part size" }, { value: "count", label: "Number of parts" }]} />
          {mode === "size" ? (
            <>
              <Field label="Size" className="w-28">{(id) => <Input id={id} type="number" min={1} value={size} onChange={(e) => setSize(Number(e.target.value))} data-testid="input" />}</Field>
              <Field label="Unit" className="w-24">
                {(id) => (
                  <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value as keyof typeof UNIT)}>
                    <option>KB</option>
                    <option>MB</option>
                    <option>GB</option>
                  </Select>
                )}
              </Field>
            </>
          ) : (
            <Field label="Parts" className="w-28">{(id) => <Input id={id} type="number" min={2} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} />}</Field>
          )}
        </div>
        {file ? <p className="mt-3 text-sm text-fg-muted">→ {parts} part{parts === 1 ? "" : "s"} of up to {formatBytes(partSize)}</p> : null}
      </Panel>
      <ActionBar onRun={run} runLabel="Split file" running={task.running} disabled={!file} onReset={() => (setFile(null), task.reset())} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <FileResults files={task.result} zipName={`${file?.name}-parts.zip`} label="Parts" />
          <Alert tone="info">
            Rejoin with the File Merger, with 7-Zip, or on the command line: <code className="font-mono">cat {file?.name}.* &gt; {file?.name}</code> (macOS/Linux) or <code className="font-mono">copy /b {file?.name}.001+{file?.name}.002 {file?.name}</code> (Windows).
          </Alert>
        </>
      ) : null}
    </div>
  );
}
