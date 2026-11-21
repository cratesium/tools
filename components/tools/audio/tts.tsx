"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Button } from "@/components/ui/button";
import { Field, Select, Slider, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Panel, Settings, UnsupportedNotice } from "@/components/tools/shared";
import { useSupport } from "@/lib/utils/hooks";

/** Splits text into utterances of ≤ ~200 chars at sentence boundaries (long utterances stall in Chrome). */
export function splitForSpeech(text: string, max = 200): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (const part of s.match(new RegExp(`.{1,${max}}(\\s|$)`, "g")) ?? [s]) out.push(part.trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** Text to Speech with the browser's built-in voices (Web Speech API). Playback only. */
export default function TextToSpeech(_: ToolComponentProps) {
  const supported = useSupport(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [text, setText] = useState("Hello! This is UtilityHub reading your text aloud, right in your browser.");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  const [progress, setProgress] = useState({ i: 0, n: 0 });

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().slice().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const parts = splitForSpeech(text);
    if (!parts.length) return;
    const v = voices.find((x) => x.voiceURI === voice) ?? voices.find((x) => x.default);
    setProgress({ i: 0, n: parts.length });
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;
      u.onstart = () => setProgress({ i, n: parts.length });
      if (i === parts.length - 1) u.onend = () => setState("idle");
      u.onerror = (e) => {
        if (e.error !== "interrupted" && e.error !== "canceled") setState("idle");
      };
      synth.speak(u);
    });
    setState("speaking");
  };

  if (supported === false) return <UnsupportedNotice feature="Speech synthesis" />;
  const langs = [...new Set(voices.map((v) => v.lang))];

  return (
    <div className="space-y-4">
      <Field label="Text" hint={`${text.length.toLocaleString()} characters`}>{(id) => <Textarea id={id} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to read aloud…" />}</Field>
      <Panel title="Voice">
        <div className="space-y-4">
          <Settings>
            <Field label={`Voice (${voices.length} available)`}>
              {(id) => (
                <Select id={id} value={voice} onChange={(e) => setVoice(e.target.value)}>
                  <option value="">Default voice</option>
                  {langs.map((l) => (
                    <optgroup key={l} label={l}>
                      {voices.filter((v) => v.lang === l).map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name}
                          {v.localService ? "" : " (online)"}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              )}
            </Field>
          </Settings>
          <Slider label="Speed" value={rate} min={0.5} max={2} step={0.05} onChange={setRate} format={(v) => `${v.toFixed(2)}×`} />
          <Slider label="Pitch" value={pitch} min={0} max={2} step={0.05} onChange={setPitch} format={(v) => v.toFixed(2)} />
          <Slider label="Volume" value={volume} min={0} max={1} step={0.05} onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`} />
        </div>
      </Panel>
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" ? (
          <Button onClick={speak} disabled={!text.trim()} icon={<Play className="h-4 w-4" />} data-testid="run">Speak</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => (state === "speaking" ? (window.speechSynthesis.pause(), setState("paused")) : (window.speechSynthesis.resume(), setState("speaking")))} icon={state === "speaking" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}>{state === "speaking" ? "Pause" : "Resume"}</Button>
            <Button variant="secondary" onClick={() => (window.speechSynthesis.cancel(), setState("idle"))} icon={<Square className="h-4 w-4" />}>Stop</Button>
            <span className="text-xs text-fg-muted">Sentence {progress.i + 1} of {progress.n}</span>
          </>
        )}
      </div>
      <Alert tone="info">
        Speech uses the voices installed in your browser and operating system, so the voice list differs between devices. Voices marked “online” are provided by your browser vendor and may send the text to their servers; the others run on your device. Browsers don&apos;t allow saving speech-synthesis output, so this tool plays audio but cannot download an audio file.
      </Alert>
    </div>
  );
}
