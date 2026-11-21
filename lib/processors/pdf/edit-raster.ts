/**
 * Browser-only: rebuilds a PDF from rendered page images (PDF.js → canvas → JPEG/PNG → pdf-lib).
 * Used by Compress (strong mode), Flatten (rasterize) and Repair (fallback). Text becomes
 * part of the image, so it is no longer selectable or searchable.
 */
import { pdfLib } from "./load";
import { canvasToBytes, releaseCanvas, renderPage, type PDFDocumentProxy } from "./pdfjs";

export interface RasterizeOptions {
  dpi: number;
  format: "jpeg" | "png";
  quality?: number;
  grayscale?: boolean;
  onProgress?: (fraction: number, label?: string) => void;
  signal?: AbortSignal;
}

export async function rasterizeToPdf(src: PDFDocumentProxy, opts: RasterizeOptions): Promise<{ bytes: Uint8Array; failedPages: number[] }> {
  const { PDFDocument } = await pdfLib();
  const out = await PDFDocument.create();
  const failedPages: number[] = [];
  for (let p = 1; p <= src.numPages; p++) {
    if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    opts.onProgress?.((p - 1) / src.numPages, `Rendering page ${p} of ${src.numPages}`);
    let size: [number, number] = [595.28, 841.89];
    try {
      const page = await src.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      size = [vp.width, vp.height];
      const canvas = await renderPage(page, opts.dpi / 72);
      if (opts.grayscale) {
        const g = canvas.getContext("2d")!;
        const id = g.getImageData(0, 0, canvas.width, canvas.height);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        g.putImageData(id, 0, 0);
      }
      const bytes = await canvasToBytes(canvas, opts.format === "png" ? "image/png" : "image/jpeg", opts.quality ?? 0.8);
      releaseCanvas(canvas);
      page.cleanup();
      const img = opts.format === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      out.addPage(size).drawImage(img, { x: 0, y: 0, width: size[0], height: size[1] });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      failedPages.push(p);
      out.addPage(size);
    }
  }
  opts.onProgress?.(1);
  return { bytes: await out.save({ useObjectStreams: true }), failedPages };
}
