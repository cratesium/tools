"use client";

import type { ReactNode } from "react";
import { Textarea } from "@/components/ui/field";
import { ActionBar, CopyButton, Panel, TextOutput } from "@/components/tools/shared";

/**
 * Standard live text transform layout: input → options → output → reset.
 * The transform runs during render (callers memoise), so there is no Run button.
 */
export function TransformLayout({
  input,
  onInput,
  placeholder = "Type or paste your text here…",
  options,
  output,
  outputLabel = "Result",
  filename = "output.txt",
  summary,
  onReset,
  inputLabel = "Input",
  extra,
}: {
  input: string;
  onInput: (v: string) => void;
  placeholder?: string;
  options?: ReactNode;
  output: string;
  outputLabel?: ReactNode;
  filename?: string;
  summary?: ReactNode;
  onReset: () => void;
  inputLabel?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {options ? <Panel title="Options">{options}</Panel> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={inputLabel} actions={<CopyButton text={input} />}>
          <Textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder={placeholder}
            aria-label="Text input"
            data-testid="input"
            className="min-h-[260px]"
          />
        </Panel>
        <TextOutput value={output} label={outputLabel} filename={filename} rows={12} className="[&_textarea]:min-h-[260px]" />
      </div>
      {summary ? <div className="text-sm text-fg-muted" aria-live="polite">{summary}</div> : null}
      {extra}
      <ActionBar onReset={onReset} />
    </div>
  );
}
