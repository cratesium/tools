/**
 * Browser-only helpers: decoding files to bitmaps, drawing to canvases, reading pixels and
 * encoding output. Not imported by node tests.
 */

import { encodeBmp } from "./bmp";
import { outputFormats, type OutputFormat } from "./formats";
import type { Pixels } from "./pixels";

export type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export interface DecodedImage {
  source: Drawable;
  width: number;
  height: number;
  /** Release decoded memory. */
  close: () => void;
}

/** Decodes an image file. EXIF orientation is applied (browser default for createImageBitmap and <img>). */
export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const isSvg = blob.type === "image/svg+xml";
  if (!isSvg && typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> decoding, which supports more formats in some browsers */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("The image has no intrinsic size.");
    return { source: img, width, height, close: () => undefined };
  } catch {
    throw new Error(
      `This browser can't decode "${(blob as File).name ?? "the file"}" (${blob.type || "unknown type"}). Try JPG, PNG, WebP, GIF, BMP or AVIF.`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load."));
    img.src = url;
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  return ctx;
}

/** Browsers cap canvas area (Safari ~16.7 MP on iOS, others ~268 MP). */
export const MAX_CANVAS_PIXELS = 16_777_216 * 4;
export function assertCanvasSize(w: number, h: number) {
  if (w * h > MAX_CANVAS_PIXELS || w > 32767 || h > 32767)
    throw new Error(`The output (${w}×${h}) is larger than browsers can handle in a canvas. Choose a smaller size.`);
}

/**
 * Draws a source scaled to w×h with high-quality resampling. Large downscales are done in
 * halving steps, which avoids the aliasing a single bilinear pass produces.
 */
export function drawScaled(src: Drawable, sw: number, sh: number, w: number, h: number): HTMLCanvasElement {
  assertCanvasSize(w, h);
  let cur: Drawable = src;
  let cw = sw,
    ch = sh;
  while (cw / 2 >= w && ch / 2 >= h) {
    const nw = Math.max(w, Math.round(cw / 2)),
      nh = Math.max(h, Math.round(ch / 2));
    const step = createCanvas(nw, nh);
    const sctx = context2d(step);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(cur, 0, 0, nw, nh);
    cur = step;
    cw = nw;
    ch = nh;
  }
  const out = createCanvas(w, h);
  const ctx = context2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}

export function toCanvas(img: DecodedImage, w = img.width, h = img.height): HTMLCanvasElement {
  return drawScaled(img.source, img.width, img.height, w, h);
}

export function canvasPixels(c: HTMLCanvasElement): Pixels {
  const d = context2d(c).getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

export function pixelsToCanvas(p: Pixels): HTMLCanvasElement {
  const c = createCanvas(p.width, p.height);
  const data = new Uint8ClampedArray(p.data.length);
  data.set(p.data);
  context2d(c).putImageData(new ImageData(data, p.width, p.height), 0, 0);
  return c;
}

/** Decodes and reads pixels, optionally scaled to fit a max long edge (for previews). */
export async function filePixels(blob: Blob, maxEdge?: number): Promise<{ pixels: Pixels; width: number; height: number }> {
  const img = await decodeImage(blob);
  try {
    let w = img.width,
      h = img.height;
    if (maxEdge && Math.max(w, h) > maxEdge) {
      const s = maxEdge / Math.max(w, h);
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    return { pixels: canvasPixels(toCanvas(img, w, h)), width: img.width, height: img.height };
  } finally {
    img.close();
  }
}

const encodeSupport = new Map<string, boolean>();

/** Whether canvas can encode the MIME type (Safari can't encode WebP, for example). */
export function canEncode(mime: string): boolean {
  if (mime === "image/bmp") return true;
  if (encodeSupport.has(mime)) return encodeSupport.get(mime)!;
  let ok = false;
  try {
    const c = createCanvas(1, 1);
    ok = c.toDataURL(mime).startsWith(`data:${mime}`);
  } catch {
    ok = false;
  }
  encodeSupport.set(mime, ok);
  return ok;
}

export function canvasToBlob(c: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (!b) return reject(new Error("The browser could not encode the image (it may be too large)."));
        if (b.type !== mime) return reject(new Error(`This browser can't encode ${mime.replace("image/", "").toUpperCase()}. Try Chrome, Edge or Firefox, or choose another format.`));
        resolve(b);
      },
      mime,
      quality,
    );
  });
}

export interface EncodeOptions {
  format: OutputFormat;
  /** 0–1 for lossy formats. */
  quality?: number;
  /** Fill colour for formats without alpha (JPEG). Default white. */
  background?: string;
}

/** Encodes a canvas to the chosen format. JPEG gets transparent areas flattened onto `background`. */
export async function encodeCanvas(c: HTMLCanvasElement, o: EncodeOptions): Promise<Blob> {
  const info = outputFormats[o.format];
  if (o.format === "bmp") {
    const bytes = encodeBmp(canvasPixels(c));
    return new Blob([bytes as BlobPart], { type: "image/bmp" });
  }
  let target = c;
  if (!info.alpha) {
    target = createCanvas(c.width, c.height);
    const ctx = context2d(target);
    ctx.fillStyle = o.background ?? "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(c, 0, 0);
  }
  return canvasToBlob(target, info.mime, info.lossy ? (o.quality ?? 0.85) : undefined);
}

export function outputName(name: string, format: OutputFormat, suffix = ""): string {
  const i = name.lastIndexOf(".");
  const base = i > 0 ? name.slice(0, i) : name || "image";
  return `${base}${suffix}.${outputFormats[format].ext}`;
}

/** Whether the decoded image has any transparent pixel (sampled on a small copy). */
export function hasTransparency(img: DecodedImage): boolean {
  const s = Math.min(1, 256 / Math.max(img.width, img.height));
  const c = toCanvas(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
  const d = canvasPixels(c).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}
