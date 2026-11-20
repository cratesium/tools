"use client";

import { useMemo, useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Textarea } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, CopyButton, Panel } from "@/components/tools/shared";
import { textStats, wordFrequency } from "@/lib/processors/text/counters";
import { formatNumber } from "@/lib/utils/format";

/**
 * Reference implementation of a live text tool. Shared by word/character/sentence/paragraph
 * counters; processorOptions.focus decides which statistic is primary.
 */
export default function WordCounter({ tool }: ToolComponentProps) {
  const [text, setText] = useState("");
  const stats = useMemo(() => textStats(text), [text]);
  const freq = useMemo(() => wordFrequency(text, 8), [text]);
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
