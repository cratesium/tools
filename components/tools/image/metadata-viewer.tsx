"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Alert } from "@/components/ui/feedback";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { ActionBar, BlobPreview, ErrorMessage, KeyValueTable, Panel, TaskProgress } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import { IMAGE_ACCEPT } from "./common";

type Group = { title: string; rows: [string, string][] };
const fmt = (v: unknown): string => (v instanceof Date ? v.toLocaleString() : ArrayBuffer.isView(v) ? `<${(v as Uint8Array).byteLength} bytes>` : Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? JSON.stringify(v) : String(v));

const GROUPS: [string, RegExp][] = [
  ["Camera", /^(Make|Model|LensMake|LensModel|LensInfo|Software|BodySerialNumber|SerialNumber)$/],
  ["Exposure", /^(ExposureTime|FNumber|ISO|ExposureProgram|ExposureCompensation|MeteringMode|Flash|FocalLength|FocalLengthIn35mmFormat|WhiteBalance|ShutterSpeedValue|ApertureValue)$/],
  ["Date & time", /(Date|Time|OffsetTime)/],
  ["Image", /^(ImageWidth|ImageHeight|ExifImageWidth|ExifImageHeight|Orientation|ColorSpace|XResolution|YResolution|ResolutionUnit|BitsPerSample|ColorType)$/],
  ["Author & rights", /^(Artist|Copyright|creator|rights|Creator|Rights|Credit|By-line|CopyrightNotice|description|title)$/i],
];

export default function ImageMetadataViewer(_props: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const url = useObjectUrl(file);
  const task = useTask<{ groups: Group[]; gps: { lat: number; lon: number } | null; count: number }>();
  const inspect = (f: File) =>
    task.run(async () => {
      const exifr = (await import("exifr")).default;
      const all = (await exifr.parse(f, { tiff: true, exif: true, gps: true, iptc: true, xmp: true, icc: true, jfif: true, ihdr: true, mergeOutput: true, translateValues: true, reviveValues: true })) as Record<string, unknown> | undefined;
      const gpsRaw = await exifr.gps(f).catch(() => null);
      const entries = Object.entries(all ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
      const used = new Set<string>();
      const groups: Group[] = GROUPS.map(([title, re]) => {
        const rows = entries.filter(([k]) => re.test(k) && !used.has(k)).map(([k, v]) => (used.add(k), [k, fmt(v)] as [string, string]));
        return { title, rows };
      }).filter((g) => g.rows.length);
      const rest = entries.filter(([k]) => !used.has(k) && !/^(latitude|longitude|GPS)/i.test(k)).map(([k, v]) => [k, fmt(v)] as [string, string]);
      if (rest.length) groups.push({ title: "Other tags", rows: rest });
      return { groups, gps: gpsRaw?.latitude != null ? { lat: gpsRaw.latitude, lon: gpsRaw.longitude } : null, count: entries.length };
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept={IMAGE_ACCEPT} formatsLabel="JPG, HEIC, PNG, WebP, TIFF, AVIF" onFiles={([f]) => (setFile(f), inspect(f))} />}
      <TaskProgress running={task.running} progress={null} label="Reading metadata…" />
      <ErrorMessage error={task.error} />
      {file && url && task.result ? (
        <>
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="checkerboard flex items-center justify-center rounded-lg border border-border p-2">{file.type.includes("heic") ? <p className="text-xs text-fg-subtle">HEIC preview not supported</p> : <BlobPreview url={url} type={file.type || "image/jpeg"} name={file.name} />}</div>
            <div className="space-y-3">
              <KeyValueTable rows={[["File", file.name], ["Size", formatBytes(file.size)], ["Type", file.type || "—"], ["Metadata tags", String(task.result.count)]]} />
              {task.result.gps ? (
                <Alert tone="warning" title="This photo contains GPS location">
                  {task.result.gps.lat.toFixed(6)}, {task.result.gps.lon.toFixed(6)} –{" "}
                  <a className="underline" href={`https://www.openstreetmap.org/?mlat=${task.result.gps.lat}&mlon=${task.result.gps.lon}#map=16/${task.result.gps.lat}/${task.result.gps.lon}`} target="_blank" rel="noopener noreferrer">view on map</a>. Remove it before sharing with the Image Metadata Remover.
                </Alert>
              ) : null}
            </div>
          </div>
          <div className="space-y-4" data-testid="output">
            {task.result.groups.length ? task.result.groups.map((g) => <Panel key={g.title} title={g.title}><KeyValueTable rows={g.rows} /></Panel>) : <Alert tone="info">No EXIF, IPTC or XMP metadata found in this image.</Alert>}
          </div>
        </>
      ) : null}
      <ActionBar onReset={() => (setFile(null), task.reset())} />
    </div>
  );
}
