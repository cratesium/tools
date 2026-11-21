"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, FileResults, Panel, TaskProgress } from "@/components/tools/shared";
import { detectFileType, readHead } from "@/lib/processors/files/signatures";
import { useTask } from "@/lib/utils/hooks";

type Out = { name: string; blob: Blob; summary: string; ok: boolean };

const EMPTY_CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>`;

async function strip(f: File, keepIcc: boolean, keepOrientation: boolean): Promise<Out> {
  const head = await readHead(f);
  const t = detectFileType(head);
  const ext = t?.ext ?? f.name.split(".").pop()?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (ext === "jpg" || ext === "png" || ext === "webp") {
    const { stripLossless } = await import("@/lib/processors/image/metadata");
    const r = stripLossless(bytes, { keepIcc, keepOrientation });
    if (!r) return { name: f.name, blob: f, summary: "Could not parse image structure; file left unchanged.", ok: false };
    return {
      name: f.name,
      blob: new Blob([r.bytes as BlobPart], { type: f.type || t?.mime }),
      summary: r.removed.length ? `Removed ${r.removed.map((x) => x.label).join(", ")} (lossless).` : "No metadata found.",
      ok: true,
    };
  }
  if (ext === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("");
    doc.setProducer("");
    const epoch = new Date(0);
    doc.setCreationDate(epoch);
    doc.setModificationDate(epoch);
    // Remove the XMP metadata stream as well, which often duplicates the Info dictionary.
    const { PDFName } = await import("pdf-lib");
    doc.catalog.delete(PDFName.of("Metadata"));
    const out = await doc.save({ useObjectStreams: true });
    return { name: f.name, blob: new Blob([out as BlobPart], { type: "application/pdf" }), summary: "Cleared title, author, subject, keywords, creator, producer, dates and XMP metadata.", ok: true };
  }
  if (["docx", "xlsx", "pptx"].includes(ext) || (ext === "zip" && /\.(docx|xlsx|pptx)$/i.test(f.name))) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const removed: string[] = [];
    if (zip.file("docProps/core.xml")) {
      zip.file("docProps/core.xml", EMPTY_CORE);
      removed.push("author, title and dates (core.xml)");
    }
    if (zip.file("docProps/custom.xml")) {
      zip.remove("docProps/custom.xml");
      removed.push("custom properties");
    }
    const app = await zip.file("docProps/app.xml")?.async("string");
    if (app) {
      zip.file("docProps/app.xml", app.replace(/<(Company|Manager|Template|HyperlinkBase)>[^<]*<\/\1>/g, "<$1></$1>"));
      removed.push("company and manager (app.xml)");
    }
    const out = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: f.type });
    return { name: f.name, blob: new Blob([out as BlobPart], { type: f.type }), summary: removed.length ? `Cleared ${removed.join(", ")}. Comments and tracked changes inside the document are not removed.` : "No document properties found.", ok: true };
  }
  return { name: f.name, blob: f, summary: `Format not supported (${t?.name ?? ext ?? "unknown"}); file left unchanged.`, ok: false };
}

export default function MetadataRemover(_props: ToolComponentProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [keepIcc, setKeepIcc] = useState(true);
  const [keepOrientation, setKeepOrientation] = useState(true);
  const task = useTask<Out[]>();
  const run = () =>
    task.run(async (ctx) => {
      const out: Out[] = [];
      for (let i = 0; i < files.length; i++) {
        try {
          out.push(await strip(files[i], keepIcc, keepOrientation));
        } catch (e) {
          out.push({ name: files[i].name, blob: files[i], summary: `Failed: ${(e as Error).message}`, ok: false });
        }
        ctx.progress((i + 1) / files.length);
      }
      return out;
    });
  const cleaned = task.result?.filter((r) => r.ok) ?? [];
  return (
    <div className="space-y-4">
      <Dropzone multiple formatsLabel="JPEG, PNG, WebP, PDF, DOCX, XLSX, PPTX" onFiles={(f) => (setFiles((p) => [...p, ...f]), task.reset())} />
      <FileList files={files} onRemove={(i) => setFiles((p) => p.filter((_, j) => j !== i))} onClear={() => (setFiles([]), task.reset())} />
      <Panel title="Options for images">
        <div className="flex flex-wrap gap-5">
          <Checkbox label="Keep colour profile (ICC)" description="Prevents colour shifts" checked={keepIcc} onChange={setKeepIcc} />
          <Checkbox label="Keep orientation" description="So rotated photos stay upright" checked={keepOrientation} onChange={setKeepOrientation} />
        </div>
      </Panel>
      <ActionBar onRun={run} runLabel="Remove metadata" running={task.running} disabled={!files.length} onReset={() => (setFiles([]), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label="Cleaning files…" />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <>
          <Panel title="Summary">
            <ul className="space-y-1.5 text-sm" data-testid="output">
              {task.result.map((r, i) => (
                <li key={`${r.name}-${i}`}>
                  <span className={r.ok ? "text-success" : "text-warning"}>{r.ok ? "✓" : "–"}</span> <span className="font-medium">{r.name}</span>: <span className="text-fg-muted">{r.summary}</span>
                </li>
              ))}
            </ul>
          </Panel>
          {cleaned.length ? <FileResults files={cleaned.map((r) => ({ name: r.name, blob: r.blob }))} zipName="cleaned-files.zip" label="Cleaned files" /> : null}
        </>
      ) : null}
      <Alert tone="info">Images are cleaned losslessly – pixels are not re-encoded. Other file types (video, audio, archives) are not supported by this tool.</Alert>
    </div>
  );
}
