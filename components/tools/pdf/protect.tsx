"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { ALL_PERMISSIONS, type Permissions } from "@/lib/processors/pdf/security";
import { useTask } from "@/lib/utils/hooks";
import { PdfPicker, outName, usePdfLoader } from "./common";
import { PdfOutput } from "./helpers";

export default function ProtectPdf(_props: ToolComponentProps) {
  const loader = usePdfLoader();
  const L = loader.loaded;
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [owner, setOwner] = useState("");
  const [alg, setAlg] = useState<"AES-256" | "AES-128">("AES-256");
  const [perm, setPerm] = useState<Permissions>(ALL_PERMISSIONS);
  const task = useTask<{ bytes: Uint8Array; ownerPassword: string }>();
  const set = <K extends keyof Permissions>(k: K, v: Permissions[K]) => setPerm((p) => ({ ...p, [k]: v }));
  const run = () =>
    task.run(async () => {
      if (!L) throw new Error("Add a PDF first.");
      if (pw.length < 4) throw new Error("Use a password of at least 4 characters (longer is much safer).");
      if (pw !== pw2) throw new Error("The passwords don't match.");
      const { protectPdf } = await import("@/lib/processors/pdf/security");
      return protectPdf(L.bytes, { userPassword: pw, ownerPassword: owner || undefined, permissions: perm, algorithm: alg, inputPassword: L.password });
    });
  return (
    <div className="space-y-4">
      <PdfPicker loader={loader} />
      <Panel title="Password">
        <Settings>
          <Field label="Password to open">{(id) => <Input id={id} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" data-testid="input" />}</Field>
          <Field label="Repeat password" error={pw2 && pw !== pw2 ? "Doesn't match" : null}>{(id) => <Input id={id} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />}</Field>
          <Field label="Encryption">
            {(id) => (
              <Select id={id} value={alg} onChange={(e) => setAlg(e.target.value as "AES-256" | "AES-128")}>
                <option value="AES-256">AES-256 (recommended, Acrobat X+)</option>
                <option value="AES-128">AES-128 (older readers)</option>
              </Select>
            )}
          </Field>
        </Settings>
      </Panel>
      <Panel title="Permissions (when opened with the open password)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Printing">
            {(id) => (
              <Select id={id} value={perm.printing} onChange={(e) => set("printing", e.target.value as Permissions["printing"])}>
                <option value="high">Allowed (high quality)</option>
                <option value="low">Low resolution only</option>
                <option value="none">Not allowed</option>
              </Select>
            )}
          </Field>
          <Field label="Owner password (optional)" hint="needed to change permissions">{(id) => <Input id={id} type="password" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="random if empty" autoComplete="new-password" />}</Field>
          <Checkbox label="Allow copying text and images" checked={perm.copying} onChange={(v) => set("copying", v)} />
          <Checkbox label="Allow editing" checked={perm.modifying} onChange={(v) => set("modifying", v)} />
          <Checkbox label="Allow comments and annotations" checked={perm.annotating} onChange={(v) => set("annotating", v)} />
          <Checkbox label="Allow filling forms" checked={perm.fillingForms} onChange={(v) => set("fillingForms", v)} />
          <Checkbox label="Allow page assembly" checked={perm.documentAssembly} onChange={(v) => set("documentAssembly", v)} />
          <Checkbox label="Allow screen readers" checked={perm.contentAccessibility} onChange={(v) => set("contentAccessibility", v)} />
        </div>
        <p className="mt-3 text-xs text-fg-subtle">Permission flags are honoured by standard PDF readers but can be bypassed by some tools; the open password is what truly protects the content.</p>
      </Panel>
      <ActionBar onRun={run} runLabel="Protect PDF" running={task.running} disabled={!L || !pw} onReset={() => (loader.reset(), setPw(""), setPw2(""), task.reset())} />
      <TaskProgress running={task.running} progress={null} label="Encrypting…" />
      <ErrorMessage error={task.error} />
      {task.result && L ? (
        <PdfOutput bytes={task.result.bytes} name={outName(L.file.name, "-protected")} label="Protected PDF">
          {!owner ? <p className="text-xs text-fg-subtle">A random owner password was generated: <code className="font-mono select-all">{task.result.ownerPassword}</code> – keep it if you may need to change permissions later.</p> : null}
        </PdfOutput>
      ) : null}
      <Alert tone="info">Encryption happens in your browser – neither the PDF nor the password is uploaded. If you forget the password, the file cannot be recovered.</Alert>
    </div>
  );
}
