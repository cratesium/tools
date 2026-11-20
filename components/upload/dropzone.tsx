"use client";

import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Upload, X, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format";

export interface DropzoneProps {
  /** Called with validated files. */
  onFiles: (files: File[]) => void;
  /** HTML accept string, e.g. ".pdf,application/pdf" or "image/*". */
  accept?: string;
  multiple?: boolean;
  /** Max size per file in bytes. */
  maxSize?: number;
  /** Human label for supported formats, e.g. "PDF". */
  formatsLabel?: string;
  disabled?: boolean;
  /** Allow choosing a folder (webkitdirectory). */
  directory?: boolean;
  children?: ReactNode;
  className?: string;
  onError?: (message: string) => void;
}

/** Returns true if the file matches an HTML accept string. Exported for tests. */
export function matchesAccept(file: { name: string; type: string }, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

/** Validates files against accept/maxSize. Exported for tests. */
export function validateFiles(
  files: File[],
  { accept, maxSize, multiple = false }: { accept?: string; maxSize?: number; multiple?: boolean },
): { valid: File[]; errors: string[] } {
  const errors: string[] = [];
  const list = multiple ? files : files.slice(0, 1);
  const valid = list.filter((f) => {
    if (!matchesAccept(f, accept)) {
      errors.push(`"${f.name}" is not a supported file type.`);
      return false;
    }
    if (maxSize && f.size > maxSize) {
      errors.push(`"${f.name}" is ${formatBytes(f.size)}, above the ${formatBytes(maxSize)} limit.`);
      return false;
    }
    if (f.size === 0) {
      errors.push(`"${f.name}" is empty.`);
      return false;
    }
    return true;
  });
  return { valid, errors };
}

export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  maxSize,
  formatsLabel,
  disabled,
  directory,
  children,
  className,
  onError,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = useId();

  const handle = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const { valid, errors } = validateFiles(Array.from(list), { accept, maxSize, multiple });
      const msg = errors.length ? errors.join(" ") : null;
      setErr(msg);
      if (msg) onError?.(msg);
      if (valid.length) onFiles(valid);
    },
    [accept, maxSize, multiple, onFiles, onError],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    handle(e.dataTransfer.files);
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={`${id}-hint`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
          over ? "border-fg bg-bg-muted" : "border-border-strong bg-bg-subtle hover:bg-bg-muted",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-xs">
          <Upload className="h-4 w-4 text-fg-muted" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-medium text-fg">
            {children ?? (
              <>
                Drop {directory ? "a folder" : multiple ? "files" : "a file"} here or <span className="underline underline-offset-4">browse</span>
              </>
            )}
          </p>
          <p id={`${id}-hint`} className="mt-1 text-xs text-fg-subtle">
            {formatsLabel ? `${formatsLabel}` : "Any file"}
            {maxSize ? ` · up to ${formatBytes(maxSize)}` : ""} · processed on your device
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={accept}
          multiple={multiple || directory}
          aria-label="Choose file"
          data-testid="file-input"
          {...(directory ? { webkitdirectory: "", directory: "" } : {})}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {err ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

/** Compact list of selected files with remove buttons. */
export function FileList({
  files,
  onRemove,
  onClear,
}: {
  files: File[];
  onRemove?: (index: number) => void;
  onClear?: () => void;
}) {
  if (!files.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-fg-muted">
        <span>
          {files.length} file{files.length > 1 ? "s" : ""} · {formatBytes(files.reduce((s, f) => s + f.size, 0))}
        </span>
        {onClear ? (
          <button type="button" onClick={onClear} className="hover:text-fg">
            Clear all
          </button>
        ) : null}
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-auto">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
            <FileIcon className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg" title={f.name}>
              {f.webkitRelativePath || f.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-fg-subtle">{formatBytes(f.size)}</span>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"
                aria-label={`Remove ${f.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
