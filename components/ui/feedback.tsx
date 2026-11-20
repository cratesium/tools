import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ImplementationStatus } from "@/types/tool";

type Tone = "info" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  info: "bg-info-bg text-info border-info/20",
  success: "bg-success-bg text-success border-success/20",
  warning: "bg-warning-bg text-warning border-warning/25",
  danger: "bg-danger-bg text-danger border-danger/20",
};

const toneIcon: Record<Tone, ReactNode> = {
  info: <Info className="h-4 w-4 shrink-0" aria-hidden />,
  success: <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />,
  warning: <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />,
  danger: <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />,
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm", toneClass[tone], className)}
    >
      <span className="mt-0.5">{toneIcon[tone]}</span>
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="break-words opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-bg-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusLabel: Record<ImplementationStatus, string> = {
  full: "Ready",
  partial: "Limited",
  api: "Server",
  planned: "Planned",
};

const statusClass: Record<ImplementationStatus, string> = {
  full: "",
  partial: "text-warning",
  api: "text-info",
  planned: "text-fg-subtle border-dashed bg-transparent",
};

export function StatusBadge({ status, className }: { status: ImplementationStatus; className?: string }) {
  if (status === "full") return null;
  return <Badge className={cn(statusClass[status], className)}>{statusLabel[status]}</Badge>;
}

/** Real, determinate progress (0–1). Pass null for indeterminate (unknown duration). */
export function Progress({ value, label }: { value: number | null; label?: string }) {
  const pct = value == null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-fg-muted">
        <span>{label ?? "Processing…"}</span>
        {pct != null ? <span className="font-mono tabular-nums">{pct}%</span> : null}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted"
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        {pct != null ? (
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-[uh-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
        )}
      </div>
      <style>{`@keyframes uh-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tracking-tight tabular-nums text-fg break-all">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-border bg-card shadow-xs", className)}>{children}</div>;
}
