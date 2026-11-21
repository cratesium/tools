"use client";

import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, TaskProgress } from "@/components/tools/shared";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

export default function UnlockPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const task = useTask<Uint8Array>();
  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      const { unlockPdf } = await import("@/lib/processors/pdf/security");
      return unlockPdf(L.bytes, L.password);
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} hint="Password-protected PDF" />
      {L && !L.password ? <Alert tone="info">This PDF opened without a password. Saving it will remove any owner-password restrictions (printing/copying limits) if present.</Alert> : null}
      <ActionBar onRun={run} runLabel="Remove password" running={task.running} disabled={!L} onReset={() => (loader.reset(), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Decrypting…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? <PdfOutput bytes={task.result} name={outName(L.file.name, "-unlocked")} label="Unlocked PDF" /> : null}
      <Alert tone="info">You must know the password to open the file. UtilityHub doesn&apos;t crack or bypass passwords; it decrypts with the password you enter, in your browser, and saves an unencrypted copy.</Alert>
    </div>
  );
}
