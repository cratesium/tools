"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { ActionBar, DownloadButton, ErrorMessage, Panel, Settings, TextOutput } from "@/components/tools/shared";
import { Dropzone } from "@/components/upload/dropzone";
import { base64ToBytes, bytesToBase64, bytesToHex, bytesToUtf8, encodeBase64, looksBinary, sniffType } from "@/lib/processors/developer/base64";
import { formatBytes } from "@/lib/utils/format";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";

/** Base64 Encoder (mode "encode") and Base64 Decoder (mode "decode"): text and files, UTF-8, URL-safe. */
export default function Base64Tool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as "encode" | "decode") ?? "encode";
  const [source, setSource] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);
  const [padding, setPadding] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [dataUri, setDataUri] = useState(false);
  const [file, setFile] = useState<{ name: string; type: string; bytes: Uint8Array } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const debounced = useDebounced(text, 150);
  const opts = { urlSafe, padding: urlSafe ? padding : true, lineLength: wrap ? 76 : 0 };

  const encoded = useMemo(() => {
    if (mode !== "encode") return "";
    if (source === "file") {
      if (!file) return "";
      const b64 = bytesToBase64(file.bytes, opts);
      return dataUri ? `data:${file.type || "application/octet-stream"};base64,${b64.replace(/\n/g, "")}` : b64;
    }
    return debounced ? encodeBase64(debounced, opts) : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, source, file, debounced, urlSafe, padding, wrap, dataUri]);

  const decoded = useMemo(() => {
    if (mode !== "decode" || !debounced.trim()) return null;
    try {
      const bytes = base64ToBytes(debounced);
      const txt = bytesToUtf8(bytes);
      const binary = txt == null || looksBinary(txt);
      const type = sniffType(bytes);
      return { ok: true as const, bytes, text: binary ? null : txt, type };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  }, [mode, debounced]);

  const reset = () => {
    setText("");
    setFile(null);
    setFileError(null);
  };

  return (
    <div className="space-y-4">
      {mode === "encode" ? <Segmented label="Source" value={source} onChange={setSource} options={[{ value: "text", label: "Text" }, { value: "file", label: "File" }]} /> : null}

      {mode === "encode" && source === "file" ? (
        <Dropzone
          maxSize={50 * 1024 * 1024}
          formatsLabel="Any file"
          onError={setFileError}
          onFiles={async ([f]) => {
            setFile({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
          }}
        />
      ) : (
        <Panel title={mode === "encode" ? "Text to encode" : "Base64 to decode"}>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "encode" ? "Type or paste text…" : "Paste Base64 or a data: URI…"}
            aria-label="Input"
            data-testid="input"
          />
        </Panel>
      )}
      {fileError ? <ErrorMessage error={fileError} /> : null}

      {mode === "encode" ? (
        <Settings>
          <Checkbox label="URL-safe alphabet" description="- and _ instead of + and /" checked={urlSafe} onChange={setUrlSafe} />
          {urlSafe ? <Checkbox label="Keep = padding" checked={padding} onChange={setPadding} /> : null}
          <Checkbox label="Wrap lines at 76 characters" description="MIME style" checked={wrap} onChange={setWrap} />
          {source === "file" ? <Checkbox label="Output as data: URI" checked={dataUri} onChange={setDataUri} /> : null}
        </Settings>
      ) : null}

      {mode === "encode" && encoded ? (
        <TextOutput
          value={encoded}
          filename={file && source === "file" ? `${file.name}.b64.txt` : "encoded.txt"}
          label={file && source === "file" ? `Base64 of ${file.name} (${formatBytes(file.bytes.length)} → ${formatBytes(encoded.length)})` : "Base64"}
        />
      ) : null}

      {decoded && !decoded.ok ? <ErrorMessage error={decoded.error} /> : null}
      {decoded?.ok ? (
        decoded.text != null ? (
          <TextOutput value={decoded.text} filename="decoded.txt" label={`Decoded text (${formatBytes(decoded.bytes.length)})`} />
        ) : (
          <Panel title="Decoded binary data" actions={<DownloadButton blob={new Blob([decoded.bytes as BlobPart], { type: decoded.type.mime })} filename={`decoded.${decoded.type.ext}`} size="sm" />}>
            <Alert tone="info">
              The data is binary ({formatBytes(decoded.bytes.length)}, detected as .{decoded.type.ext}). Download it, or inspect the first bytes below.
            </Alert>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-bg-muted p-3 font-mono text-xs">{bytesToHex(decoded.bytes.slice(0, 256), " ")}</pre>
          </Panel>
        )
      ) : null}

      <ActionBar onReset={reset} />
    </div>
  );
}
