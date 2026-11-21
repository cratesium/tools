"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Segmented, Textarea } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, CopyButton, ErrorMessage, FileResult, Panel } from "@/components/tools/shared";
import { base64Snippets, bytesToBase64, parseBase64Image } from "@/lib/processors/image/base64";
import { formatBytes } from "@/lib/utils/format";
import { errorMessage, useTask } from "@/lib/utils/hooks";
import { IMAGE_ACCEPT } from "./common";

type Snip = "dataUri" | "base64" | "css" | "html" | "markdown" | "json";
const LABEL: Record<Snip, string> = { dataUri: "Data URI", base64: "Base64 only", css: "CSS", html: "HTML <img>", markdown: "Markdown", json: "JSON" };

function ToBase64() {
  const [file, setFile] = useState<File | null>(null);
  const [snip, setSnip] = useState<Snip>("dataUri");
  const task = useTask<Record<Snip, string>>();
  const load = (f: File) => task.run(async () => base64Snippets(f.type || "image/png", bytesToBase64(new Uint8Array(await f.arrayBuffer())), f.name.replace(/\.[^.]+$/, "")));
  const out = task.result?.[snip] ?? "";
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} maxSize={10 * 1024 * 1024} formatsLabel="PNG, JPG, SVG, WebP, GIF, ICO (up to 10 MB)" onFiles={([f]) => (setFile(f), load(f))} />}
      <ErrorMessage error={task.error} />
      {task.result && file ? (
        <>
          <Segmented label="Output" value={snip} onChange={setSnip} options={(Object.keys(LABEL) as Snip[]).map((k) => ({ value: k, label: LABEL[k] }))} />
          <Panel title={<span className="flex items-center gap-2">Result <Badge>{formatBytes(out.length)}</Badge> <span className="text-xs font-normal text-fg-subtle">from {formatBytes(file.size)} (+33%)</span></span>} actions={<CopyButton text={out} />}>
            <Textarea readOnly value={out} aria-label="Base64 output" data-testid="output" className="min-h-[160px] break-all" />
          </Panel>
          {file.size > 32 * 1024 ? <Alert tone="info">Inlining images larger than a few KB usually hurts page performance – Base64 is about a third bigger and can&apos;t be cached separately. Prefer a normal image file for large images.</Alert> : null}
        </>
      ) : null}
      <ActionBar onReset={() => (setFile(null), task.reset())} />
    </div>
  );
}

function FromBase64() {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const p = parseBase64Image(text);
      return { ok: true as const, p, blob: new Blob([p.bytes as BlobPart], { type: p.mime ?? "application/octet-stream" }) };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  }, [text]);
  const ext = parsed?.ok ? (parsed.p.mime ?? "image/png").split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg").replace("x-icon", "ico") : "png";
  return (
    <div className="space-y-4">
      <Panel title="Base64 or data URI">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="data:image/png;base64,iVBORw0KGgo… or just the Base64 text" aria-label="Base64 input" data-testid="input" className="min-h-[160px] break-all" />
      </Panel>
      {parsed && !parsed.ok ? <ErrorMessage error={parsed.error} /> : null}
      {parsed?.ok ? (
        <>
          {!parsed.p.detectedMime ? <Alert tone="warning">The decoded data doesn&apos;t look like a known image format{parsed.p.declaredMime ? ` (declared as ${parsed.p.declaredMime})` : ""}.</Alert> : null}
          {parsed.p.declaredMime && parsed.p.detectedMime && parsed.p.declaredMime !== parsed.p.detectedMime ? <Alert tone="info">The data URI says {parsed.p.declaredMime}, but the content is {parsed.p.detectedMime}. The detected type is used.</Alert> : null}
          <FileResult blob={parsed.blob} filename={`image.${ext}`} label={`Decoded image (${parsed.p.mime ?? "unknown type"})`} />
        </>
      ) : null}
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}

/** Image to Base64 (mode "encode") and Base64 to Image (mode "decode"). */
export default function ImageBase64({ tool }: ToolComponentProps) {
  return tool.processorOptions?.mode === "decode" ? <FromBase64 /> : <ToBase64 />;
}
