/**
 * PDF compression with real, lossless + lossy techniques:
 *  1. Re-encode JPEG images and 8-bit RGB/Gray/CMYK raw images as JPEG at the chosen quality,
 *     downsampled to a maximum resolution, replacing an image only when the result is smaller.
 *  2. Flate-compress streams that are stored uncompressed (lossless).
 *  3. Optionally drop XMP metadata, page thumbnails and private application data.
 *  4. Save with object streams (compressed cross-reference).
 * The pixel encoder is injected so the walk can be unit-tested in node; the browser encoder
 * (canvasEncoder) uses createImageBitmap + canvas.toBlob("image/jpeg").
 */
import type { PDFRawStream as PDFRawStreamType } from "@cantoo/pdf-lib";
import { decodeImageRgba, encodedImageBytes, findImages, type Rgba } from "./images";
import { loadPdf, pdfLib } from "./load";

export type EncodeInput = { kind: "jpeg"; data: Uint8Array; width: number; height: number } | { kind: "rgba"; rgba: Rgba };

export interface EncodeTarget {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  grayscale: boolean;
}

export type ImageEncoder = (input: EncodeInput, target: EncodeTarget) => Promise<{ data: Uint8Array; width: number; height: number } | null>;

export interface CompressOptions {
  password?: string;
  /** JPEG quality 0–1. */
  quality: number;
  /** Maximum image resolution, relative to the page the image appears on. */
  maxDpi: number;
  grayscale?: boolean;
  stripMetadata?: boolean;
  encoder: ImageEncoder;
  onProgress?: (fraction: number, label?: string) => void;
  signal?: AbortSignal;
}

export interface CompressReport {
  before: number;
  after: number;
  images: number;
  recompressed: number;
  imageBytesSaved: number;
  streamsDeflated: number;
}

export async function compressPdf(data: Uint8Array, opts: CompressOptions): Promise<{ bytes: Uint8Array; report: CompressReport }> {
  const lib = await pdfLib();
  const { PDFName, PDFRawStream, PDFNumber } = lib;
  const doc = await loadPdf(data, { password: opts.password });
  const ctx = doc.context;
  const pages = doc.getPages();
  const all = findImages(lib, pages);
  const maskKeys = new Set<string>();
  for (const img of all) {
    for (const k of ["SMask", "Mask"]) {
      const m = img.stream.dict.get(PDFName.of(k));
      if (m instanceof lib.PDFRef) maskKeys.add(m.toString());
    }
  }
  const candidates = all.filter((i) => !maskKeys.has(i.key) && !i.isMask);
  const report: CompressReport = { before: data.length, after: 0, images: candidates.length, recompressed: 0, imageBytesSaved: 0, streamsDeflated: 0 };

  for (let idx = 0; idx < candidates.length; idx++) {
    if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const img = candidates[idx];
    opts.onProgress?.((idx / Math.max(1, candidates.length)) * 0.9, `Image ${idx + 1} of ${candidates.length}`);
    const d = img.stream.dict;
    if (!(img.stream instanceof PDFRawStream)) continue;
    const oldSize = img.stream.getContentsSize();
    if (oldSize < 2048) continue;
    let input: EncodeInput | null = null;
    try {
      if (img.kind === "jpeg") {
        const ok = (img.colorSpace === "DeviceRGB" || img.colorSpace === "DeviceGray") && img.bpc === 8 && !d.get(PDFName.of("Decode"));
        if (ok) input = { kind: "jpeg", data: encodedImageBytes(lib, img), width: img.width, height: img.height };
      } else if (img.kind === "raw" && img.bpc === 8 && img.colorSpace !== "Indexed") {
        input = { kind: "rgba", rgba: decodeImageRgba(lib, img, { applySMask: false }) };
      }
    } catch {
      input = null;
    }
    if (!input) continue;
    const page = pages[img.page - 1];
    const { width: pw, height: ph } = page.getSize();
    const limit = Math.max(16, Math.round((Math.max(pw, ph) / 72) * opts.maxDpi));
    let encoded: Awaited<ReturnType<ImageEncoder>> = null;
    try {
      encoded = await opts.encoder(input, { maxWidth: limit, maxHeight: limit, quality: opts.quality, grayscale: !!opts.grayscale });
    } catch {
      encoded = null;
    }
    if (!encoded || encoded.data.length >= oldSize * 0.95) continue;
    const dict = ctx.obj({
      Type: "XObject",
      Subtype: "Image",
      Width: encoded.width,
      Height: encoded.height,
      ColorSpace: "DeviceRGB",
      BitsPerComponent: 8,
      Filter: "DCTDecode",
    });
    for (const k of ["SMask", "Interpolate", "Intent", "OC", "Alternates", "StructParent"]) {
      const v = d.get(PDFName.of(k));
      if (v) dict.set(PDFName.of(k), v);
    }
    // A stencil /Mask stream stays valid at any resolution; colour-key arrays do not survive lossy coding.
    const mask = d.get(PDFName.of("Mask"));
    if (mask instanceof lib.PDFRef) dict.set(PDFName.of("Mask"), mask);
    dict.set(PDFName.of("Length"), PDFNumber.of(encoded.data.length));
    ctx.assign(img.ref, PDFRawStream.of(dict, encoded.data));
    report.recompressed++;
    report.imageBytesSaved += oldSize - encoded.data.length;
  }

  opts.onProgress?.(0.92, "Compressing streams");
  // Lossless: deflate streams stored without any filter.
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const raw = obj as PDFRawStreamType;
    if (raw.dict.get(PDFName.of("Filter")) || raw.getContentsSize() < 256) continue;
    const type = raw.dict.lookup(PDFName.of("Type"));
    if (type === PDFName.of("XRef") || type === PDFName.of("ObjStm") || type === PDFName.of("Metadata")) continue;
    const fresh = ctx.flateStream(raw.getContents());
    for (const [k, v] of raw.dict.entries()) if (k.toString() !== "/Length") fresh.dict.set(k, v);
    ctx.assign(ref, fresh);
    report.streamsDeflated++;
  }

  if (opts.stripMetadata) {
    doc.catalog.delete(PDFName.of("Metadata"));
    doc.catalog.delete(PDFName.of("PieceInfo"));
    for (const p of pages) {
      p.node.delete(PDFName.of("Thumb"));
      p.node.delete(PDFName.of("PieceInfo"));
    }
  }

  opts.onProgress?.(0.96, "Saving");
  const bytes = await doc.save({ useObjectStreams: true });
  report.after = bytes.length;
  opts.onProgress?.(1);
  return { bytes, report };
}

/** Browser encoder: decodes with createImageBitmap / ImageData and re-encodes with canvas.toBlob. */
export function canvasEncoder(): ImageEncoder {
  return async (input, target) => {
    let source: CanvasImageSource;
    let w: number;
    let h: number;
    let bitmap: ImageBitmap | null = null;
    if (input.kind === "jpeg") {
      bitmap = await createImageBitmap(new Blob([input.data as BlobPart], { type: "image/jpeg" }));
      source = bitmap;
      w = bitmap.width;
      h = bitmap.height;
    } else {
      const c = document.createElement("canvas");
      c.width = input.rgba.width;
      c.height = input.rgba.height;
      c.getContext("2d")!.putImageData(new ImageData(input.rgba.data as Uint8ClampedArray<ArrayBuffer>, input.rgba.width, input.rgba.height), 0, 0);
      source = c;
      w = c.width;
      h = c.height;
    }
    const s = Math.min(1, target.maxWidth / w, target.maxHeight / h);
    const ow = Math.max(1, Math.round(w * s));
    const oh = Math.max(1, Math.round(h * s));
    const canvas = document.createElement("canvas");
    canvas.width = ow;
    canvas.height = oh;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, ow, oh);
    g.imageSmoothingQuality = "high";
    g.drawImage(source, 0, 0, ow, oh);
    bitmap?.close();
    if (target.grayscale) {
      const id = g.getImageData(0, 0, ow, oh);
      const p = id.data;
      for (let i = 0; i < p.length; i += 4) {
        const y = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
        p[i] = p[i + 1] = p[i + 2] = y;
      }
      g.putImageData(id, 0, 0);
    }
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", target.quality));
    canvas.width = canvas.height = 0;
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), width: ow, height: oh };
  };
}
