"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/feedback";
import { FileResult } from "@/components/tools/shared";
import type { TaskContext } from "@/lib/utils/hooks";
import type { PageText } from "@/lib/processors/pdf/text";
import type { LoadedPdf } from "./common";
import { SizeDelta } from "./common";

export const pdfBlob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: "application/pdf" });

/** Result panel for a generated PDF with size comparison and optional notes. */
export function PdfOutput({ bytes, name, original, label = "Result", children }: { bytes: Uint8Array; name: string; original?: number; label?: ReactNode; children?: ReactNode }) {
  return (
    <FileResult blob={pdfBlob(bytes)} filename={name} label={label}>
      {original ? (
        <p className="text-xs text-fg-muted">
          Size: <SizeDelta before={original} after={bytes.byteLength} />
        </p>
      ) : null}
      {children}
    </FileResult>
  );
}

/** Extracts text items for every page with real per-page progress. */
export async function extractAllText(loaded: LoadedPdf, ctx: TaskContext, weight = 1): Promise<PageText[]> {
  const { getAllPageText } = await import("@/lib/processors/pdf/text");
  return getAllPageText(loaded.doc, (d, t) => ctx.progress((d / t) * weight, `Reading text: page ${d} of ${t}`), ctx.signal);
}

/** Warn when a PDF has no extractable text (scanned) – suggests OCR. */
export function ScannedNotice({ pages }: { pages: PageText[] }) {
  const empty = pages.filter((p) => !p.items.some((i) => i.str.trim())).length;
  if (!empty) return null;
  return (
    <Alert tone="warning" title={empty === pages.length ? "No text layer found" : `${empty} page(s) have no text`}>
      These pages look scanned (images of text). Run <Link href="/tools/ocr-pdf" className="underline">OCR PDF</Link> first to make the text extractable.
    </Alert>
  );
}

export function ReplacedCharsNotice({ count }: { count: number }) {
  if (!count) return null;
  return (
    <Alert tone="info">
      {count} character{count === 1 ? "" : "s"} outside the standard PDF fonts (e.g. some symbols or non-Latin scripts) were replaced with “?”.
    </Alert>
  );
}

/** Parse "1-3,5" against a page count; empty → all pages. */
export async function pagesFrom(input: string, total: number): Promise<number[]> {
  if (!input.trim()) return Array.from({ length: total }, (_, i) => i + 1);
  const { parsePageRanges } = await import("@/lib/processors/pdf/ranges");
  const p = parsePageRanges(input, total);
  if (!p.length) throw new Error("The page selection doesn't include any existing page.");
  return p;
}
