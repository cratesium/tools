"use client";

import { useEffect, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Segmented, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, CopyButton, ErrorMessage, Panel, TaskProgress } from "@/components/tools/shared";
import { HASH_INFO, encodeDigest, hashBlob, hashData, type DigestEncoding, type HashAlgorithm } from "@/lib/processors/security/hash";
import { errorMessage, useDebounced, useTask } from "@/lib/utils/hooks";
import { formatBytes } from "@/lib/utils/format";

/** MD5 / SHA-1 / SHA-256 / SHA-512 hash generator for text or a file (processorOptions.algorithm). */
export default function HashTool({ tool }: ToolComponentProps) {
  const algo = (tool.processorOptions?.algorithm as HashAlgorithm) ?? "sha256";
  const info = HASH_INFO[algo];
  const [source, setSource] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [enc, setEnc] = useState<DigestEncoding>("hex");
  const [useHmac, setUseHmac] = useState(false);
  const [key, setKey] = useState("");
  const [textDigest, setTextDigest] = useState<{ sig: string; bytes: Uint8Array | null; error: string | null }>({ sig: "", bytes: null, error: null });
  const fileTask = useTask<Uint8Array>();
  const debounced = useDebounced(text, 150);
  const hmacKey = useHmac ? key : undefined;
  const sig = JSON.stringify([debounced, hmacKey]);

  useEffect(() => {
    if (source !== "text") return;
    let alive = true;
    hashData(algo, debounced, hmacKey)
      .then((bytes) => alive && setTextDigest({ sig, bytes, error: null }))
      .catch((e) => alive && setTextDigest({ sig, bytes: null, error: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [algo, debounced, hmacKey, sig, source]);

  const digestBytes = source === "text" ? (textDigest.sig === sig ? textDigest.bytes : null) : fileTask.result;
  const digest = digestBytes ? encodeDigest(digestBytes, enc) : "";

  const hashFile = (f: File) =>
    fileTask.run(async (ctx) => {
      const out = await hashBlob(f, [algo], { onProgress: (x) => ctx.progress(x), signal: ctx.signal, hmacKey });
      return out[algo];
    });

  return (
    <div className="space-y-4">
      <Segmented label="Input" value={source} onChange={setSource} options={[{ value: "text", label: "Text" }, { value: "file", label: "File" }]} />
      {source === "text" ? (
        <Panel title="Text (hashed as UTF-8)">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text…" aria-label="Input" data-testid="input" className="min-h-[140px]" />
        </Panel>
      ) : file ? (
        <FileList files={[file]} onClear={() => (setFile(null), fileTask.reset())} />
      ) : (
        <Dropzone formatsLabel="Any file, any size" onFiles={([f]) => (setFile(f), hashFile(f))} />
      )}
      <div className="flex flex-wrap items-end gap-4">
        <Segmented label="Output" value={enc} onChange={setEnc} options={[{ value: "hex", label: "hex" }, { value: "HEX", label: "HEX" }, { value: "base64", label: "Base64" }]} />
        <Checkbox label={`HMAC-${info.label}`} description="Keyed hash with a secret" checked={useHmac} onChange={setUseHmac} />
        {useHmac ? <Field label="Secret key" className="w-64">{(id) => <Input id={id} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />}</Field> : null}
      </div>
      {source === "file" && file && useHmac ? (
        <p className="text-xs text-fg-subtle">
          Changed the key? <button className="underline" onClick={() => hashFile(file)}>Re-hash the file</button>.
        </p>
      ) : null}
      <TaskProgress running={fileTask.running} progress={fileTask.progress} label={file ? `Hashing ${file.name} (${formatBytes(file.size)})…` : "Hashing…"} />
      <ErrorMessage error={source === "text" ? textDigest.error : fileTask.error} />
      {digest ? (
        <Panel title={`${useHmac ? "HMAC-" : ""}${info.label} (${info.bits} bits)`} actions={<CopyButton text={digest} />}>
          <code data-testid="output" className="block font-mono text-[13px] break-all text-fg">
            {digest}
          </code>
        </Panel>
      ) : null}
      {!info.secure ? (
        <Alert tone="warning" title={`${info.label} is not collision resistant`}>
          Use it for checksums and legacy compatibility only. For security purposes such as signatures or integrity against attackers, use SHA-256 or stronger.
        </Alert>
      ) : null}
      <ActionBar onReset={() => (setText(""), setFile(null), setKey(""), setUseHmac(false), fileTask.reset())} />
    </div>
  );
}
