"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { ActionBar, ErrorMessage, FileResult, KeyValueTable, Panel, Settings, TaskProgress } from "@/components/tools/shared";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { useObjectUrl, useTask } from "@/lib/utils/hooks";
import type { Id3Tags } from "@/lib/processors/audio/id3";
import type { MetadataKey } from "@/lib/processors/audio/args";
import { FFmpegNotice, LogPanel, MediaPicker, Player, baseOf, useFFmpegTask, useMedia } from "../video/media-common";

const FIELDS: { key: keyof Id3Tags & string; ff: MetadataKey; label: string }[] = [
  { key: "title", ff: "title", label: "Title" },
  { key: "artist", ff: "artist", label: "Artist" },
  { key: "album", ff: "album", label: "Album" },
  { key: "albumArtist", ff: "album_artist", label: "Album artist" },
  { key: "year", ff: "date", label: "Year" },
  { key: "track", ff: "track", label: "Track number" },
  { key: "genre", ff: "genre", label: "Genre" },
  { key: "composer", ff: "composer", label: "Composer" },
  { key: "comment", ff: "comment", label: "Comment" },
];

type Tags = Record<string, string>;
const isMp3 = (f: File) => /\.mp3$/i.test(f.name) || f.type === "audio/mpeg";

/** Audio Metadata Editor: ID3v2.3 (with cover art) for MP3, FFmpeg tag rewriting for M4A/FLAC/OGG/Opus. */
export function AudioMetadataEditor(_: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const { url } = useMedia(file, "audio");
  const [tags, setTags] = useState<Tags | null>(null);
  const [cover, setCover] = useState<{ blob: Blob; mime: string } | null>(null);
  const [newCover, setNewCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [unknown, setUnknown] = useState<{ id: string; flags: number; data: Uint8Array }[]>([]);
  const load = useFFmpegTask<null>();
  const save = useFFmpegTask<{ blob: Blob; name: string }>();
  const coverUrl = useObjectUrl(cover?.blob);

  const pick = (f: File | null) => {
    setFile(f);
    setTags(null);
    setCover(null);
    setNewCover(null);
    setRemoveCover(false);
    save.reset();
    load.reset();
    if (!f) return;
    if (isMp3(f)) {
      void (async () => {
        const { readId3 } = await import("@/lib/processors/audio/id3");
        const r = readId3(new Uint8Array(await f.arrayBuffer()));
        const t: Tags = {};
        for (const x of FIELDS) t[x.key] = (r.tags[x.key] as string | undefined) ?? "";
        setTags(t);
        setUnknown(r.unknownFrames);
        if (r.tags.picture) setCover({ blob: new Blob([r.tags.picture.data as BlobPart], { type: r.tags.picture.mime }), mime: r.tags.picture.mime });
      })();
    } else {
      void load.run(async (s) => {
        const p = await s.probe(await s.input(f, f.name));
        const t: Tags = {};
        const lower: Record<string, string> = {};
        for (const [k, v] of Object.entries(p.metadata)) lower[k.toLowerCase()] = v;
        for (const x of FIELDS) t[x.key] = lower[x.ff] ?? (x.ff === "date" ? (lower.year ?? "") : "");
        setTags(t);
        return null;
      });
    }
  };

  const run = () =>
    save.run(async (s, ctx) => {
      if (!file || !tags) throw new Error("Add an audio file first.");
      if (isMp3(file)) {
        const { readId3, writeId3 } = await import("@/lib/processors/audio/id3");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const current = readId3(bytes);
        const t: Id3Tags = {};
        for (const x of FIELDS) (t as Record<string, string>)[x.key] = tags[x.key].trim();
        if (newCover) t.picture = { mime: newCover.type || "image/jpeg", type: 3, description: "Cover", data: new Uint8Array(await newCover.arrayBuffer()) };
        else if (!removeCover) t.picture = current.tags.picture ?? null;
        else t.picture = null;
        ctx.progress(1);
        return { blob: new Blob([writeId3(bytes, t, unknown) as BlobPart], { type: "audio/mpeg" }), name: file.name };
      }
      const a = await import("@/lib/processors/audio/args");
      const input = await s.input(file, file.name);
      const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? "m4a";
      const out = `out.${ext}`;
      const ff: Partial<Record<MetadataKey, string>> = {};
      for (const x of FIELDS) ff[x.ff] = tags[x.key].trim();
      await s.exec(a.metadataArgs(input, out, ff, false), { label: "Writing tags…" });
      return { blob: await s.readBlob(out, file.type || "application/octet-stream"), name: file.name };
    });

  return (
    <div className="space-y-4">
      <MediaPicker file={file} onFile={pick} kind="audio" label="MP3, M4A, FLAC, OGG or Opus" />
      <Player url={url} kind="audio" />
      <TaskProgress running={load.running} progress={load.progress} label={load.progressLabel} />
      <ErrorMessage error={load.error} />
      {tags && file ? (
        <Panel title="Tags">
          <div className="space-y-4">
            <Settings>
              {FIELDS.map((x) => (
                <Field key={x.key} label={x.label}>{(id) => <Input id={id} value={tags[x.key]} onChange={(e) => setTags({ ...tags, [x.key]: e.target.value })} />}</Field>
              ))}
            </Settings>
            {isMp3(file) ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Cover art</p>
                <div className="flex flex-wrap items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {coverUrl && !removeCover && !newCover ? <img src={coverUrl} alt="Current cover art" className="h-28 w-28 rounded border border-border object-cover" /> : null}
                  <div className="min-w-60 flex-1 space-y-2">
                    {newCover ? <FileList files={[newCover]} onClear={() => setNewCover(null)} /> : <Dropzone accept="image/jpeg,image/png" formatsLabel="JPG or PNG, square 500–1400 px recommended" onFiles={(f) => setNewCover(f[0])} />}
                    {cover && !newCover ? <Checkbox label="Remove existing cover art" checked={removeCover} onChange={setRemoveCover} /> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
      <ActionBar onRun={run} runLabel="Save tags" running={save.running} disabled={!tags} onCancel={save.cancel} onReset={() => pick(null)} />
      <TaskProgress running={save.running} progress={save.progress} label={save.progressLabel} />
      <ErrorMessage error={save.error} />
      {save.result ? <FileResult blob={save.result.blob} filename={save.result.name} label="Tagged file" preview={false}><p className="text-xs text-fg-muted">The audio data was not re-encoded.</p></FileResult> : null}
      <LogPanel logs={load.logs.length ? load.logs : save.logs} />
      {file && !isMp3(file) ? <FFmpegNotice /> : null}
    </div>
  );
}

/** Audio Metadata Remover: strips ID3v1/v2, APE and Lyrics3 tags from MP3 in pure JS; other formats via FFmpeg. */
export function AudioMetadataRemover(_: ToolComponentProps) {
  const [file, setFile] = useState<File | null>(null);
  const [keepCover, setKeepCover] = useState(false);
  const task = useTask<{ blob: Blob; name: string; removed: string[]; before: [string, string][] }>();
  const run = () =>
    task.run(async ({ signal, progress }) => {
      if (!file) throw new Error("Add an audio file first.");
      const name = `${baseOf(file.name)}-clean${/\.[^.]+$/.exec(file.name)?.[0] ?? ".mp3"}`;
      if (isMp3(file) && !keepCover) {
        const { readId3, stripId3 } = await import("@/lib/processors/audio/id3");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const before = readId3(bytes).frames.map((f) => [f.id, f.value] as [string, string]);
        const r = stripId3(bytes);
        return { blob: new Blob([r.bytes as BlobPart], { type: "audio/mpeg" }), name, removed: r.removed, before };
      }
      const { withFFmpeg } = await import("@/lib/processors/media/ffmpeg");
      const a = await import("@/lib/processors/audio/args");
      return withFFmpeg(
        async (s) => {
          const input = await s.input(file, file.name);
          const p = await s.probe(input);
          const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? "m4a";
          await s.exec(a.stripAudioMetadataArgs(input, `out.${ext}`, keepCover), { duration: p.duration, label: "Removing tags…" });
          const before = Object.entries(p.metadata) as [string, string][];
          return { blob: await s.readBlob(`out.${ext}`, file.type || "application/octet-stream"), name, removed: before.length ? [`${before.length} tag(s)`] : [], before };
        },
        { signal, onProgress: (v, l) => progress(v, l) },
      );
    });
  return (
    <div className="space-y-4">
      {file ? <FileList files={[file]} onClear={() => (setFile(null), task.reset())} /> : <Dropzone accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav" formatsLabel="MP3, M4A, FLAC, OGG, Opus or WAV" onFiles={(f) => (setFile(f[0]), task.reset())} />}
      <Checkbox label="Keep cover art" description="Removes text tags only (uses FFmpeg)" checked={keepCover} onChange={setKeepCover} />
      <ActionBar onRun={run} runLabel="Remove metadata" running={task.running} disabled={!file} onCancel={task.cancel} onReset={() => (setFile(null), task.reset())} />
      <TaskProgress running={task.running} progress={task.progress} label={task.progressLabel} />
      <ErrorMessage error={task.error} />
      {task.result ? (
        <FileResult blob={task.result.blob} filename={task.result.name} originalSize={file?.size} label="Cleaned audio">
          <p className="text-xs text-fg-muted">{task.result.removed.length ? `Removed: ${task.result.removed.join(", ")}.` : "No tags were found."} The audio data is unchanged.</p>
          {task.result.before.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-fg-muted">Tags that were removed ({task.result.before.length})</summary>
              <div className="mt-2"><KeyValueTable rows={task.result.before} /></div>
            </details>
          ) : null}
        </FileResult>
      ) : null}
    </div>
  );
}
