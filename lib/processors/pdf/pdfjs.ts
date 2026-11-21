/**
 * Browser-side PDF.js helpers (rendering, text). pdfjs-dist touches DOM globals when it is
 * imported, so it is only ever imported inside these functions.
 */
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { PdfPasswordError } from "./load";

export type { PDFDocumentProxy, PDFPageProxy };

export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

/** Opens a document with PDF.js. The bytes are copied because PDF.js transfers its buffer to the worker. */
export async function openPdfjs(data: ArrayBuffer | Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  const task = pdfjs.getDocument({
    data: bytes,
    password: password || undefined,
    cMapUrl: "/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
  });
  try {
    return await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === "PasswordException") throw new PdfPasswordError(err.code === 2);
    if (err?.name === "InvalidPDFException") throw new Error("This file is not a valid PDF or is too damaged to open.");
    throw e;
  }
}

/** Largest canvas we create: stays under the strictest browser limits (iOS Safari ≈16.7 MP). */
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 8192;

export function clampScale(width: number, height: number, scale: number): number {
  let s = scale;
  if (width * s > MAX_SIDE) s = MAX_SIDE / width;
  if (height * s > MAX_SIDE) s = Math.min(s, MAX_SIDE / height);
  if (width * height * s * s > MAX_PIXELS) s = Math.min(s, Math.sqrt(MAX_PIXELS / (width * height)));
  return s;
}

/** Renders a page to a new canvas at the given scale (1 = 72 dpi). */
export async function renderPage(
  page: PDFPageProxy,
  scale: number,
  { background = "#ffffff", rotation }: { background?: string; rotation?: number } = {},
): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1, rotation });
  const s = clampScale(base.width, base.height, scale);
  const viewport = page.getViewport({ scale: s, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport, background }).promise;
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not encode the image."))), type, quality),
  );
}

export async function canvasToBytes(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToBlob(canvas, type, quality)).arrayBuffer());
}

/** Releases a canvas' backing store early (helps Safari with many pages). */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
