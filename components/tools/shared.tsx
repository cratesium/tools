"use client";

/**
 * Shared building blocks for tool UIs. Every tool composes these so that pages
 * look and behave consistently: input → settings → action → progress → result
 * (preview + download) → reset.
 */

import { useState, type ReactNode } from "react";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Progress } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";
import { downloadBlob, downloadText } from "@/lib/utils/download";
import { formatBytes } from "@/lib/utils/format";
import { useObjectUrl } from "@/lib/utils/hooks";

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {title || actions ? (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          {title ? <h3 className="text-[13px] font-medium text-fg">{title}</h3> : <span />}
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Responsive settings grid. */
export function Settings({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}

/** Primary action + reset, with consistent placement. */
export function ActionBar({
  onRun,
  runLabel = "Process",
  running,
  disabled,
  onReset,
  onCancel,
  children,
}: {
  onRun?: () => void;
  runLabel?: string;
  running?: boolean;
  disabled?: boolean;
  onReset?: () => void;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onRun ? (
        <Button onClick={onRun} loading={running} disabled={disabled} size="lg" data-testid="run">
          {runLabel}
        </Button>
      ) : null}
      {running && onCancel ? (
        <Button variant="secondary" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      {children}
      {onReset ? (
        <Button variant="ghost" size="lg" onClick={onReset} icon={<RotateCcw className="h-4 w-4" />} data-testid="reset">
          Reset
        </Button>
      ) : null}
    </div>
  );
}

export function TaskProgress({ running, progress, label }: { running: boolean; progress: number | null; label?: string }) {
  if (!running) return null;
  return <Progress value={progress} label={label} />;
}

export function ErrorMessage({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <Alert tone="danger" title="Something went wrong">
      <span data-testid="error">{error}</span>
    </Alert>
  );
}

export function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size={size}
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable (insecure context or denied) */
        }
      }}
      icon={done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

export function DownloadButton({
  blob,
  text,
  filename,
  mime,
  label = "Download",
  size = "md",
  variant = "primary",
}: {
  blob?: Blob | null;
  text?: string;
  filename: string;
  mime?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}) {
  const disabled = !blob && !text;
  return (
    <Button
      size={size}
      variant={variant}
      disabled={disabled}
      data-testid="download"
      icon={<Download className="h-4 w-4" />}
      onClick={() => {
        if (blob) downloadBlob(blob, filename);
        else if (text != null) downloadText(text, filename, mime);
      }}
    >
      {label}
    </Button>
  );
}

/** Read-only text output with copy + download. */
export function TextOutput({
  value,
  filename = "output.txt",
  mime,
  label = "Result",
  rows,
  className,
  extraActions,
}: {
  value: string;
  filename?: string;
  mime?: string;
  label?: ReactNode;
  rows?: number;
  className?: string;
  extraActions?: ReactNode;
}) {
  return (
    <Panel
      title={label}
      className={className}
      actions={
        <>
          {extraActions}
          <CopyButton text={value} />
          <DownloadButton text={value} filename={filename} mime={mime} size="sm" variant="secondary" />
        </>
      }
    >
      <textarea
        readOnly
        value={value}
        rows={rows}
        aria-label="Output"
        data-testid="output"
        spellCheck={false}
        className="min-h-[180px] w-full resize-y rounded-lg border border-border bg-bg-subtle px-3 py-2.5 font-mono text-[13px] leading-relaxed text-fg focus:outline-none"
      />
    </Panel>
  );
}

/** Preview + metadata + download for a generated file. Revokes its object URL automatically. */
export function FileResult({
  blob,
  filename,
  originalSize,
  label = "Result",
  preview = true,
  children,
}: {
  blob: Blob;
  filename: string;
  originalSize?: number;
  label?: ReactNode;
  preview?: boolean;
  children?: ReactNode;
}) {
  const url = useObjectUrl(blob);
  const type = blob.type;
  const delta = originalSize ? ((blob.size - originalSize) / originalSize) * 100 : null;
  return (
    <Panel
      title={label}
      actions={<DownloadButton blob={blob} filename={filename} size="sm" />}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span className="truncate font-medium text-fg" data-testid="result-filename">
            {filename}
          </span>
          <span className="font-mono">{formatBytes(blob.size)}</span>
          {delta != null ? (
            <span className={cn("font-mono", delta < 0 ? "text-success" : "text-fg-subtle")}>
              {delta < 0 ? "−" : "+"}
              {Math.abs(delta).toFixed(1)}% vs original
            </span>
          ) : null}
        </div>
        {preview && url ? <BlobPreview url={url} type={type} name={filename} /> : null}
        {children}
      </div>
    </Panel>
  );
}

export function BlobPreview({ url, type, name }: { url: string; type: string; name: string }) {
  if (type.startsWith("image/"))
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <div className="checkerboard flex max-h-[480px] justify-center overflow-auto rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Preview of ${name}`} className="max-h-[480px] max-w-full object-contain" />
      </div>
    );
  if (type.startsWith("video/"))
    return <video src={url} controls className="max-h-[480px] w-full rounded-lg border border-border bg-black" />;
  if (type.startsWith("audio/")) return <audio src={url} controls className="w-full" />;
  if (type === "application/pdf")
    return <iframe src={url} title={`Preview of ${name}`} className="h-[520px] w-full rounded-lg border border-border bg-white" />;
  return null;
}

/** Multiple generated files, each downloadable, plus optional "download all as ZIP". */
export function FileResults({
  files,
  zipName = "results.zip",
  label = "Results",
}: {
  files: { blob: Blob; name: string }[];
  zipName?: string;
  label?: ReactNode;
}) {
  const [zipping, setZipping] = useState(false);
  return (
    <Panel
      title={
        <>
          {label} <span className="text-fg-subtle">({files.length})</span>
        </>
      }
      actions={
        files.length > 1 ? (
          <Button
            size="sm"
            loading={zipping}
            icon={<Download className="h-3.5 w-3.5" />}
            data-testid="download-all"
            onClick={async () => {
              setZipping(true);
              try {
                const { zipSync } = await import("fflate");
                const entries: Record<string, Uint8Array> = {};
                const used = new Set<string>();
                for (const f of files) {
                  let n = f.name;
                  let k = 1;
                  while (used.has(n)) n = f.name.replace(/(\.[^.]*)?$/, (m) => `-${k++}${m}`);
                  used.add(n);
                  entries[n] = new Uint8Array(await f.blob.arrayBuffer());
                }
                const zipped = zipSync(entries, { level: 0 });
                downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), zipName);
              } finally {
                setZipping(false);
              }
            }}
          >
            Download all (ZIP)
          </Button>
        ) : null
      }
    >
      <ul className="divide-y divide-border">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate" title={f.name}>
              {f.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-fg-subtle">{formatBytes(f.blob.size)}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => downloadBlob(f.blob, f.name)}
              icon={<Download className="h-3.5 w-3.5" />}
              aria-label={`Download ${f.name}`}
            >
              <span className="hidden sm:inline">Download</span>
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Notice for missing browser capabilities. */
export function UnsupportedNotice({ feature, children }: { feature: string; children?: ReactNode }) {
  return (
    <Alert tone="warning" title={`${feature} is not supported in this browser`}>
      {children ?? "Try a recent version of Chrome, Edge, Firefox or Safari."}
    </Alert>
  );
}

/** Key/value table for metadata and analysis results. */
export function KeyValueTable({ rows, empty = "No data" }: { rows: [string, ReactNode][]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-fg-subtle">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {rows.map(([k, v], i) => (
            <tr key={`${k}-${i}`} className="align-top">
              <th scope="row" className="w-1/3 bg-bg-subtle px-3 py-2 text-left font-medium text-fg-muted">
                {k}
              </th>
              <td className="px-3 py-2 font-mono text-[13px] break-all text-fg">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Generic data table (rows of cells) with sticky header. */
export function DataTable({ headers, rows, max = 500 }: { headers: string[]; rows: (string | number | null)[][]; max?: number }) {
  const shown = rows.slice(0, max);
  return (
    <div className="space-y-2">
      <div className="max-h-[480px] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-bg-muted">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border-b border-border px-3 py-2 text-left font-medium whitespace-nowrap text-fg">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="even:bg-bg-subtle">
                {headers.map((_, j) => (
                  <td key={j} className="border-b border-border px-3 py-1.5 whitespace-nowrap text-fg-muted">
                    {r[j] == null ? "" : String(r[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > max ? (
        <p className="text-xs text-fg-subtle">
          Showing first {max} of {rows.length} rows. The download includes every row.
        </p>
      ) : null}
    </div>
  );
}
