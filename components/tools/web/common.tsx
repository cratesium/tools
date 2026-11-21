"use client";

import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Alert, Badge } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";

/** URL / domain / IP entry with a submit button. Enter submits. */
export function QueryBar({
  placeholder,
  onSubmit,
  running,
  label = "Check",
  defaultValue = "",
  inputMode,
  children,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  running?: boolean;
  label?: string;
  defaultValue?: string;
  inputMode?: "url" | "text";
  children?: ReactNode;
}) {
  const [v, setV] = useState(defaultValue);
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSubmit(v.trim());
      }}
    >
      <div className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 shadow-xs focus-within:border-border-strong">
        <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid="input"
          inputMode={inputMode === "url" ? "url" : undefined}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-full border-0 bg-transparent px-0 shadow-none focus-visible:outline-none"
        />
      </div>
      {children}
      <Button type="submit" size="lg" loading={running} disabled={!v.trim()} data-testid="run">
        {label}
      </Button>
    </form>
  );
}

/** Maps API client errors to helpful notices (missing function, not configured, regular error). */
export function ApiErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as Error;
  if (e.name === "ApiUnavailableError")
    return (
      <Alert tone="warning" title="Server function not available here">
        {e.message} The page itself works; only the network request needs the deployed site.
      </Alert>
    );
  if (e.name === "ApiNotConfiguredError")
    return (
      <Alert tone="info" title="Not configured on this deployment">
        {e.message}
      </Alert>
    );
  return (
    <Alert tone="danger" title="Request failed">
      <span data-testid="error">{e.message || String(error)}</span>
    </Alert>
  );
}

export function StatusPill({ status }: { status: number | null }) {
  if (status == null) return <Badge className="text-danger">No response</Badge>;
  const cls = status < 300 ? "text-success" : status < 400 ? "text-info" : status < 500 ? "text-warning" : "text-danger";
  return <Badge className={cn("font-mono", cls)}>{status}</Badge>;
}

export function CheckIcon({ status }: { status: "pass" | "warn" | "fail" | "info" }) {
  const map = { pass: ["✓", "text-success"], warn: ["!", "text-warning"], fail: ["✗", "text-danger"], info: ["i", "text-info"] } as const;
  return <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold", map[status][1])}>{map[status][0]}</span>;
}

/** Runs an async API call keeping the raw error object (so ApiErrorNotice can classify it). */
export function useApi<T>() {
  const [state, setState] = useState<{ running: boolean; data: T | null; error: unknown }>({ running: false, data: null, error: null });
  const run = async (fn: () => Promise<T>) => {
    setState({ running: true, data: null, error: null });
    try {
      const data = await fn();
      setState({ running: false, data, error: null });
    } catch (error) {
      setState({ running: false, data: null, error });
    }
  };
  const reset = () => setState({ running: false, data: null, error: null });
  return { ...state, run, reset };
}
