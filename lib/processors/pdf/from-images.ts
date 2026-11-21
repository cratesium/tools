/** Images → PDF (JPG to PDF, PNG to PDF). JPEG data is embedded as-is (no re-compression). */
import { pdfLib, savePdf } from "./load";
import { PAGE_SIZES } from "./layout";

export interface ImageInput {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
}

export interface ImagesToPdfOptions {
  /** "fit" makes each page exactly the image size (at 72 dpi or `dpi`). */
  pageSize: "fit" | "a4" | "letter" | "legal" | "a3" | "a5";
  orientation: "auto" | "portrait" | "landscape";
  /** Margin in points (ignored for "fit"). */
  margin: number;
  /** Pixel density assumed for "fit" pages. */
  dpi?: number;
  title?: string;
}

export function detectImageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

/** Reads the EXIF orientation tag (1–8) from JPEG bytes; 1 when absent. */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 2;
  while (off + 4 < bytes.length) {
    if (bytes[off] !== 0xff) return 1;
    const marker = bytes[off + 1];
    const len = view.getUint16(off + 2);
    if (marker === 0xe1 && view.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      const n = view.getUint16(ifd, little);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > bytes.length) return 1;
        if (view.getUint16(e, little) === 0x0112) return view.getUint16(e + 8, little) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1;
    off += 2 + len;
  }
  return 1;
}

export async function imagesToPdf(
  images: ImageInput[],
  o: ImagesToPdfOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (!images.length) throw new Error("Add at least one image.");
  const { PDFDocument } = await pdfLib();
  const doc = await PDFDocument.create();
  const pxToPt = 72 / (o.dpi ?? 96);
  for (let i = 0; i < images.length; i++) {
    const { bytes, mime } = images[i];
    const img = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    if (o.pageSize === "fit") {
      const w = img.width * pxToPt;
      const h = img.height * pxToPt;
      const page = doc.addPage([w, h]);
      page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    } else {
      let [pw, ph] = PAGE_SIZES[o.pageSize];
      const landscape = o.orientation === "landscape" || (o.orientation === "auto" && img.width > img.height);
      if (landscape) [pw, ph] = [ph, pw];
      const page = doc.addPage([pw, ph]);
      const m = Math.max(0, Math.min(o.margin, Math.min(pw, ph) / 3));
      const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height);
      const w = img.width * s;
      const h = img.height * s;
      page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
    onProgress?.(i + 1, images.length);
  }
  if (o.title) doc.setTitle(o.title);
  doc.setProducer("UtilityHub");
  doc.setCreator("UtilityHub");
  return savePdf(doc);
}
