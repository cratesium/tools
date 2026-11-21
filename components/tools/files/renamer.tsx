"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, Panel } from "@/components/tools/shared";
import { sanitizeFileName, splitName } from "@/lib/processors/files/rename";
import { downloadBlob } from "@/lib/utils/download";
import { errorMessage, useSupport } from "@/lib/utils/hooks";
import type { FileSystemFileHandleLike } from "./common";

/** Renames one file: download a renamed copy, or rename in place with the File System Access API. */
export default function Renamer(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canPick = useSupport(() => "showOpenFilePicker" in window);
  const canMove = useSupport(() => "FileSystemFileHandle" in window && "move" in (window as unknown as { FileSystemFileHandle: { prototype: object } }).FileSystemFileHandle.prototype);
  const clean = useMemo(() => sanitizeFileName(name.trim()), [name]);
  const changed = !!file && !!clean && clean !== file.name;

  const choose = (f: File, h: FileSystemFileHandleLike | null = null) => {
    setFile(f);
    setHandle(h);
    setName(f.name);
    setDone(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {file ? (
        <FileList files={[file]} onClear={() => (setFile(null), setHandle(null), setDone(null))} />
      ) : (
        <div className="space-y-2">
          <Dropzone formatsLabel="Any file" onFiles={([f]) => choose(f)} />
          {canPick ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const [h] = await (window as unknown as { showOpenFilePicker(): Promise<FileSystemFileHandleLike[]> }).showOpenFilePicker();
                  choose(await h.getFile(), h);
                } catch (e) {
                  if ((e as Error).name !== "AbortError") setError(errorMessage(e));
                }
              }}
            >
              Pick a file to rename in place
            </Button>
          ) : null}
        </div>
      )}
      {file ? (
        <Panel title="New name">
          <Field label="File name" hint={splitName(file.name).ext ? `Extension: .${splitName(file.name).ext}` : "No extension"}>
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => {
                  const i = e.target.value.lastIndexOf(".");
                  if (i > 0) e.target.setSelectionRange(0, i);
                }}
                data-testid="input"
                spellCheck={false}
              />
            )}
          </Field>
          {clean && clean !== name.trim() ? <p className="mt-2 text-xs text-fg-subtle">Characters not allowed in file names were replaced: {clean}</p> : null}
        </Panel>
      ) : null}
      <ErrorMessage error={error} />
      {done ? <Alert tone="success">{done}</Alert> : null}
      <ActionBar onReset={() => (setFile(null), setHandle(null), setName(""), setDone(null), setError(null))}>
        <Button size="lg" disabled={!changed} data-testid="download" onClick={() => file && (downloadBlob(file, clean), setDone(`Downloaded a copy named “${clean}”.`))}>
          Download renamed copy
        </Button>
        {handle && canMove ? (
          <Button
            size="lg"
            variant="secondary"
            disabled={!changed}
            onClick={async () => {
              try {
                await handle.move!(clean);
                setDone(`Renamed the original file to “${clean}”.`);
                setFile(await handle.getFile());
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Rename original
          </Button>
        ) : null}
      </ActionBar>
      {handle && canMove === false ? <Alert tone="info">Your browser can read this file but not rename it in place. Download the renamed copy instead.</Alert> : null}
    </div>
  );
}
