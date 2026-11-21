"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, CopyButton, DownloadButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { HASH_INFO, encodeDigest, hashBlob, type DigestEncoding, type HashAlgorithm } from "@/lib/processors/security/hash";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

const ALGOS: HashAlgorithm[] = ["md5", "sha1", "sha256", "sha512", "sha3-256", "blake3", "crc32", "xxh64"];
type Row = { name: string; size: number; digests: Record<string, Uint8Array> };

/** Hashes many files with several algorithms at once, streaming in 4 MB chunks. */
export default function ChecksumGenerator(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [algos, setAlgos] = useState<Record<string, boolean>>({ sha256: true, md5: true });
  const [enc, setEnc] = useState<DigestEncoding>("hex");
  const task = useTask<Row[]>();
  const chosen = ALGOS.filter((a) => algos[a]);

  const run = () =>
    task.run(async (ctx) => {
      if (!chosen.length) throw new Error("Choose at least one algorithm.");
      const total = files.reduce((s, f) => s + f.size, 0) || 1;
      let done = 0;
      const rows: Row[] = [];
      for (const f of files) {
        const digests = await hashBlob(f, chosen, { signal: ctx.signal, onProgress: (x) => ctx.progress((done + x * f.size) / total, `Hashing ${f.name}`) });
        done += f.size;
        rows.push({ name: f.webkitRelativePath || f.name, size: f.size, digests });
      }
      return rows;
    });

  const manifest = (a: HashAlgorithm) => (task.result ?? []).map((r) => `${encodeDigest(r.digests[a], enc === "base64" ? "hex" : enc)}  ${r.name}`).join("\n") + "\n";

  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="Any files, any size" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Algorithms">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {ALGOS.map((a) => (
            <Checkbox key={a} label={HASH_INFO[a].label} checked={!!algos[a]} onChange={(v) => setAlgos((p) => ({ ...p, [a]: v }))} />
          ))}
        </div>
        <div className="mt-4">
          <Segmented label="Encoding" value={enc} onChange={setEnc} options={[{ value: "hex", label: "hex" }, { value: "HEX", label: "HEX" }, { value: "base64", label: "Base64" }]} />
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Generate checksums" running={task.running} disabled={!files.length || !chosen.length} onCancel={task.cancel} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <Panel
          title="Checksums"
          actions={chosen.filter((a) => HASH_INFO[a].secure || a === "md5" || a === "sha1").map((a) => (
            <DownloadButton key={a} text={manifest(a)} filename={`checksums.${a.replace("-", "")}`} label={`${HASH_INFO[a].label} file`} size="sm" variant="secondary" />
          ))}
        >
          <ul className="divide-y divide-border" data-testid="output">
            {task.result.map((r) => (
              <li key={r.name} className="py-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-fg">{r.name}</span>
                  <span className="shrink-0 font-mono text-xs text-fg-subtle">{formatBytes(r.size)}</span>
                </div>
                {chosen.map((a) => {
                  const v = encodeDigest(r.digests[a], enc);
                  return (
                    <div key={a} className="flex items-center gap-3 py-0.5">
                      <span className="w-20 shrink-0 text-xs text-fg-muted">{HASH_INFO[a].label}</span>
                      <code className="min-w-0 flex-1 font-mono text-[12px] break-all">{v}</code>
                      <CopyButton text={v} label="" />
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-subtle">Checksum files use the standard “digest␣␣filename” format, compatible with sha256sum -c and md5sum -c.</p>
        </Panel>
      ) : null}
    </div>
  );
}
