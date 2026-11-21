/** Read and write the document information dictionary (and optionally drop stale XMP metadata). */
import { loadPdf, pdfLib, savePdf, type PdfDoc } from "./load";

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: Date | null;
  modificationDate: Date | null;
}

export interface PdfInfo extends PdfMetadata {
  pageCount: number;
  version: string;
  hasXmp: boolean;
  pageSize: { width: number; height: number } | null;
}

function readVersion(bytes: Uint8Array): string {
  const m = new TextDecoder("latin1").decode(bytes.subarray(0, 32)).match(/%PDF-(\d\.\d)/);
  return m ? m[1] : "unknown";
}

export function readMetadataFromDoc(doc: PdfDoc): PdfMetadata {
  return {
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    keywords: doc.getKeywords() ?? "",
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
    creationDate: doc.getCreationDate() ?? null,
    modificationDate: doc.getModificationDate() ?? null,
  };
}

export async function readPdfInfo(bytes: Uint8Array, password?: string): Promise<PdfInfo> {
  const doc = await loadPdf(bytes, { password });
  const { PDFName } = await pdfLib();
  const first = doc.getPageCount() ? doc.getPage(0) : null;
  return {
    ...readMetadataFromDoc(doc),
    pageCount: doc.getPageCount(),
    version: readVersion(bytes),
    hasXmp: !!doc.catalog.get(PDFName.of("Metadata")),
    pageSize: first ? { width: first.getWidth(), height: first.getHeight() } : null,
  };
}

/** Splits a keywords string on commas/semicolons. */
export function splitKeywords(s: string): string[] {
  return s
    .split(/[,;]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export async function writePdfMetadata(
  bytes: Uint8Array,
  meta: PdfMetadata,
  { password, removeXmp = true }: { password?: string; removeXmp?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, { password });
  const { PDFName, PDFHexString } = await pdfLib();
  // getInfoDict is private in the typings; it is the supported way to reach /Info in pdf-lib.
  const info = (doc as unknown as { getInfoDict(): import("@cantoo/pdf-lib").PDFDict }).getInfoDict();
  const setOrDelete = (key: string, value: string, setter: (v: string) => void) => {
    if (value.trim()) setter(value.trim());
    else info.delete(PDFName.of(key));
  };
  setOrDelete("Title", meta.title, (v) => doc.setTitle(v));
  setOrDelete("Author", meta.author, (v) => doc.setAuthor(v));
  setOrDelete("Subject", meta.subject, (v) => doc.setSubject(v));
  setOrDelete("Creator", meta.creator, (v) => doc.setCreator(v));
  setOrDelete("Producer", meta.producer, (v) => doc.setProducer(v));
  const kw = splitKeywords(meta.keywords);
  // Written directly (pdf-lib joins with spaces, which breaks multi-word keywords).
  if (kw.length) info.set(PDFName.of("Keywords"), PDFHexString.fromText(kw.join(", ")));
  else info.delete(PDFName.of("Keywords"));
  if (meta.creationDate) doc.setCreationDate(meta.creationDate);
  else info.delete(PDFName.of("CreationDate"));
  if (meta.modificationDate) doc.setModificationDate(meta.modificationDate);
  else info.delete(PDFName.of("ModDate"));
  if (removeXmp) doc.catalog.delete(PDFName.of("Metadata"));
  return savePdf(doc);
}
