"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, Panel, TaskProgress } from "@/components/tools/shared";
import { baseName } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";
import { extractAll, isPasswordError, openAny } from "./common";

/** Removes encryption from an archive when the user KNOWS the password: decrypt, then re-pack as a plain ZIP. */
export default function PasswordRemover(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");
  const task = useTask<{ blob: Blob; name: string; count: number }>();

  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Add the encrypted archive.");
      if (!pw) throw new Error("Enter the archive's password.");
      let arch;
      try {
        arch = await openAny(file, pw);
      } catch (e) {
        throw new Error(isPasswordError(e) ? "The password is incorrect." : (e as Error).message);
      }
      try {
        if (arch.encrypted === false) throw new Error("This archive is not encrypted – there is no password to remove.");
        let files;
        try {
          ({ files } = await extractAll(arch, ctx));
        } catch (e) {
          throw new Error(isPasswordError(e) ? "The password is incorrect." : (e as Error).message);
        }
        ctx.progress(null, "Creating unencrypted ZIP…");
        const { createZip } = await import("@/lib/processors/archive/zipio");
        const blob = await createZip(files.map((f) => ({ path: f.path, data: f.data, lastModified: f.mtime })), { level: 6 });
        return { blob, name: `${baseName(baseName(file.name))}-unlocked.zip`, count: files.length };
      } finally {
        await arch.close();
      }
    });

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone formatsLabel="Encrypted ZIP, 7Z or RAR" maxSize={2 * 1024 * 1024 * 1024} onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Password">
        <Field label="Current archive password" hint="You must know it – nothing is guessed or cracked">
          {(id) => <Input id={id} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" data-testid="input" />}
        </Field>
      </Panel>
      <ActionBar onRun={run} runLabel="Remove password" running={task.running} disabled={!file || !pw} onReset={() => (setFile(null), setPw(""), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <FileResult blob={task.result.blob} filename={task.result.name} preview={false} label="Unencrypted archive">
          <p className="text-xs text-fg-subtle">{task.result.count} files re-packed into a standard ZIP without a password.</p>
        </FileResult>
      ) : null}
      <Alert tone="info">This tool removes protection only when you supply the correct password. It does not recover, guess or crack passwords.</Alert>
    </div>
  );
}
