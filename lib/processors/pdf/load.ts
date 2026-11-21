/**
 * Loading helpers for pdf-lib. We use the @cantoo/pdf-lib fork everywhere because it can
 * decrypt (with the password) and encrypt documents, and otherwise matches the pdf-lib API.
 * The library is always imported lazily.
 */
import type { PDFDocument as PDFDocumentType } from "@cantoo/pdf-lib";

export type PdfLib = typeof import("@cantoo/pdf-lib");
export type PdfDoc = PDFDocumentType;

export function pdfLib(): Promise<PdfLib> {
  return import("@cantoo/pdf-lib");
}

/** Thrown when a document needs a password (or the given one is wrong). */
export class PdfPasswordError extends Error {
  readonly incorrect: boolean;
  constructor(incorrect: boolean) {
    super(
      incorrect
        ? "The password is incorrect. Enter the document's open password and try again."
        : "This PDF is password-protected. Enter its password to continue.",
    );
    this.name = "PdfPasswordError";
    this.incorrect = incorrect;
  }
}

export function isPdfPasswordError(e: unknown): e is PdfPasswordError {
  return e instanceof Error && e.name === "PdfPasswordError";
}

export interface LoadPdfOptions {
  password?: string;
  /** Keep going past broken objects (used by Repair PDF). */
  lenient?: boolean;
}

export function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Quick signature check so users get a clear error for non-PDF files. */
export function assertPdfHeader(bytes: Uint8Array): void {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) throw new Error("This file does not look like a PDF (no %PDF header found).");
}

/**
 * Loads a PDF with pdf-lib. Encrypted files open with the given password; files that only
 * have an owner password (permission restrictions, empty open password) open without one.
 */
export async function loadPdf(data: ArrayBuffer | Uint8Array, opts: LoadPdfOptions = {}): Promise<PdfDoc> {
  const bytes = toBytes(data);
  assertPdfHeader(bytes);
  const { PDFDocument } = await pdfLib();
  const base = {
    updateMetadata: false,
    throwOnInvalidObject: !opts.lenient,
    ignoreEncryption: false,
  };
  const attempt = (password?: string) => PDFDocument.load(bytes, password === undefined ? base : { ...base, password });
  try {
    return await attempt(opts.password || undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/password incorrect/i.test(msg)) throw new PdfPasswordError(true);
    if (/encrypted/i.test(msg)) {
      if (!opts.password) {
        try {
          return await attempt("");
        } catch (e2) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          if (/password|encrypted/i.test(m2)) throw new PdfPasswordError(false);
          throw e2;
        }
      }
      throw new PdfPasswordError(true);
    }
    throw new Error(`Could not read this PDF: ${msg}`);
  }
}

export async function savePdf(doc: PdfDoc, opts: { objectStreams?: boolean } = {}): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: opts.objectStreams ?? true });
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
