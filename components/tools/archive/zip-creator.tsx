"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select, Slider } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { generatePassword } from "@/lib/processors/security/random";

const LEVELS = ["Store (no compression)", "1 fastest", "2", "3", "4", "5", "6 default", "7", "8", "9 smallest"];

export default function ZipCreator(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("archive");
  const [level, setLevel] = useState(6);
  const [usePw, setUsePw] = useState(false);
  const [pw, setPw] = useState("");
  const [enc, setEnc] = useState<"aes256" | "zipcrypto">("aes256");
  const [comment, setComment] = useState("");
  const task = useTask<Blob>();
  const total = files.reduce((s, f) => s + f.size, 0);

  const run = () =>
    task.run(async (ctx) => {
      if (!files.length) throw new Error("Add files first.");
      if (usePw && pw.length < 4) throw new Error("Use a password of at least 4 characters (longer is much safer).");
      const { createZip } = await import("@/lib/processors/archive/zipio");
      const seen = new Set<string>();
      const entries = files.map((f) => {
        let p = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
        let k = 1;
        while (seen.has(p)) p = p.replace(/(\.[^./]*)?$/, (m) => ` (${k++})${m}`);
        seen.add(p);
        return { path: p, data: f as Blob, lastModified: f.lastModified };
      });
      return createZip(entries, { level, password: usePw ? pw : undefined, encryption: enc, comment: comment || undefined, signal: ctx.signal, onProgress: (x) => ctx.progress(x) });
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Dropzone multiple formatsLabel="Any files" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
        <Dropzone directory formatsLabel="A whole folder (keeps structure)" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())}>
          Drop a folder here or <span className="underline underline-offset-4">browse</span>
        </Dropzone>
      </div>
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Options">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Archive name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Slider label="Compression level" value={level} min={0} max={9} onChange={setLevel} format={(v) => LEVELS[v]} />
          </div>
          <Checkbox label="Protect with a password" checked={usePw} onChange={setUsePw} />
          {usePw ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_240px] sm:items-end">
              <Field label="Password">{(id) => <Input id={id} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className="font-mono" />}</Field>
              <Button variant="secondary" onClick={() => setPw(generatePassword({ length: 20, lower: true, upper: true, digits: true, symbols: false, avoidAmbiguous: true, requireEach: true }))}>
                Generate
              </Button>
              <Field label="Encryption">
                {(id) => (
                  <Select id={id} value={enc} onChange={(e) => setEnc(e.target.value as "aes256" | "zipcrypto")}>
                    <option value="aes256">AES-256 (secure)</option>
                    <option value="zipcrypto">ZipCrypto (legacy, weak)</option>
                  </Select>
                )}
              </Field>
            </div>
          ) : null}
          {usePw && enc === "zipcrypto" ? <Alert tone="warning">ZipCrypto opens in Windows Explorer without extra software but can be cracked easily. Prefer AES-256 (supported by 7-Zip, WinRAR, macOS Archive Utility and others).</Alert> : null}
          <Field label="Comment (optional)">{(id) => <Input id={id} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />}</Field>
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Create ZIP" running={task.running} disabled={!files.length} onCancel={task.cancel} onReset={() => (setFiles([]), setPw(""), setUsePw(false), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Compressing…" />
      <ErrorMessage error={task.error} />
      {task.result ? <FileResult blob={task.result} filename={`${name.trim() || "archive"}.zip`} originalSize={total} preview={false} label="ZIP archive" /> : null}
    </div>
  );
}
