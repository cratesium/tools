/**
 * Image XObject discovery and pixel decoding with pdf-lib (no rendering).
 * JPEG (DCTDecode) and JPEG 2000 (JPXDecode) data is returned byte-for-byte; other images are
 * decoded to RGBA (Flate/LZW/RunLength/ASCII filters, PNG/TIFF predictors, 1/2/4/8/16-bit,
 * Gray/RGB/CMYK/ICC/Cal/Indexed colour spaces, /Decode arrays, image masks and soft masks).
 * Unsupported: CCITT fax, JBIG2, Lab/Separation/DeviceN colour spaces, inline images.
 */
import type { PDFContext, PDFDict, PDFObject, PDFRef, PDFStream } from "@cantoo/pdf-lib";
import { lookupDict, nameOf, numberArray, streamBytes } from "./edit-utils";
import type { PdfLib } from "./load";

export type ImageKind = "jpeg" | "jp2" | "raw" | "unsupported";

export interface PdfImageRef {
  key: string;
  ref: PDFRef;
  stream: PDFStream;
  /** First page (1-based) that uses the image. */
  page: number;
  width: number;
  height: number;
  bpc: number;
  colorSpace: string;
  filters: string[];
  kind: ImageKind;
  hasSMask: boolean;
  isMask: boolean;
  reason?: string;
}

export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function filtersOf(lib: PdfLib, dict: PDFDict): string[] {
  const f = dict.lookup(lib.PDFName.of("Filter"));
  if (f instanceof lib.PDFName) return [f.decodeText()];
  if (f instanceof lib.PDFArray) return f.asArray().map((x) => nameOf(lib, dict.context.lookup(x)) ?? "?");
  return [];
}

const DECODABLE = new Set(["FlateDecode", "Fl", "LZWDecode", "LZW", "RunLengthDecode", "RL", "ASCII85Decode", "A85", "ASCIIHexDecode", "AHx"]);

/** Describes a colour space: component count and an optional palette. */
interface ColorSpaceInfo {
  name: string;
  comps: number;
  supported: boolean;
  indexed?: { base: ColorSpaceInfo; hival: number; lookup: Uint8Array };
}

export function describeColorSpace(lib: PdfLib, ctx: PDFContext, obj: PDFObject | undefined): ColorSpaceInfo {
  const cs = obj ? ctx.lookup(obj) : undefined;
  if (cs instanceof lib.PDFName) {
    const n = cs.decodeText();
    if (n === "DeviceGray" || n === "G" || n === "CalGray") return { name: "DeviceGray", comps: 1, supported: true };
    if (n === "DeviceRGB" || n === "RGB" || n === "CalRGB") return { name: "DeviceRGB", comps: 3, supported: true };
    if (n === "DeviceCMYK" || n === "CMYK") return { name: "DeviceCMYK", comps: 4, supported: true };
    return { name: n, comps: 1, supported: false };
  }
  if (cs instanceof lib.PDFArray && cs.size() > 0) {
    const family = nameOf(lib, cs.lookup(0)) ?? "";
    if (family === "ICCBased") {
      const s = cs.lookup(1);
      const n = s instanceof lib.PDFStream ? s.dict.lookup(lib.PDFName.of("N")) : undefined;
      const comps = n instanceof lib.PDFNumber ? n.asNumber() : 3;
      return { name: comps === 1 ? "DeviceGray" : comps === 4 ? "DeviceCMYK" : "DeviceRGB", comps, supported: [1, 3, 4].includes(comps) };
    }
    if (family === "CalRGB") return { name: "DeviceRGB", comps: 3, supported: true };
    if (family === "CalGray") return { name: "DeviceGray", comps: 1, supported: true };
    if (family === "Indexed" || family === "I") {
      const base = describeColorSpace(lib, ctx, cs.get(1));
      const hivalObj = cs.lookup(2);
      const hival = hivalObj instanceof lib.PDFNumber ? hivalObj.asNumber() : 255;
      const lk = cs.lookup(3);
      let lookup: Uint8Array = new Uint8Array();
      if (lk instanceof lib.PDFString || lk instanceof lib.PDFHexString) lookup = lk.asBytes();
      else if (lk instanceof lib.PDFStream) lookup = streamBytes(lib, lk);
      return { name: "Indexed", comps: 1, supported: base.supported && !base.indexed, indexed: { base, hival, lookup } };
    }
    return { name: family, comps: 1, supported: false };
  }
  return { name: "DeviceGray", comps: 1, supported: false };
}

/** Reverses PNG (predictor ≥ 10) or TIFF (predictor 2) row prediction. */
export function unpredict(data: Uint8Array, predictor: number, colors: number, bpc: number, columns: number): Uint8Array {
  if (predictor < 2) return data;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  if (predictor === 2) {
    if (bpc !== 8) return data;
    const out = data.slice();
    for (let r = 0; r * rowLen < out.length; r++)
      for (let k = bpp; k < rowLen; k++) {
        const i = r * rowLen + k;
        if (i < out.length) out[i] = (out[i] + out[i - bpp]) & 0xff;
      }
    return out;
  }
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  const prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let k = 0; k < rowLen; k++) {
      const a = k >= bpp ? cur[k - bpp] : 0;
      const b = prev[k];
      const c = k >= bpp ? prev[k - bpp] : 0;
      let v = src[k];
      if (type === 1) v += a;
      else if (type === 2) v += b;
      else if (type === 3) v += (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[k] = v & 0xff;
    }
    prev.set(cur);
  }
  return out;
}

/** Unpacks samples of `bpc` bits into one byte per sample (row-aligned), scaled to 0–255. */
export function unpackSamples(data: Uint8Array, width: number, height: number, comps: number, bpc: number, scale = true): Uint8Array {
  const perRow = width * comps;
  const out = new Uint8Array(perRow * height);
  if (bpc === 8) {
    out.set(data.subarray(0, Math.min(data.length, out.length)));
    return out;
  }
  if (bpc === 16) {
    for (let i = 0; i < out.length && i * 2 < data.length; i++) out[i] = data[i * 2];
    return out;
  }
  const rowBytes = Math.ceil((perRow * bpc) / 8);
  const max = (1 << bpc) - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < perRow; x++) {
      const bit = x * bpc;
      const byte = data[y * rowBytes + (bit >> 3)] ?? 0;
      const v = (byte >> (8 - bpc - (bit & 7))) & max;
      out[y * perRow + x] = scale ? Math.round((v * 255) / max) : v;
    }
  }
  return out;
}

function decodeParms(lib: PdfLib, dict: PDFDict): PDFDict | undefined {
  const p = dict.lookup(lib.PDFName.of("DecodeParms")) ?? dict.lookup(lib.PDFName.of("DP"));
  if (p instanceof lib.PDFDict) return p;
  if (p instanceof lib.PDFArray) {
    for (let i = p.size() - 1; i >= 0; i--) {
      const d = p.lookup(i);
      if (d instanceof lib.PDFDict) return d;
    }
  }
  return undefined;
}

function num(lib: PdfLib, dict: PDFDict | undefined, key: string, fallback: number): number {
  const v = dict?.lookup(lib.PDFName.of(key));
  return v instanceof lib.PDFNumber ? v.asNumber() : fallback;
}

/** Inspects one image XObject. */
export function describeImage(lib: PdfLib, ref: PDFRef, stream: PDFStream, page: number): PdfImageRef {
  const d = stream.dict;
  const ctx = d.context;
  const width = num(lib, d, "Width", 0);
  const height = num(lib, d, "Height", 0);
  const isMask = d.lookup(lib.PDFName.of("ImageMask")) === lib.PDFBool.True;
  const bpc = isMask ? 1 : num(lib, d, "BitsPerComponent", 8);
  const filters = filtersOf(lib, d);
  const cs = isMask ? { name: "Mask", comps: 1, supported: true } : describeColorSpace(lib, ctx, d.get(lib.PDFName.of("ColorSpace")));
  const hasSMask = !!d.get(lib.PDFName.of("SMask"));
  const last = filters[filters.length - 1];
  let kind: ImageKind = "raw";
  let reason: string | undefined;
  if (last === "DCTDecode" || last === "DCT") kind = filters.length === 1 ? "jpeg" : "unsupported";
  else if (last === "JPXDecode") kind = filters.length === 1 ? "jp2" : "unsupported";
  else if (filters.some((f) => !DECODABLE.has(f))) {
    kind = "unsupported";
    reason = `${last} compression is not supported`;
  } else if (!cs.supported) {
    kind = "unsupported";
    reason = `${cs.name} colour space is not supported`;
  } else if (![1, 2, 4, 8, 16].includes(bpc)) {
    kind = "unsupported";
    reason = `${bpc}-bit samples are not supported`;
  }
  if (kind === "unsupported" && !reason) reason = `${filters.join(" + ")} filter chain is not supported`;
  return { key: ref.toString(), ref, stream, page, width, height, bpc, colorSpace: cs.name, filters, kind, hasSMask, isMask, reason };
}

/** Finds every image XObject used by the document's pages (including inside form XObjects), deduplicated. */
export function findImages(lib: PdfLib, pages: { node: { Resources(): PDFDict | undefined } }[]): PdfImageRef[] {
  const found = new Map<string, PdfImageRef>();
  const seenForms = new Set<string>();
  const walk = (resources: PDFDict | undefined, page: number) => {
    const xobjects = lookupDict(lib, resources, "XObject");
    if (!xobjects) return;
    for (const [, value] of xobjects.entries()) {
      if (!(value instanceof lib.PDFRef)) continue;
      const key = value.toString();
      const obj = xobjects.context.lookup(value);
      if (!(obj instanceof lib.PDFStream)) continue;
      const subtype = nameOf(lib, obj.dict.lookup(lib.PDFName.of("Subtype")));
      if (subtype === "Image") {
        if (!found.has(key)) found.set(key, describeImage(lib, value, obj, page));
      } else if (subtype === "Form" && !seenForms.has(key)) {
        seenForms.add(key);
        walk(lookupDict(lib, obj.dict, "Resources"), page);
      }
    }
  };
  pages.forEach((p, i) => walk(p.node.Resources(), i + 1));
  return [...found.values()];
}

/** Decodes the samples of a raw image to RGBA. Throws for unsupported images. */
export function decodeImageRgba(lib: PdfLib, img: PdfImageRef, { applySMask = true }: { applySMask?: boolean } = {}): Rgba {
  if (img.kind !== "raw") throw new Error(img.reason ?? "Not a raw image");
  const d = img.stream.dict;
  const ctx = d.context;
  const { width, height, bpc } = img;
  if (!width || !height) throw new Error("Image has no dimensions");
  let bytes = streamBytes(lib, img.stream);
  const parms = decodeParms(lib, d);
  const cs = img.isMask
    ? { name: "Mask", comps: 1, supported: true }
    : describeColorSpace(lib, ctx, d.get(lib.PDFName.of("ColorSpace")));
  const predictor = num(lib, parms, "Predictor", 1);
  if (predictor > 1)
    bytes = unpredict(bytes, predictor, num(lib, parms, "Colors", cs.comps), num(lib, parms, "BitsPerComponent", bpc), num(lib, parms, "Columns", width));
  const decode = numberArray(lib, d.lookup(lib.PDFName.of("Decode")));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const n = width * height;

  if (img.isMask || cs.indexed) {
    const samples = unpackSamples(bytes, width, height, 1, bpc, false);
    if (img.isMask) {
      const paintWhen = decode && decode[0] === 1 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const painted = samples[i] === paintWhen;
        rgba[i * 4 + 3] = painted ? 255 : 0;
      }
      return { width, height, data: rgba };
    }
    const { base, hival, lookup } = cs.indexed!;
    for (let i = 0; i < n; i++) {
      const idx = Math.min(samples[i], hival) * base.comps;
      writeColor(rgba, i, base.comps, lookup, idx);
    }
  } else {
    const comps = cs.comps;
    const samples = unpackSamples(bytes, width, height, comps, bpc, true);
    if (decode && decode.length >= comps * 2)
      for (let i = 0; i < samples.length; i++) {
        const c = i % comps;
        const [lo, hi] = [decode[c * 2], decode[c * 2 + 1]];
        samples[i] = Math.max(0, Math.min(255, Math.round(lo * 255 + (samples[i] / 255) * (hi - lo) * 255)));
      }
    for (let i = 0; i < n; i++) writeColor(rgba, i, comps, samples, i * comps);
  }

  if (applySMask) {
    const sm = d.lookup(lib.PDFName.of("SMask"));
    if (sm instanceof lib.PDFStream) {
      try {
        const smRef = d.get(lib.PDFName.of("SMask")) as PDFRef;
        const mask = describeImage(lib, smRef, sm, img.page);
        if (mask.kind === "raw" && mask.width === width && mask.height === height) {
          const m = decodeImageRgba(lib, mask, { applySMask: false });
          for (let i = 0; i < n; i++) rgba[i * 4 + 3] = m.data[i * 4];
        }
      } catch {
        /* keep the image opaque if the mask cannot be decoded */
      }
    }
  }
  return { width, height, data: rgba };
}

function writeColor(out: Uint8ClampedArray, i: number, comps: number, src: Uint8Array, o: number) {
  if (comps === 1) {
    const g = src[o] ?? 0;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g;
  } else if (comps === 3) {
    out[i * 4] = src[o] ?? 0;
    out[i * 4 + 1] = src[o + 1] ?? 0;
    out[i * 4 + 2] = src[o + 2] ?? 0;
  } else {
    const c = (src[o] ?? 0) / 255;
    const m = (src[o + 1] ?? 0) / 255;
    const y = (src[o + 2] ?? 0) / 255;
    const k = (src[o + 3] ?? 0) / 255;
    out[i * 4] = 255 * (1 - c) * (1 - k);
    out[i * 4 + 1] = 255 * (1 - m) * (1 - k);
    out[i * 4 + 2] = 255 * (1 - y) * (1 - k);
  }
  out[i * 4 + 3] = 255;
}

/** Raw bytes of a JPEG / JPEG 2000 image exactly as stored in the PDF. */
export function encodedImageBytes(lib: PdfLib, img: PdfImageRef): Uint8Array {
  const s = img.stream;
  return s instanceof lib.PDFRawStream ? s.getContents() : streamBytes(lib, s);
}

export interface ExtractedImage {
  key: string;
  page: number;
  width: number;
  height: number;
  colorSpace: string;
  /** Present for JPEG / JPEG 2000: original bytes. */
  encoded?: { data: Uint8Array; ext: "jpg" | "jp2"; mime: string };
  /** Present for decoded raw images. */
  rgba?: Rgba;
}

export interface ExtractImagesResult {
  images: ExtractedImage[];
  skipped: { key: string; page: number; width: number; height: number; reason: string }[];
  total: number;
}

/** Extracts every image XObject at least `minSize` pixels on both sides. Soft masks are not listed separately. */
export async function extractImages(
  data: Uint8Array,
  { password, minSize = 1, onProgress }: { password?: string; minSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<ExtractImagesResult> {
  const { loadPdf, pdfLib } = await import("./load");
  const lib = await pdfLib();
  const doc = await loadPdf(data, { password });
  const all = findImages(lib, doc.getPages());
  // Exclude images that are only used as soft masks of other images.
  const maskKeys = new Set<string>();
  for (const img of all) {
    const sm = img.stream.dict.get(lib.PDFName.of("SMask"));
    if (sm instanceof lib.PDFRef) maskKeys.add(sm.toString());
  }
  const list = all.filter((i) => !maskKeys.has(i.key));
  const images: ExtractedImage[] = [];
  const skipped: ExtractImagesResult["skipped"] = [];
  list.forEach((img, idx) => {
    onProgress?.(idx, list.length);
    if (img.width < minSize || img.height < minSize) return;
    const base = { key: img.key, page: img.page, width: img.width, height: img.height, colorSpace: img.colorSpace };
    try {
      if (img.kind === "jpeg") images.push({ ...base, encoded: { data: encodedImageBytes(lib, img), ext: "jpg", mime: "image/jpeg" } });
      else if (img.kind === "jp2") images.push({ ...base, encoded: { data: encodedImageBytes(lib, img), ext: "jp2", mime: "image/jp2" } });
      else if (img.kind === "raw") images.push({ ...base, rgba: decodeImageRgba(lib, img) });
      else skipped.push({ ...base, reason: img.reason ?? "Unsupported image encoding" });
    } catch (e) {
      skipped.push({ ...base, reason: e instanceof Error ? e.message : "Could not decode" });
    }
  });
  onProgress?.(list.length, list.length);
  return { images, skipped, total: list.length };
}
