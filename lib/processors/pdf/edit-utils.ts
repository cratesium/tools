/**
 * Low-level pdf-lib helpers shared by the edit/optimize tools (watermark removal, flattening,
 * image extraction, compression). All functions receive the lazily imported library.
 */
import type { PDFContext, PDFDict, PDFObject, PDFPage, PDFStream } from "@cantoo/pdf-lib";
import type { PdfLib } from "./load";

/** Decoded bytes of any stream object (raw streams are run through their filters). */
export function streamBytes(lib: PdfLib, stream: PDFStream): Uint8Array {
  if (stream instanceof lib.PDFRawStream) {
    const filter = stream.dict.lookup(lib.PDFName.of("Filter"));
    if (!filter) return stream.getContents();
    return lib.decodePDFRawStream(stream).decode();
  }
  const anyStream = stream as unknown as { getUnencodedContents?: () => Uint8Array; getContents?: () => Uint8Array };
  if (anyStream.getUnencodedContents) return anyStream.getUnencodedContents();
  if (anyStream.getContents) return anyStream.getContents();
  return new Uint8Array();
}

/** All content stream objects of a page, in order. */
export function pageContentStreams(lib: PdfLib, page: PDFPage): PDFStream[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  if (contents instanceof lib.PDFArray) {
    const out: PDFStream[] = [];
    for (let i = 0; i < contents.size(); i++) {
      const s = contents.lookup(i);
      if (s instanceof lib.PDFStream) out.push(s);
    }
    return out;
  }
  return contents instanceof lib.PDFStream ? [contents] : [];
}

/** Concatenated, decoded page content (streams joined by a newline, as the spec allows). */
export function pageContentBytes(lib: PdfLib, page: PDFPage): Uint8Array {
  const parts = pageContentStreams(lib, page).map((s) => streamBytes(lib, s));
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
    out[o++] = 0x0a;
  }
  return out;
}

/** Replaces a page's content with a single Flate-compressed stream. */
export function setPageContent(lib: PdfLib, page: PDFPage, bytes: Uint8Array): void {
  const ref = page.doc.context.register(page.doc.context.flateStream(bytes));
  page.node.set(lib.PDFName.of("Contents"), ref);
}

/** New Flate stream with the same dictionary entries (minus filter/length) as `old`. */
export function replaceStreamContent(lib: PdfLib, context: PDFContext, old: PDFStream, bytes: Uint8Array): PDFStream {
  const fresh = context.flateStream(bytes);
  const skip = new Set(["/Filter", "/DecodeParms", "/Length", "/DL"]);
  for (const [k, v] of old.dict.entries()) if (!skip.has(k.toString())) fresh.dict.set(k, v);
  return fresh;
}

export function nameOf(lib: PdfLib, obj: PDFObject | undefined): string | undefined {
  return obj instanceof lib.PDFName ? obj.decodeText() : undefined;
}

export function lookupDict(lib: PdfLib, dict: PDFDict | undefined, key: string): PDFDict | undefined {
  if (!dict) return undefined;
  const v = dict.lookup(lib.PDFName.of(key));
  return v instanceof lib.PDFDict ? v : undefined;
}

/** Numbers of a PDFArray (non-numbers become 0). */
export function numberArray(lib: PdfLib, obj: PDFObject | undefined): number[] | undefined {
  if (!(obj instanceof lib.PDFArray)) return undefined;
  const out: number[] = [];
  for (let i = 0; i < obj.size(); i++) {
    const v = obj.lookup(i);
    out.push(v instanceof lib.PDFNumber ? v.asNumber() : 0);
  }
  return out;
}
