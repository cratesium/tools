"use client";

import type { ReactNode } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";

/** Parses a user-typed number, accepting thousands separators and spaces. Empty → NaN. */
export function num(s: string): number {
  const t = s.replace(/[,\s_]/g, "");
  if (t === "" || t === "-" || t === ".") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function NumField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  hint,
  placeholder,
  error,
  testId,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  prefix?: string;
  hint?: ReactNode;
  placeholder?: string;
  error?: string | null;
  testId?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <div className="relative">
          {prefix ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-fg-subtle">{prefix}</span> : null}
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
            className={cn("font-mono tabular-nums", prefix && "pl-7", suffix && "pr-12")}
          />
          {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-fg-subtle">{suffix}</span> : null}
        </div>
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  className,
}: {
  label: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function DateField({ label, value, onChange, testId }: { label: ReactNode; value: string; onChange: (v: string) => void; testId?: string }) {
  return (
    <Field label={label}>
      {(id) => <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} className="font-mono" />}
    </Field>
  );
}

/** Formats a plain number with up to `d` decimals. */
export function fmt(n: number, d = 2, indian = false): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(indian ? "en-IN" : "en-US", { maximumFractionDigits: d });
}

/** Fixed 2-decimal money formatting. */
export function money(n: number, indian = false, symbol = ""): string {
  if (!Number.isFinite(n)) return "—";
  return symbol + n.toLocaleString(indian ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const inr = (n: number, d = 0) =>
  Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

/** Small sentence-style result line used by the percentage calculators. */
export function ResultLine({ children, value, testId }: { children: ReactNode; value: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm">
      <span className="text-fg-muted">{children}</span>
      <span className="font-mono text-base font-semibold tabular-nums text-fg" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/** Simple horizontal proportion bar (e.g. principal vs interest). Neutral palette only. */
export function SplitBar({ parts }: { parts: { label: string; value: number; tone: "strong" | "muted" }[] }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (!(total > 0)) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-bg-muted" aria-hidden>
        {parts.map((p) => (
          <div key={p.label} className={p.tone === "strong" ? "bg-fg" : "bg-fg-subtle/50"} style={{ width: `${(Math.max(0, p.value) / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-fg-muted">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", p.tone === "strong" ? "bg-fg" : "bg-fg-subtle/50")} />
            {p.label}: {((Math.max(0, p.value) / total) * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}
