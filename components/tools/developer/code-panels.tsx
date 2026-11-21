"use client";

/**
 * Shared pieces for the paste-in code tools (formatters, validators, converters):
 * a code input panel with file loading and sample text, an error banner that can
 * jump to the reported line/column, and a debounced async "live" runner.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { FileUp, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Panel } from "@/components/tools/shared";
import { errorMessage, useDebounced } from "@/lib/utils/hooks";

export interface Located {
  message: string;
  line?: number;
  column?: number;
}

/** Normalises any thrown error into message + optional 1-based line/column. */
export function toLocated(e: unknown): Located {
  const x = e as { reason?: string; line?: number; column?: number; message?: string };
  if (x && typeof x === "object" && typeof x.line === "number") {
    const msg = (x.reason ?? x.message ?? "Error").replace(/ \(line \d+, column \d+\)$/, "");
    return { message: msg, line: x.line, column: x.column };
  }
  return { message: errorMessage(e) };
}

/** Selects the character at line/column in a textarea and scrolls it into view. */
export function selectLineColumn(el: HTMLTextAreaElement | null, line: number, column = 1) {
  if (!el) return;
  const lines = el.value.split("\n");
  let pos = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
  const lineLen = lines[Math.min(line - 1, lines.length - 1)]?.length ?? 0;
  pos += Math.max(0, Math.min(column - 1, lineLen));
  el.focus();
  el.setSelectionRange(pos, Math.min(pos + 1, el.value.length));
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  el.scrollTop = Math.max(0, (line - 3) * lh);
}

export function LocatedError({
  error,
  inputRef,
  title = "Invalid input",
}: {
  error: Located | null;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  title?: string;
}) {
  if (!error) return null;
  const where = error.line ? `Line ${error.line}${error.column ? `, column ${error.column}` : ""}: ` : "";
  return (
    <Alert tone="danger" title={title}>
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="error" className="font-mono text-[13px]">
          {where}
          {error.message}
        </span>
        {error.line && inputRef ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<LocateFixed className="h-3.5 w-3.5" />}
            onClick={() => selectLineColumn(inputRef.current, error.line!, error.column)}
          >
            Go to error
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

export function CodeInput({
  value,
  onChange,
  label = "Input",
  placeholder,
  sample,
  accept,
  inputRef,
  actions,
  className = "min-h-[280px]",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: ReactNode;
  placeholder?: string;
  sample?: string;
  accept?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  actions?: ReactNode;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  return (
    <Panel
      title={label}
      actions={
        <>
          {actions}
          {sample ? (
            <Button size="sm" variant="ghost" onClick={() => onChange(sample)}>
              Sample
            </Button>
          ) : null}
          {accept ? (
            <>
              <Button size="sm" variant="secondary" icon={<FileUp className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
                Open file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                className="hidden"
                data-testid="file-input"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  if (f.size > 20 * 1024 * 1024) {
                    setFileError("File is larger than 20 MB; paste a smaller excerpt instead.");
                    return;
                  }
                  setFileError(null);
                  onChange(await f.text());
                }}
              />
            </>
          ) : null}
        </>
      }
    >
      <Textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Input"
        data-testid="input"
        className={className}
      />
      {fileError ? <p className="mt-2 text-xs text-danger">{fileError}</p> : null}
    </Panel>
  );
}

/**
 * Runs an async transform whenever `input`/`deps` change (debounced). Results from
 * stale runs are discarded. Empty input clears the result.
 */
export function useLiveAsync<T>(input: string, fn: (input: string) => Promise<T>, deps: unknown[], ms = 250) {
  const debounced = useDebounced(input, ms);
  const key = JSON.stringify([debounced, ...deps]);
  const [state, setState] = useState<{ key: string; result: T | null; error: Located | null }>({ key: "", result: null, error: null });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!debounced.trim()) return;
    let alive = true;
    fnRef
      .current(debounced)
      .then((r) => alive && setState({ key, result: r, error: null }))
      .catch((e) => alive && setState({ key, result: null, error: toLocated(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!debounced.trim()) return { result: null as T | null, error: null as Located | null, busy: false };
  return { result: state.result, error: state.error, busy: state.key !== key };
}

export function Stats({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt>{k}</dt>
          <dd className="font-mono text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function sizeOf(s: string): number {
  return new TextEncoder().encode(s).length;
}
