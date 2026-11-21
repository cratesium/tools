"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Textarea } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, CopyButton, Panel } from "@/components/tools/shared";
import { paragraphDetails, sentenceDetails, smsInfo, textStats, utf8Bytes, wordFrequency } from "@/lib/processors/text/counters";
import { useDebounced } from "@/lib/utils/hooks";
import { formatNumber } from "@/lib/utils/format";

/**
 * Reference implementation of a live text tool. Shared by word/character/sentence/paragraph
 * counters; processorOptions.focus decides which statistic is primary.
 */
export default function WordCounter({ tool }: ToolComponentProps) {
  const [text, setText] = useState("");
  // Debounce only the heavier secondary analysis; headline counts stay instant.
  const slow = useDebounced(text, 150);
  const stats = useMemo(() => textStats(text), [text]);
  const freq = useMemo(() => wordFrequency(slow, 8), [slow]);
  const focus = (tool.processorOptions?.focus as string) ?? "words";

  const all = [
    { key: "words", label: "Words", value: stats.words },
    { key: "characters", label: "Characters", value: stats.characters },
    { key: "charactersNoSpaces", label: "Characters (no spaces)", value: stats.charactersNoSpaces },
    { key: "sentences", label: "Sentences", value: stats.sentences },
    { key: "paragraphs", label: "Paragraphs", value: stats.paragraphs },
    { key: "lines", label: "Lines", value: stats.lines },
  ];
  const ordered = [...all.filter((s) => s.key === focus), ...all.filter((s) => s.key !== focus)];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="stats">
        {ordered.map((s) => (
          <Stat key={s.key} label={s.label} value={formatNumber(s.value, 0)} />
        ))}
      </div>
      <Panel title="Your text" actions={<CopyButton text={text} />}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste your text here…"
          aria-label="Text input"
          data-testid="input"
          className="min-h-[260px] font-sans text-sm"
        />
      </Panel>
      {focus === "characters" ? <CharacterLimits text={text} /> : null}
      {focus === "sentences" ? <SentencePanel text={slow} /> : null}
      {focus === "paragraphs" ? <ParagraphPanel text={slow} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Details">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-fg-muted">Unique words</dt>
            <dd className="text-right font-mono">{formatNumber(stats.uniqueWords, 0)}</dd>
            <dt className="text-fg-muted">Average word length</dt>
            <dd className="text-right font-mono">{stats.avgWordLength.toFixed(1)}</dd>
            <dt className="text-fg-muted">Reading time</dt>
            <dd className="text-right font-mono">{Math.ceil(stats.readingTimeMin)} min</dd>
            <dt className="text-fg-muted">Speaking time</dt>
            <dd className="text-right font-mono">{Math.ceil(stats.speakingTimeMin)} min</dd>
          </dl>
        </Panel>
        <Panel title="Top words">
          {freq.length ? (
            <ul className="space-y-1.5 text-sm">
              {freq.map(([w, n]) => (
                <li key={w} className="flex justify-between">
                  <span className="truncate text-fg">{w}</span>
                  <span className="font-mono text-fg-muted">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">Start typing to see word frequency.</p>
          )}
        </Panel>
      </div>
      <ActionBar onReset={() => setText("")} />
    </div>
  );
}

const LIMITS: { label: string; max: number }[] = [
  { label: "SEO title tag", max: 60 },
  { label: "Meta description", max: 160 },
  { label: "X (Twitter) post", max: 280 },
  { label: "Threads post", max: 500 },
  { label: "LinkedIn post", max: 3000 },
  { label: "Instagram caption", max: 2200 },
];

function CharacterLimits({ text }: { text: string }) {
  const chars = [...text].length;
  const sms = smsInfo(text);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Common character limits">
        <ul className="space-y-2.5 text-sm" data-testid="limits">
          {LIMITS.map((l) => {
            const pct = Math.min(100, (chars / l.max) * 100);
            const over = chars > l.max;
            return (
              <li key={l.label}>
                <div className="flex justify-between">
                  <span className="text-fg-muted">{l.label}</span>
                  <span className={over ? "font-mono text-danger" : "font-mono text-fg"}>
                    {formatNumber(chars, 0)} / {formatNumber(l.max, 0)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                  <div className={over ? "h-full bg-danger" : "h-full bg-accent"} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-fg-subtle">Counts are Unicode code points; platforms may count some emoji differently.</p>
      </Panel>
      <Panel title="Bytes and SMS">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-fg-muted">UTF-8 size</dt>
          <dd className="text-right font-mono">{formatNumber(utf8Bytes(text), 0)} bytes</dd>
          <dt className="text-fg-muted">UTF-16 code units</dt>
          <dd className="text-right font-mono">{formatNumber(text.length, 0)}</dd>
          <dt className="text-fg-muted">SMS encoding</dt>
          <dd className="text-right font-mono">{sms.encoding}</dd>
          <dt className="text-fg-muted">SMS segments</dt>
          <dd className="text-right font-mono">{sms.segments}</dd>
          <dt className="text-fg-muted">Left in segment</dt>
          <dd className="text-right font-mono">{sms.remaining}</dd>
        </dl>
        <p className="mt-3 text-xs text-fg-subtle">
          GSM-7 allows 160 characters per SMS (153 when split); any character outside it switches the whole message to UCS-2 (70 / 67).
        </p>
      </Panel>
    </div>
  );
}

function SentencePanel({ text }: { text: string }) {
  const d = useMemo(() => sentenceDetails(text), [text]);
  return (
    <Panel title="Sentence analysis">
      <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
        <dt className="text-fg-muted">Average length</dt>
        <dd className="font-mono">{d.avgWords.toFixed(1)} words</dd>
        <dt className="text-fg-muted">Long (25+ words)</dt>
        <dd className="font-mono">{d.longSentences}</dd>
      </dl>
      {d.longest ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="text-fg-muted">Longest ({d.longest.words} words): </span>
            <span className="text-fg">{d.longest.text}</span>
          </p>
          {d.shortest && d.count > 1 ? (
            <p>
              <span className="text-fg-muted">Shortest ({d.shortest.words} words): </span>
              <span className="text-fg">{d.shortest.text}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-fg-subtle">Sentences end at . ! ? or … followed by a space.</p>
      )}
    </Panel>
  );
}

function ParagraphPanel({ text }: { text: string }) {
  const d = useMemo(() => paragraphDetails(text), [text]);
  const max = Math.max(1, ...d.perParagraph);
  return (
    <Panel title="Paragraph analysis">
      <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
        <dt className="text-fg-muted">Words per paragraph</dt>
        <dd className="font-mono">{d.avgWords.toFixed(1)}</dd>
        <dt className="text-fg-muted">Sentences per paragraph</dt>
        <dd className="font-mono">{d.avgSentences.toFixed(1)}</dd>
        <dt className="text-fg-muted">Longest</dt>
        <dd className="font-mono">{d.longestWords} words</dd>
        <dt className="text-fg-muted">Shortest</dt>
        <dd className="font-mono">{d.shortestWords} words</dd>
      </dl>
      {d.perParagraph.length > 1 ? (
        <ol className="mt-3 space-y-1 text-xs" aria-label="Words in each paragraph">
          {d.perParagraph.slice(0, 50).map((n, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right font-mono text-fg-subtle">{i + 1}</span>
              <span className="h-2 rounded-full bg-accent" style={{ width: `${(n / max) * 70}%` }} />
              <span className="font-mono text-fg-muted">{n}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="mt-3 text-xs text-fg-subtle">A paragraph is a block of text separated by at least one empty line.</p>
    </Panel>
  );
}
