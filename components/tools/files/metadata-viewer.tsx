"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, ErrorMessage, KeyValueTable, Panel, TaskProgress } from "@/components/tools/shared";
import { detectFileType, looksLikeText, readHead } from "@/lib/processors/files/signatures";
import { formatBytes } from "@/lib/utils/format";
import { errorMessage, useTask } from "@/lib/utils/hooks";

type Section = { title: string; rows: [string, string][] };

function fmtVal(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array || ArrayBuffer.isView(v)) return `<${(v as Uint8Array).byteLength} bytes>`;
  if (Array.isArray(v)) return v.length > 12 ? `[${v.slice(0, 12).join(", ")}, …]` : `[${v.join(", ")}]`;
  if (v && typeof v === "object") return JSON.stringify(v).slice(0, 300);
  return String(v);
}

async function embedded(file: File, ext: string): Promise<Section[]> {
  const out: Section[] = [];
  if (["jpg", "png", "webp", "tif", "heic", "avif"].includes(ext)) {
    const exifr = (await import("exifr")).default;
    const data = await exifr.parse(file, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: false, mergeOutput: true }).catch(() => null);
    if (data) out.push({ title: "Image metadata (EXIF / IPTC / XMP)", rows: Object.entries(data).slice(0, 120).map(([k, v]) => [k, fmtVal(v)]) });
    const gps = await exifr.gps(file).catch(() => null);
    if (gps?.latitude != null) out.push({ title: "Location", rows: [["Coordinates", `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`], ["Map", `https://www.openstreetmap.org/?mlat=${gps.latitude}&mlon=${gps.longitude}#map=16/${gps.latitude}/${gps.longitude}`]] });
  }
  if (ext === "pdf") {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    out.push({
      title: "PDF document information",
      rows: [
        ["Pages", String(doc.getPageCount())],
        ["Title", doc.getTitle() ?? "—"],
        ["Author", doc.getAuthor() ?? "—"],
        ["Subject", doc.getSubject() ?? "—"],
        ["Keywords", doc.getKeywords() ?? "—"],
        ["Creator", doc.getCreator() ?? "—"],
        ["Producer", doc.getProducer() ?? "—"],
        ["Created", doc.getCreationDate()?.toISOString() ?? "—"],
        ["Modified", doc.getModificationDate()?.toISOString() ?? "—"],
        ["Encrypted", doc.isEncrypted ? "yes" : "no"],
      ],
    });
  }
  if (["docx", "xlsx", "pptx", "zip"].includes(ext)) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file).catch(() => null);
    const core = await zip?.file("docProps/core.xml")?.async("string");
    const app = await zip?.file("docProps/app.xml")?.async("string");
    const rows: [string, string][] = [];
    for (const xml of [core, app]) {
      if (!xml) continue;
      for (const m of xml.matchAll(/<(?:[a-zA-Z]+:)?([A-Za-z]+)(?:\s[^>]*)?>([^<]{1,300})<\/(?:[a-zA-Z]+:)?\1>/g)) rows.push([m[1], m[2]]);
    }
    if (rows.length) out.push({ title: "Office document properties", rows });
  }
  if (["mp3"].includes(ext)) {
    const b = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) out.push({ title: "Audio tags", rows: [["ID3 version", `2.${b[3]}.${b[4]}`]] });
  }
  return out;
}

export default function MetadataViewer(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const task = useTask<Section[]>();
  const inspect = (f: File) =>
    task.run(async (ctx) => {
      ctx.progress(null, "Reading metadata…");
      const head = await readHead(f);
      const t = detectFileType(head);
      const txt = t ? null : looksLikeText(head);
      const { hashBlob, encodeDigest } = await import("@/lib/processors/security/hash");
      const h = await hashBlob(f, ["md5", "sha256"], { onProgress: (x) => ctx.progress(x, "Hashing…") });
      const basic: Section = {
        title: "File system",
        rows: [
          ["Name", f.name],
          ["Size", `${formatBytes(f.size)} (${f.size.toLocaleString()} bytes)`],
          ["Last modified", new Date(f.lastModified).toLocaleString()],
          ["Browser MIME type", f.type || "—"],
          ["Detected format", t ? `${t.name} (.${t.ext}, ${t.mime})` : txt?.text ? `Text${txt.encoding ? `, ${txt.encoding}` : ""}` : "Unrecognised"],
          ["MD5", encodeDigest(h.md5, "hex")],
          ["SHA-256", encodeDigest(h.sha256, "hex")],
        ],
      };
      let extra: Section[] = [];
      try {
        extra = await embedded(f, t?.ext ?? f.name.split(".").pop()?.toLowerCase() ?? "");
      } catch (e) {
        extra = [{ title: "Embedded metadata", rows: [["Error", errorMessage(e)]] }];
      }
      return [basic, ...extra];
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone formatsLabel="Any file – images, PDFs, Office documents and more" onFiles={([f]) => (setFile(f), inspect(f))} />}
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      <div data-testid="output" className="space-y-4">
        {task.result?.map((s) => (
          <Panel key={s.title} title={s.title}>
            <KeyValueTable rows={s.rows} />
          </Panel>
        ))}
      </div>
      <ActionBar onReset={() => (setFile(null), task.reset())} />
    </div>
  );
}
