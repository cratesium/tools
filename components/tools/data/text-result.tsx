"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { CopyButton, DownloadButton, Panel, TextOutput } from "@/components/tools/shared";
import { formatBytes } from "@/lib/utils/format";

const PREVIEW_LIMIT = 300_000;

/** TextOutput that stays responsive for very large results by previewing only the start. */
export function TextResult({
  value,
  filename,
  mime,
  label = "Result",
  extraActions,
}: {
  value: string;
  filename: string;
  mime: string;
  label?: ReactNode;
  extraActions?: ReactNode;
}) {
  if (value.length <= PREVIEW_LIMIT)
    return <TextOutput value={value} filename={filename} mime={mime} label={label} rows={14} extraActions={extraActions} />;
  const size = new Blob([value]).size;
  return (
    <Panel
      title={label}
      actions={
        <>
          {extraActions}
          <CopyButton text={value} />
          <DownloadButton text={value} filename={filename} mime={mime} size="sm" />
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="info">
          The result is {formatBytes(size)}; the preview shows the first {formatBytes(PREVIEW_LIMIT)}. Copy and Download include
          everything.
        </Alert>
        <textarea
          readOnly
          value={value.slice(0, PREVIEW_LIMIT)}
          rows={14}
          aria-label="Output preview"
          data-testid="output"
          spellCheck={false}
          className="min-h-[180px] w-full resize-y rounded-lg border border-border bg-bg-subtle px-3 py-2.5 font-mono text-[13px] leading-relaxed text-fg focus:outline-none"
        />
      </div>
    </Panel>
  );
}
