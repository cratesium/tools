"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, FileResults, Panel } from "@/components/tools/shared";
import { changeExtension } from "@/lib/processors/files/rename";

export default function ExtensionChanger(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [ext, setExt] = useState("");
  const out = useMemo(() => files.map((f) => ({ name: changeExtension(f.name, ext), blob: f as Blob })), [files, ext]);
  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Any files" onFiles={(f) => setFiles((p) => [...p, ...f])} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => setFiles([])} />
      <Panel title="New extension">
        <Field label="Extension" hint="without the dot; leave empty to remove it" className="max-w-xs">
          {(id) => <Input id={id} value={ext} onChange={(e) => setExt(e.target.value.replace(/\s/g, ""))} placeholder="txt" data-testid="input" />}
        </Field>
      </Panel>
      <Alert tone="warning" title="This renames files – it does not convert them">
        Changing .png to .jpg does not make a JPEG; the content stays the same, and some apps may refuse to open a file whose extension doesn&apos;t match. Use a converter (e.g. PNG to JPG) to change the actual format.
      </Alert>
      {files.length ? <FileResults files={out} zipName="renamed-files.zip" label="Renamed copies" /> : null}
      <ActionBar onReset={() => (setFiles([]), setExt(""))} />
    </div>
  );
}
