"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, TaskProgress } from "@/components/tools/shared";
import { HASH_INFO, constantTimeEqual, detectAlgorithms, encodeDigest, extractDigest, hashBlob, parseDigest, type HashAlgorithm } from "@/lib/processors/security/hash";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

type Result = { algo: HashAlgorithm; actualHex: string; match: boolean }[];

export default function ChecksumVerifier(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [expected, setExpected] = useState("");
  const [forced, setForced] = useState<HashAlgorithm | "auto">("auto");
  const task = useTask<Result>();
  const digest = extractDigest(expected);
  const detected = useMemo(() => (digest ? detectAlgorithms(digest) : null), [digest]);
  const candidates: HashAlgorithm[] = forced !== "auto" ? [forced] : detected?.algorithms ?? [];

  const run = () =>
    task.run(async (ctx) => {
      if (!file) throw new Error("Choose the file to verify.");
      if (!digest) throw new Error("Paste the expected checksum.");
      if (!candidates.length) throw new Error("The checksum length doesn't match any supported algorithm. Choose the algorithm manually.");
      const want = parseDigest(digest);
      const got = await hashBlob(file, candidates, { signal: ctx.signal, onProgress: (x) => ctx.progress(x) });
      return candidates.map((a) => ({ algo: a, actualHex: encodeDigest(got[a], "hex"), match: constantTimeEqual(got[a], want) }));
    });

  const matched = task.result?.find((r) => r.match);

  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone formatsLabel="The downloaded file to check" onFiles={([f]) => (setFile(f), task.reset())} />}
      <Panel title="Expected checksum">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Checksum" hint="Paste the hash, or a line from a .sha256 / .md5 file">
            {(id) => <Input id={id} value={expected} onChange={(e) => (setExpected(e.target.value), task.reset())} className="font-mono" data-testid="input" spellCheck={false} />}
          </Field>
          <Field label="Algorithm">
            {(id) => (
              <Select id={id} value={forced} onChange={(e) => setForced(e.target.value as HashAlgorithm | "auto")}>
                <option value="auto">Auto-detect{detected ? ` (${detected.algorithms.map((a) => HASH_INFO[a].label).join(" / ")})` : ""}</option>
                {(Object.keys(HASH_INFO) as HashAlgorithm[]).map((a) => (
                  <option key={a} value={a}>
                    {HASH_INFO[a].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {digest && !detected && forced === "auto" ? <p className="mt-2 text-xs text-danger">Unrecognised checksum length – check for missing characters or choose the algorithm.</p> : null}
      </Panel>
      <ActionBar onRun={run} runLabel="Verify" running={task.running} disabled={!file || !digest} onCancel={task.cancel} onReset={() => (setFile(null), setExpected(""), setForced("auto"), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={file ? `Hashing ${file.name} (${formatBytes(file.size)})…` : undefined} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          {matched ? (
            <Alert tone="success" title="Checksum matches">
              The file&apos;s {HASH_INFO[matched.algo].label} digest is identical to the expected value. The file is intact and unmodified.
            </Alert>
          ) : (
            <Alert tone="danger" title="Checksum does NOT match">
              The file differs from the one the checksum was published for. It may be corrupted, incomplete or a different version. Do not trust it until resolved.
            </Alert>
          )}
          <Panel title="Details">
            <KeyValueTable rows={[["Expected", digest.toLowerCase()], ...task.result.map((r) => [`${HASH_INFO[r.algo].label} of file`, r.actualHex] as [string, string])]} />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
