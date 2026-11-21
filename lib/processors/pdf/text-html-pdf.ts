/**
 * HTML → PDF and EPUB → PDF orchestration on top of htmlToBlocks + layoutBlocks.
 * Needs DOMParser (browser, or jsdom in tests). Image conversion (GIF/WebP/SVG → PNG) is injected
 * by the UI because it needs a canvas.
 */
import { documentTitle, htmlToBlocks, type ImageResolver } from "./html-blocks";
import { layoutBlocks, type Block, type LayoutOptions, type LayoutResult } from "./layout";
import type { ParsedEpub } from "./epub";

export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml" | "image/bmp";

export function sniffImageMime(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  const head = new TextDecoder().decode(b.subarray(0, 512)).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** Decodes a data: URL (base64 or percent-encoded). Returns null for anything else. */
export function decodeDataUrl(url: string): Uint8Array | null {
  const m = url.match(/^data:([^,]*?),([\s\S]*)$/);
  if (!m) return null;
  const isB64 = /;base64$/i.test(m[1]);
  try {
    if (isB64) {
      const bin = atob(m[2].replace(/\s+/g, ""));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(m[2]));
  } catch {
    return null;
  }
}

/** Converts non-PNG/JPEG images to PNG (canvas in the browser). Returns null when not possible. */
export type ImageConverter = (data: Uint8Array, mime: ImageMime) => Promise<Uint8Array | null>;

export interface ImageStats {
  embedded: number;
  skipped: number;
}

/** Wraps a byte loader into an ImageResolver that sniffs, converts and counts images. */
export function makeImageResolver(
  load: (src: string) => Promise<Uint8Array | null>,
  convert?: ImageConverter,
): { resolve: ImageResolver; stats: ImageStats } {
  const stats: ImageStats = { embedded: 0, skipped: 0 };
  const resolve: ImageResolver = async (src) => {
    let data: Uint8Array | null = null;
    try {
      data = await load(src);
    } catch {
      data = null;
    }
    if (!data) {
      stats.skipped++;
      return null;
    }
    const mime = sniffImageMime(data);
    if (mime === "image/png" || mime === "image/jpeg") {
      stats.embedded++;
      return { data, mime };
    }
    if (mime && convert) {
      const png = await convert(data, mime).catch(() => null);
      if (png) {
        stats.embedded++;
        return { data: png, mime: "image/png" };
      }
    }
    stats.skipped++;
    return null;
  };
  return { resolve, stats };
}

export interface HtmlToPdfResult extends LayoutResult {
  images: ImageStats;
  blocks: number;
}

export async function htmlToPdf(
  html: string,
  { loadImage, convertImage, ...layout }: LayoutOptions & { loadImage?: (src: string) => Promise<Uint8Array | null>; convertImage?: ImageConverter } = {},
): Promise<HtmlToPdfResult> {
  const { resolve, stats } = makeImageResolver(async (src) => decodeDataUrl(src) ?? (loadImage ? loadImage(src) : null), convertImage);
  const blocks = await htmlToBlocks(html, { resolveImage: resolve });
  if (!blocks.length) throw new Error("No readable content was found in this HTML.");
  const res = await layoutBlocks(blocks, { title: layout.title ?? documentTitle(html), ...layout });
  return { ...res, images: stats, blocks: blocks.length };
}

export async function epubToPdf(
  epub: ParsedEpub,
  { convertImage, chapterBreaks = true, onProgress, ...layout }: LayoutOptions & {
    convertImage?: ImageConverter;
    chapterBreaks?: boolean;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<HtmlToPdfResult> {
  const all: Block[] = [];
  const statsTotal: ImageStats = { embedded: 0, skipped: 0 };
  for (const [i, docu] of epub.documents.entries()) {
    const { resolve, stats } = makeImageResolver(async (src) => {
      if (src.startsWith("data:")) return decodeDataUrl(src);
      if (/^[a-z]+:/i.test(src)) return null;
      const { resolveZipPath } = await import("./epub");
      return epub.readFile(resolveZipPath(docu.path, src));
    }, convertImage);
    const blocks = await htmlToBlocks(docu.html, { resolveImage: resolve, xml: true });
    if (blocks.length) {
      if (chapterBreaks && all.length) all.push({ type: "pagebreak" });
      all.push(...blocks);
    }
    statsTotal.embedded += stats.embedded;
    statsTotal.skipped += stats.skipped;
    onProgress?.(i + 1, epub.documents.length);
  }
  if (!all.length) throw new Error("No readable text was found in this EPUB.");
  const res = await layoutBlocks(all, { title: epub.title, author: epub.author, ...layout });
  return { ...res, images: statsTotal, blocks: all.length };
}
