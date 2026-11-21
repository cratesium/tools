"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResult, TaskProgress } from "@/components/tools/shared";
import { ARCHIVE_LABEL } from "@/lib/processors/archive/detect";
import { baseName, formatBytes } from "@/lib/utils/format";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { extractAll, isPasswordError, openAny, PasswordPrompt } from "./common";

type Target = "zip" | "tar" | "tgz" | "7z" | "tar.xz" | "tar.bz2";
const EXT: Record<Target, string> = { zip: "zip", tar: "tar", tgz: "tar.gz", "7z": "7z", "tar.xz": "tar.xz", "tar.bz2": "tar.bz2" };

/** Converts RAR/7Z/TAR/TGZ/ZIP archives into ZIP, TAR, TAR.GZ, 7Z, TAR.XZ or TAR.BZ2. */
export default function ArchiveConverter(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<Target>("zip");
  const [pwState, setPwState] = useState<null | "required" | "wrong">(null);
  const [password, setPassword] = useState("");
  const task = useTask<{ blob: Blob; name: string; count: number; from: string }>();

  const run = (pw = password) =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Add an archive first.");
      let arch;
      try {
        arch = await openAny(file, pw);
        if (arch.encrypted && !pw) throw Object.assign(new Error("Password required"), { name: "PasswordRequiredError" });
      } catch (e) {
        const p = isPasswordError(e);
        if (p) {
          setPwState(pw ? "wrong" : "required");
          throw new Error(pw ? "Wrong password." : "This archive is encrypted – enter its password.");
        }
        throw e;
      }
      try {
        let files;
        try {
          ({ files } = await extractAll(arch, ctx));
        } catch (e) {
          if (isPasswordError(e)) setPwState("wrong");
          throw new Error(errorMessage(e));
        }
        setPwState(null);
        ctx.progress(null, `Writing ${EXT[target]}…`);
        const out = `${baseName(baseName(file.name))}.${EXT[target]}`;
        let blob: Blob;
        if (target === "zip") {
          const { createZip } = await import("@/lib/processors/archive/zipio");
          blob = await createZip(files.map((f) => ({ path: f.path, data: f.data, lastModified: f.mtime })), { level: 6 });
        } else if (target === "tar" || target === "tgz") {
          const [{ createTar }, { gzip }] = await Promise.all([import("@/lib/processors/archive/tar"), import("@/lib/processors/archive/gzip")]);
          const tar = createTar(files.map((f) => ({ name: f.path, data: f.data, mtime: f.mtime })));
          blob = new Blob([(target === "tgz" ? gzip(tar, { level: 6 }) : tar) as BlobPart], { type: target === "tgz" ? "application/gzip" : "application/x-tar" });
        } else {
          const { loadLibarchiveWriter, writeWithLibarchive } = await import("@/lib/processors/archive/libarchive");
          const w = await loadLibarchiveWriter();
          blob = await writeWithLibarchive(w, files.map((f) => ({ file: new Blob([f.data as BlobPart]), pathname: f.path })), target, out);
        }
        return { blob, name: out, count: files.length, from: ARCHIVE_LABEL[arch.format] ?? arch.format };
      } finally {
        await arch.close();
      }
    });

  return (
    <div className="space-y-4">
      {file ? (
        <FileList files={[file]} onClear={() => (setFile(null), setPwState(null), setPassword(""), task.reset())} />
      ) : (
        <Dropzone formatsLabel="ZIP, RAR, 7Z, TAR, TGZ, TAR.XZ, TAR.BZ2" maxSize={2 * 1024 * 1024 * 1024} onFiles={([f]) => (setFile(f), task.reset())} />
      )}
      <Field label="Convert to" className="max-w-xs">
        {(id) => (
          <Select id={id} value={target} onChange={(e) => setTarget(e.target.value as Target)}>
            <option value="zip">ZIP (.zip)</option>
            <option value="tgz">TAR.GZ (.tar.gz)</option>
            <option value="tar">TAR (.tar, uncompressed)</option>
            <option value="7z">7-Zip (.7z, LZMA)</option>
            <option value="tar.xz">TAR.XZ (.tar.xz)</option>
            <option value="tar.bz2">TAR.BZ2 (.tar.bz2)</option>
          </Select>
        )}
      </Field>
      {pwState && file ? <PasswordPrompt wrong={pwState === "wrong"} busy={task.running} onSubmit={(pw) => (setPassword(pw), run(pw))} /> : null}
      <ActionBar onRun={() => run()} runLabel="Convert" running={task.running} disabled={!file} onReset={() => (setFile(null), setPwState(null), setPassword(""), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <FileResult blob={task.result.blob} filename={task.result.name} originalSize={file?.size} preview={false} label="Converted archive">
          <p className="text-xs text-fg-subtle">
            <Badge>{task.result.from}</Badge> → <Badge>{EXT[target].toUpperCase()}</Badge> · {task.result.count} files · {formatBytes(task.result.blob.size)}
          </p>
        </FileResult>
      ) : null}
    </div>
  );
}
