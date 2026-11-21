/**
 * OCR PDF: render pages, recognise text with Tesseract.js, and build a searchable PDF (page image
 * with an invisible text layer). `buildSearchablePdf` is pure (pdf-lib only) and unit-tested;
 * `ocrPdf` runs in the browser.
 */
import { makeSanitizer } from "./layout";
import { pdfLib } from "./load";
import type { PDFDocumentProxy } from "./pdfjs";

export interface OcrWord {
  text: string;
  /** Pixel bbox in the rendered page image. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrPage {
  /** Page size in points. */
  width: number;
  height: number;
  /** Rendered image size in pixels (the coordinate space of the words). */
  imageWidth: number;
  imageHeight: number;
  image?: { data: Uint8Array; mime: "image/jpeg" | "image/png" };
  words: OcrWord[];
}

export const OCR_LANGUAGES: { code: string; label: string; latin: boolean }[] = [
  { code: "eng", label: "English", latin: true },
  { code: "deu", label: "German", latin: true },
  { code: "fra", label: "French", latin: true },
  { code: "spa", label: "Spanish", latin: true },
  { code: "ita", label: "Italian", latin: true },
  { code: "por", label: "Portuguese", latin: true },
  { code: "nld", label: "Dutch", latin: true },
  { code: "pol", label: "Polish", latin: true },
  { code: "tur", label: "Turkish", latin: true },
  { code: "rus", label: "Russian", latin: false },
  { code: "hin", label: "Hindi", latin: false },
  { code: "chi_sim", label: "Chinese (Simplified)", latin: false },
  { code: "jpn", label: "Japanese", latin: false },
  { code: "ara", label: "Arabic", latin: false },
];

/**
 * Builds a PDF where each page shows the scanned image and carries the recognised words as
 * invisible (render mode 3) text placed over their bounding boxes, so the text is selectable and
 * searchable. Words are horizontally scaled to match their box width.
 */
export async function buildSearchablePdf(pages: OcrPage[], { title }: { title?: string } = {}): Promise<{ bytes: Uint8Array; replacedChars: number }> {
  const lib = await pdfLib();
  const { PDFDocument, StandardFonts, beginText, endText, setFontAndSize, setTextRenderingMode, TextRenderingMode, setTextMatrix, setCharacterSqueeze, showText, pushGraphicsState, popGraphicsState } = lib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const san = makeSanitizer(new Set(font.getCharacterSet()));
  for (const p of pages) {
    const page = doc.addPage([p.width, p.height]);
    if (p.image) {
      const img = p.image.mime === "image/png" ? await doc.embedPng(p.image.data) : await doc.embedJpg(p.image.data);
      page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
    }
    if (!p.words.length) continue;
    const fontKey = page.node.newFontDictionary(font.name, font.ref);
    const sx = p.width / p.imageWidth;
    const sy = p.height / p.imageHeight;
    const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
    for (const w of p.words) {
      const text = san.sanitize(w.text).replace(/\s+/g, " ").trim();
      if (!text) continue;
      const boxW = (w.x1 - w.x0) * sx;
      const boxH = (w.y1 - w.y0) * sy;
      if (boxW <= 0 || boxH <= 0) continue;
      const size = Math.max(1, boxH * 0.9);
      const natural = font.widthOfTextAtSize(text, size);
      const squeeze = natural > 0 ? Math.max(1, Math.min(1000, (boxW / natural) * 100)) : 100;
      const baseline = p.height - w.y1 * sy + boxH * 0.18;
      ops.push(
        setFontAndSize(fontKey, size),
        setCharacterSqueeze(squeeze),
        setTextMatrix(1, 0, 0, 1, w.x0 * sx, baseline),
        showText(font.encodeText(text)),
      );
    }
    ops.push(endText(), popGraphicsState());
    page.pushOperators(...ops);
  }
  if (title) doc.setTitle(san.sanitize(title));
  doc.setProducer("UtilityHub OCR (Tesseract.js)");
  const bytes = await doc.save();
  return { bytes, replacedChars: san.count() };
}

export interface OcrOptions {
  lang: string;
  /** Render scale (1 = 72 dpi). 300 dpi ≈ 4.17. */
  scale: number;
  pages: number[];
  jpegQuality?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number, label: string) => void;
}

export interface OcrResult {
  pdf: Uint8Array;
  text: string;
  pages: number;
  words: number;
  meanConfidence: number;
  replacedChars: number;
}

/** Browser-only: renders, recognises and assembles the searchable PDF. */
export async function ocrPdf(doc: PDFDocumentProxy, opts: OcrOptions): Promise<OcrResult> {
  const { renderPage, canvasToBytes, releaseCanvas } = await import("./pdfjs");
  const Tesseract = await import("tesseract.js");
  const total = opts.pages.length;
  const report = (f: number, l: string) => opts.onProgress?.(Math.min(1, f), l);
  let currentPage = 0;
  report(0, "Downloading OCR engine and language data…");
  const worker = await Tesseract.createWorker(opts.lang, 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && total) report((currentPage + m.progress) / total, `Recognising page ${currentPage + 1} of ${total}`);
      else if (currentPage === 0 && typeof m.progress === "number" && m.status) report(0, `${m.status[0].toUpperCase()}${m.status.slice(1)}…`);
    },
  });
  const abort = () => void worker.terminate();
  opts.signal?.addEventListener("abort", abort);
  try {
    const out: OcrPage[] = [];
    const texts: string[] = [];
    let words = 0;
    let confSum = 0;
    for (const [i, n] of opts.pages.entries()) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      currentPage = i;
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const canvas = await renderPage(page, opts.scale);
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const pageWords: OcrWord[] = [];
      for (const b of data.blocks ?? [])
        for (const para of b.paragraphs)
          for (const line of para.lines)
            for (const w of line.words) {
              if (!w.text.trim()) continue;
              pageWords.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
              confSum += w.confidence;
              words++;
            }
      const image = await canvasToBytes(canvas, "image/jpeg", opts.jpegQuality ?? 0.82);
      out.push({ width: vp.width, height: vp.height, imageWidth: canvas.width, imageHeight: canvas.height, image: { data: image, mime: "image/jpeg" }, words: pageWords });
      texts.push(`--- Page ${n} ---\n${(data.text || "").trim()}`);
      releaseCanvas(canvas);
      report((i + 1) / total, `Recognised page ${i + 1} of ${total}`);
    }
    report(1, "Building searchable PDF…");
    const { bytes, replacedChars } = await buildSearchablePdf(out);
    return { pdf: bytes, text: texts.join("\n\n") + "\n", pages: total, words, meanConfidence: words ? confSum / words : 0, replacedChars };
  } finally {
    opts.signal?.removeEventListener("abort", abort);
    await worker.terminate().catch(() => {});
  }
}
