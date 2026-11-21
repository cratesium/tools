"use client";

/**
 * Shared UI for PDF tools: a PDF picker that handles password-protected files, lazily rendered
 * page thumbnails, and a page grid with selection / rotation / reordering.
 * Heavy libraries (pdfjs-dist, pdf-lib) are imported lazily via lib/processors/pdf/*.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FileText, GripVertical, Lock, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Dropzone } from "@/components/upload/dropzone";
import { cn } from "@/lib/utils/cn";
import { errorMessage } from "@/lib/utils/hooks";
import { formatBytes } from "@/lib/utils/format";
import { isPdfPasswordError } from "@/lib/processors/pdf/load";
import type { PDFDocumentProxy } from "@/lib/processors/pdf/pdfjs";

export const PDF_ACCEPT = ".pdf,application/pdf";
export const MAX_PDF_SIZE = 200 * 1024 * 1024;

/** Destroys a PDF.js document (and its worker transport). */
export function closeDoc(doc: PDFDocumentProxy | null | undefined) {
  if (doc) void doc.loadingTask.destroy().catch(() => {});
}

export interface LoadedPdf {
  file: File;
  bytes: Uint8Array;
  /** Password the user entered (undefined when none was needed). */
  password?: string;
  doc: PDFDocumentProxy;
  pageCount: number;
}

/**
 * Loads a PDF with PDF.js for previews/page count and keeps the raw bytes for pdf-lib.
 * Prompts for a password when the file is encrypted.
 */
export function usePdfLoader() {
  const [pending, setPending] = useState<{ file: File; bytes: Uint8Array } | null>(null);
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const seq = useRef(0);

  useEffect(() => () => closeDoc(docRef.current), []);

  const open = useCallback(async (file: File, bytes: Uint8Array, password?: string) => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const { openPdfjs } = await import("@/lib/processors/pdf/pdfjs");
      const doc = await openPdfjs(bytes, password);
      if (id !== seq.current) {
        closeDoc(doc);
        return;
      }
      closeDoc(docRef.current);
      docRef.current = doc;
      setLoaded({ file, bytes, password, doc, pageCount: doc.numPages });
      setPending(null);
      setNeedsPassword(false);
    } catch (e) {
      if (id !== seq.current) return;
      if (isPdfPasswordError(e)) {
        setPending({ file, bytes });
        setNeedsPassword(true);
        setError(e.incorrect && password ? e.message : null);
      } else setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  const load = useCallback(
    async (file: File) => {
      setLoaded(null);
      closeDoc(docRef.current);
      docRef.current = null;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await open(file, bytes);
    },
    [open],
  );

  const submitPassword = useCallback(
    (pw: string) => {
      if (pending) void open(pending.file, pending.bytes, pw);
    },
    [open, pending],
  );

  const reset = useCallback(() => {
    seq.current++;
    closeDoc(docRef.current);
    docRef.current = null;
    setLoaded(null);
    setPending(null);
    setNeedsPassword(false);
    setError(null);
    setLoading(false);
  }, []);

  return { loaded, loading, error, needsPassword, pendingFile: pending?.file ?? null, load, submitPassword, reset };
}

export type PdfLoader = ReturnType<typeof usePdfLoader>;

export function PasswordPrompt({
  fileName,
  onSubmit,
  loading,
  label = "Open password",
}: {
  fileName?: string;
  onSubmit: (pw: string) => void;
  loading?: boolean;
  label?: string;
}) {
  const [pw, setPw] = useState("");
  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(pw);
      }}
    >
      <div className="flex items-center gap-2 text-sm text-fg">
        <Lock className="h-4 w-4 text-fg-muted" aria-hidden />
        <span>
          {fileName ? <strong className="font-medium">{fileName}</strong> : "This PDF"} is password-protected.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={label} className="min-w-[220px] flex-1">
          {(id) => (
            <Input id={id} type="password" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="password" />
          )}
        </Field>
        <Button type="submit" loading={loading} disabled={!pw}>
          Open
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">The password is only used in your browser to decrypt the file. It is never sent anywhere.</p>
    </form>
  );
}

/** Dropzone → (password prompt) → compact file bar with page count. */
export function PdfPicker({ loader, hint, children }: { loader: PdfLoader; hint?: string; children?: ReactNode }) {
  const { loaded, loading, error, needsPassword, pendingFile, load, submitPassword, reset } = loader;
  if (loaded)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-fg" title={loaded.file.name}>
          {loaded.file.name}
        </span>
        <span className="font-mono text-xs text-fg-subtle">
          {loaded.pageCount} page{loaded.pageCount === 1 ? "" : "s"} · {formatBytes(loaded.file.size)}
          {loaded.password ? " · decrypted" : ""}
        </span>
        {children}
        <Button size="sm" variant="ghost" onClick={reset} icon={<X className="h-3.5 w-3.5" />}>
          Change file
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      {needsPassword ? (
        <PasswordPrompt fileName={pendingFile?.name} onSubmit={submitPassword} loading={loading} />
      ) : (
        <Dropzone
          accept={PDF_ACCEPT}
          maxSize={MAX_PDF_SIZE}
          formatsLabel={hint ?? "PDF"}
          disabled={loading}
          onFiles={(f) => void load(f[0])}
        />
      )}
      {loading && !needsPassword ? <p className="text-xs text-fg-muted">Opening PDF…</p> : null}
      {error ? (
        <Alert tone="danger">
          <span data-testid="error">{error}</span>
        </Alert>
      ) : null}
    </div>
  );
}

/** Lazily renders one page of a PDF.js document into a canvas when it scrolls into view. */
export function PageThumbnail({
  doc,
  pageNumber,
  width = 150,
  rotation = 0,
  className,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width?: number;
  rotation?: number;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (very old browsers) render immediately.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [aspect, setAspect] = useState(1.414);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;
    (async () => {
      try {
        const { renderPage } = await import("@/lib/processors/pdf/pdfjs");
        const page = await doc.getPage(pageNumber);
        const vp = page.getViewport({ scale: 1 });
        const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
        canvas = await renderPage(page, (width * dpr) / vp.width);
        if (cancelled || !holder.current) return;
        setAspect(vp.height / vp.width);
        canvas.className = "block h-auto w-full";
        canvas.setAttribute("aria-hidden", "true");
        holder.current.replaceChildren(canvas);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, doc, pageNumber, width]);

  return (
    <div
      className={cn("flex items-center justify-center overflow-hidden", className)}
      style={{ width, height: Math.round(width * Math.max(aspect, 1 / aspect)) }}
    >
      <div
        ref={holder}
        className="border border-border bg-white shadow-xs transition-transform"
        style={{
          width: rotation % 180 ? Math.round(width / Math.max(aspect, 1)) : width,
          minHeight: 20,
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
        }}
      >
        {failed ? <span className="block p-2 text-[11px] text-fg-subtle">Preview unavailable</span> : null}
      </div>
    </div>
  );
}

export interface GridItem {
  key: string;
  /** 1-based page number within its source document. */
  pageNumber: number;
  doc: PDFDocumentProxy;
  rotation?: number;
  label?: string;
}

/**
 * Responsive grid of page thumbnails. Supports click-to-select, per-page rotation,
 * drag-and-drop reordering and keyboard-accessible move buttons.
 */
export function PageGrid({
  items,
  selected,
  onToggle,
  onRotate,
  onMove,
  onRemove,
  thumbWidth = 132,
  dimUnselected = false,
  markSelected = "check",
}: {
  items: GridItem[];
  selected?: Set<string>;
  onToggle?: (key: string, shift: boolean) => void;
  onRotate?: (key: string) => void;
  onMove?: (from: number, to: number) => void;
  onRemove?: (key: string) => void;
  thumbWidth?: number;
  dimUnselected?: boolean;
  markSelected?: "check" | "cross";
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  return (
    <ul className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbWidth + 24}px, 1fr))` }} data-testid="page-grid">
      {items.map((it, i) => {
        const isSel = selected?.has(it.key) ?? false;
        return (
          <li
            key={it.key}
            draggable={!!onMove}
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) onMove?.(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 rounded-lg border bg-bg-subtle p-2 transition-colors",
              isSel ? (markSelected === "cross" ? "border-danger" : "border-fg") : "border-border",
              dragOver === i && "border-dashed border-fg",
              dimUnselected && !isSel && "opacity-50",
              dragFrom === i && "opacity-40",
            )}
          >
            <button
              type="button"
              className={cn("block rounded", onToggle ? "cursor-pointer" : "cursor-default")}
              onClick={(e) => onToggle?.(it.key, e.shiftKey)}
              aria-pressed={onToggle ? isSel : undefined}
              aria-label={`Page ${it.label ?? it.pageNumber}${isSel ? " (selected)" : ""}`}
            >
              <PageThumbnail doc={it.doc} pageNumber={it.pageNumber} width={thumbWidth} rotation={it.rotation} />
            </button>
            {isSel ? (
              <span
                className={cn(
                  "absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                  markSelected === "cross" ? "bg-danger text-white" : "bg-accent text-accent-fg",
                )}
                aria-hidden
              >
                {markSelected === "cross" ? "×" : "✓"}
              </span>
            ) : null}
            <div className="flex w-full items-center justify-between gap-1 text-[11px] text-fg-muted">
              {onMove ? <GripVertical className="h-3.5 w-3.5 cursor-grab text-fg-subtle" aria-hidden /> : <span />}
              <span className="font-mono">{it.label ?? it.pageNumber}</span>
              <span className="flex items-center">
                {onMove ? (
                  <>
                    <IconBtn label="Move earlier" disabled={i === 0} onClick={() => onMove(i, i - 1)}>
                      <ArrowUp className="h-3.5 w-3.5 -rotate-90 sm:rotate-0" />
                    </IconBtn>
                    <IconBtn label="Move later" disabled={i === items.length - 1} onClick={() => onMove(i, i + 1)}>
                      <ArrowDown className="h-3.5 w-3.5 -rotate-90 sm:rotate-0" />
                    </IconBtn>
                  </>
                ) : null}
                {onRotate ? (
                  <IconBtn label="Rotate 90° clockwise" onClick={() => onRotate(it.key)}>
                    <RotateCw className="h-3.5 w-3.5" />
                  </IconBtn>
                ) : null}
                {onRemove ? (
                  <IconBtn label="Remove page" onClick={() => onRemove(it.key)}>
                    <X className="h-3.5 w-3.5" />
                  </IconBtn>
                ) : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, x);
  return next;
}

/** Output filename helper: "report.pdf" + "-merged" → "report-merged.pdf". */
export function outName(input: string | undefined, suffix: string, ext = "pdf"): string {
  const base = (input ?? "document").replace(/\.[^.]+$/, "") || "document";
  return `${base}${suffix}.${ext}`;
}

/** Shows how much an output changed versus the input. */
export function SizeDelta({ before, after }: { before: number; after: number }) {
  const pct = before ? ((after - before) / before) * 100 : 0;
  return (
    <span className={cn("font-mono", pct < 0 ? "text-success" : "text-warning")}>
      {formatBytes(before)} → {formatBytes(after)} ({pct < 0 ? "−" : "+"}
      {Math.abs(pct).toFixed(1)}%)
    </span>
  );
}
