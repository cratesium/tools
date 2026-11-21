"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Settings } from "@/components/tools/shared";
import { Dropzone, FileList } from "@/components/upload/dropzone";
import { baseOf } from "./media-common";
import { VideoShell, useVideoTool, type OutFile } from "./shell";

/** Video Subtitle Extractor: exports every text subtitle track as SRT, VTT or ASS. */
export function SubtitleExtract(_: ToolComponentProps) {
  const t = useVideoTool();
  const [format, setFormat] = useState<"srt" | "vtt" | "ass">("srt");
  const run = () =>
    t.run(async ({ s, input, file, probe, ctx }) => {
      const a = await import("@/lib/processors/video/args");
      const { subtitleStreams, isTextSubtitle } = await import("@/lib/processors/media/probe");
      const subs = subtitleStreams(probe);
      if (!subs.length) throw new Error("This video has no embedded subtitle tracks. (Subtitles burned into the picture cannot be extracted.)");
      const text = subs.filter(isTextSubtitle);
      if (!text.length) throw new Error(`The subtitle tracks are image-based (${subs.map((x) => x.codec).join(", ")}), which would need OCR to convert to text. Only text subtitles can be extracted.`);
      const outs: OutFile[] = [];
      for (let i = 0; i < text.length; i++) {
        const st = text[i];
        const out = `sub${i}.${format}`;
        ctx.progress(i / text.length, `Track ${i + 1} of ${text.length}…`);
        await s.exec(a.extractSubtitleArgs(input, out, st.typeIndex, format), { label: `Extracting track ${i + 1}…` });
        const tag = [st.language, st.metadata.title].filter(Boolean).join("-").replace(/[^\w-]+/g, "_");
        outs.push({ blob: await s.readBlob(out, format === "vtt" ? "text/vtt" : "text/plain"), name: `${baseOf(file.name)}.${tag || `track${st.typeIndex + 1}`}.${format}`, note: `Track ${st.typeIndex + 1} (${st.codec}${st.language ? `, ${st.language}` : ""})` });
      }
      const skipped = subs.length - text.length;
      if (skipped && outs[0]) outs[0].note = `${outs[0].note}. ${skipped} image-based track(s) skipped.`;
      return outs;
    });
  return (
    <VideoShell
      tool={t}
      runLabel="Extract subtitles"
      onRun={run}
      resultLabel="Subtitles"
      zipName={`${t.file ? baseOf(t.file.name) : "video"}-subtitles.zip`}
      settings={
        <Settings>
          <Field label="Format">{(id) => <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as "srt" | "vtt" | "ass")}><option value="srt">SRT (SubRip)</option><option value="vtt">WebVTT</option><option value="ass">ASS/SSA</option></Select>}</Field>
        </Settings>
      }
    />
  );
}

const LANGS: [string, string][] = [["", "Not set"], ["eng", "English"], ["hin", "Hindi"], ["spa", "Spanish"], ["fra", "French"], ["deu", "German"], ["por", "Portuguese"], ["ita", "Italian"], ["jpn", "Japanese"], ["kor", "Korean"], ["zho", "Chinese"], ["ara", "Arabic"], ["rus", "Russian"], ["ben", "Bengali"], ["tam", "Tamil"], ["tel", "Telugu"]];

/** Video Subtitle Merger: adds an SRT/VTT/ASS file as a soft (selectable) subtitle track. */
export function SubtitleMerge(_: ToolComponentProps) {
  const t = useVideoTool();
  const [sub, setSub] = useState<File | null>(null);
  const [container, setContainer] = useState<"mp4" | "mkv" | "webm">("mp4");
  const [lang, setLang] = useState("eng");
  const [title, setTitle] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [keep, setKeep] = useState(true);
  const run = () =>
    t.run(async ({ s, input, file, probe }) => {
      if (!sub) throw new Error("Add a subtitle file.");
      const a = await import("@/lib/processors/video/args");
      const { subtitleStreams, firstVideo, firstAudio } = await import("@/lib/processors/media/probe");
      const ext = /\.(srt|vtt|ass|ssa)$/i.exec(sub.name)?.[1].toLowerCase() ?? "srt";
      const subPath = await s.input(sub, `subs.${ext}`);
      const v = firstVideo(probe)?.codec ?? "";
      const au = firstAudio(probe)?.codec;
      if (container === "webm" && (!["vp8", "vp9", "av1"].includes(v) || (au && !["opus", "vorbis"].includes(au)))) throw new Error("WebM output needs VP8/VP9 video and Opus/Vorbis audio. Choose MP4 or MKV for this video.");
      if (container === "mp4" && !["h264", "hevc", "mpeg4", "av1"].includes(v)) throw new Error(`MP4 cannot hold ${v} video without re-encoding. Choose MKV instead.`);
      const existing = subtitleStreams(probe).length;
      const out = `out.${container}`;
      await s.exec(a.addSubtitleArgs(input, subPath, out, container, { language: lang || undefined, title: title || undefined, makeDefault, keepExisting: keep && container === "mkv", existingSubtitleCount: existing }), { duration: probe.duration, label: "Adding subtitle track…" });
      const mime = container === "mp4" ? "video/mp4" : container === "mkv" ? "video/x-matroska" : "video/webm";
      return { blob: await s.readBlob(out, mime), name: `${baseOf(file.name)}-subtitled.${container}`, note: "Soft subtitles added: turn them on in your player's subtitle menu. Video and audio were copied without re-encoding." };
    });
  return (
    <VideoShell
      tool={t}
      runLabel="Add subtitles"
      onRun={run}
      canRun={!!sub}
      resultLabel="Video with subtitles"
      before={sub ? <FileList files={[sub]} onClear={() => setSub(null)} /> : t.file ? <Dropzone accept=".srt,.vtt,.ass,.ssa,text/vtt" formatsLabel="Subtitle file: SRT, VTT, ASS or SSA" onFiles={(f) => setSub(f[0])} /> : null}
      settings={
        <div className="space-y-4">
          <Settings>
            <Field label="Output format">{(id) => <Select id={id} value={container} onChange={(e) => setContainer(e.target.value as "mp4" | "mkv" | "webm")}><option value="mp4">MP4 (mov_text)</option><option value="mkv">MKV (SRT, keeps styling best)</option><option value="webm">WebM (WebVTT)</option></Select>}</Field>
            <Field label="Language">{(id) => <Select id={id} value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select>}</Field>
            <Field label="Track title (optional)">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="English (CC)" />}</Field>
          </Settings>
          <Checkbox label="Show by default" checked={makeDefault} onChange={setMakeDefault} />
          {container === "mkv" ? <Checkbox label="Keep existing subtitle tracks" checked={keep} onChange={setKeep} /> : null}
          <Alert tone="info">This adds a soft subtitle track that viewers can switch on or off. Burning subtitles into the picture needs font rendering, which this browser build of FFmpeg does not include.</Alert>
        </div>
      }
    />
  );
}
