"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, CopyButton, ErrorMessage, FileResult, Panel, TaskProgress, TextOutput } from "@/components/tools/shared";
import {
  DEFAULT_ITERATIONS,
  MIN_ITERATIONS,
  decryptBytes,
  decryptText,
  encryptBytes,
  encryptText,
  generateRawKey,
  inspectContainer,
  parseRawKey,
  type Cipher,
  type KeyInput,
} from "@/lib/processors/security/aes";
import { toHex } from "@/lib/processors/security/hash";
import { formatBytes } from "@/lib/utils/format";
import { useTask } from "@/lib/utils/hooks";

type Out = { kind: "text"; text: string } | { kind: "file"; blob: Blob; name: string; info?: string };

/**
 * AES-256 encryption/decryption for text and files (processorOptions.mode).
 * processorOptions.textOnly = true gives the simplified Text Encryption/Decryption UX.
 */
export default function AesTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as "encrypt" | "decrypt") ?? "encrypt";
  const textOnly = tool.processorOptions?.textOnly === true;
  const [source, setSource] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [keyMode, setKeyMode] = useState<"passphrase" | "raw">("passphrase");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [show, setShow] = useState(false);
  const [rawKey, setRawKey] = useState("");
  const [cipher, setCipher] = useState<Cipher>("aes-256-gcm");
  const [iterations, setIterations] = useState(DEFAULT_ITERATIONS);
  const task = useTask<Out>();
  const isFile = !textOnly && source === "file";

  const key = (): KeyInput => {
    if (keyMode === "raw") return { rawKey: parseRawKey(rawKey) };
    if (!pass) throw new Error("Enter a passphrase.");
    if (mode === "encrypt" && pass !== pass2) throw new Error("The two passphrases do not match.");
    return { passphrase: pass, iterations };
  };

  const run = () =>
    task.run(async (ctx) => {
      ctx.progress(null, mode === "encrypt" ? "Deriving key and encrypting…" : "Deriving key and decrypting…");
      const k = key();
      if (isFile) {
        if (!file) throw new Error("Choose a file.");
        const data = new Uint8Array(await file.arrayBuffer());
        if (mode === "encrypt") {
          const out = await encryptBytes(data, k, cipher);
          return { kind: "file", blob: new Blob([out as BlobPart], { type: "application/octet-stream" }), name: `${file.name}.enc` };
        }
        const info = inspectContainer(data);
        const out = await decryptBytes(data, k);
        const name = file.name.replace(/\.enc$/i, "") || "decrypted.bin";
        return { kind: "file", blob: new Blob([out as BlobPart]), name: name === file.name ? `decrypted-${name}` : name, info: `${info.cipher.toUpperCase()}, ${info.keyMode === "raw" ? "raw key" : `PBKDF2 ${info.iterations.toLocaleString()} iterations`}` };
      }
      if (!text) throw new Error(mode === "encrypt" ? "Enter text to encrypt." : "Paste the encrypted text.");
      return { kind: "text", text: mode === "encrypt" ? await encryptText(text, k, cipher) : await decryptText(text.trim(), k) };
    });

  return (
    <div className="space-y-4">
      {!textOnly ? <Segmented label="Input" value={source} onChange={(v) => (setSource(v), task.reset())} options={[{ value: "text", label: "Text" }, { value: "file", label: "File" }]} /> : null}

      {isFile ? (
        file ? (
          <FileList files={[file]} onClear={() => (setFile(null), task.reset())} />
        ) : (
          <Dropzone formatsLabel={mode === "encrypt" ? "Any file" : "A .enc file created by UtilityHub"} maxSize={1024 * 1024 * 1024} onFiles={([f]) => (setFile(f), task.reset())} />
        )
      ) : (
        <Panel title={mode === "encrypt" ? "Text to encrypt" : "Encrypted text (Base64)"}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "encrypt" ? "Your secret message…" : "VUhFMQEBAQAJJ8AA…"} aria-label="Input" data-testid="input" className="min-h-[140px]" />
        </Panel>
      )}

      <Panel title="Key">
        <div className="space-y-4">
          {!textOnly ? (
            <Segmented
              label="Key type"
              value={keyMode}
              onChange={setKeyMode}
              options={[
                { value: "passphrase", label: "Passphrase" },
                { value: "raw", label: "Raw 256-bit key" },
              ]}
            />
          ) : null}
          {keyMode === "passphrase" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Passphrase" hint="Long and unique – it cannot be recovered">
                {(id) => (
                  <div className="flex gap-2">
                    <Input id={id} type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
                    <Button size="icon" variant="secondary" aria-label={show ? "Hide passphrase" : "Show passphrase"} onClick={() => setShow((s) => !s)}>
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </Field>
              {mode === "encrypt" ? (
                <Field label="Confirm passphrase" error={pass2 && pass !== pass2 ? "Does not match" : null}>
                  {(id) => <Input id={id} type={show ? "text" : "password"} value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />}
                </Field>
              ) : null}
            </div>
          ) : (
            <Field label="Key (64 hex characters or Base64)">
              {(id) => (
                <div className="flex gap-2">
                  <Input id={id} value={rawKey} onChange={(e) => setRawKey(e.target.value)} className="font-mono" spellCheck={false} autoComplete="off" />
                  {mode === "encrypt" ? (
                    <Button variant="secondary" onClick={() => setRawKey(toHex(generateRawKey()))}>
                      Generate
                    </Button>
                  ) : null}
                  {rawKey ? <CopyButton text={rawKey} size="md" /> : null}
                </div>
              )}
            </Field>
          )}
          {mode === "encrypt" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cipher">
                {(id) => (
                  <Select id={id} value={cipher} onChange={(e) => setCipher(e.target.value as Cipher)}>
                    <option value="aes-256-gcm">AES-256-GCM (recommended)</option>
                    <option value="aes-256-cbc-hmac">AES-256-CBC + HMAC-SHA-256</option>
                  </Select>
                )}
              </Field>
              {keyMode === "passphrase" && !textOnly ? (
                <Field label="PBKDF2 iterations" hint={`min ${MIN_ITERATIONS.toLocaleString()}`}>
                  {(id) => (
                    <Select id={id} value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>
                      <option value={310_000}>310,000 (faster)</option>
                      <option value={600_000}>600,000 (default, OWASP 2023)</option>
                      <option value={1_000_000}>1,000,000 (slower, stronger)</option>
                    </Select>
                  )}
                </Field>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>

      <ActionBar onRun={run} runLabel={mode === "encrypt" ? "Encrypt" : "Decrypt"} running={task.running} onReset={() => (setText(""), setFile(null), setPass(""), setPass2(""), setRawKey(""), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result?.kind === "text" ? <TextOutput value={task.result.text} filename={mode === "encrypt" ? "encrypted.txt" : "decrypted.txt"} label={mode === "encrypt" ? "Encrypted (Base64)" : "Decrypted text"} rows={6} /> : null}
      {task.result?.kind === "file" ? (
        <FileResult blob={task.result.blob} filename={task.result.name} originalSize={file?.size} preview={false} label={mode === "encrypt" ? "Encrypted file" : "Decrypted file"}>
          {task.result.info ? <p className="text-xs text-fg-subtle">Container: {task.result.info}</p> : null}
        </FileResult>
      ) : null}
      {mode === "encrypt" ? (
        <Alert tone="info">
          Encryption runs locally with the Web Crypto API ({file && isFile ? formatBytes(file.size) : "your data"} never leaves the device). Only UtilityHub&apos;s decryption tool reads this format. If you lose the passphrase or key, the data cannot be recovered.
        </Alert>
      ) : null}
    </div>
  );
}
