/**
 * Page-level operations with pdf-lib: merge, split, rotate, select (delete / extract / reorder)
 * and crop. All functions take and return raw PDF bytes. Page numbers are 1-based.
 */
import type { PDFPage } from "@cantoo/pdf-lib";
import { loadPdf, pdfLib, savePdf, type PdfDoc } from "./load";

export interface MergeInput {
  bytes: Uint8Array;
  password?: string;
  /** 1-based pages to include, in order. Default: all. */
  pages?: number[];
}

export async function mergePdfs(
  inputs: MergeInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (!inputs.length) throw new Error("Add at least one PDF.");
  const { PDFDocument } = await pdfLib();
  const out = await PDFDocument.create();
  for (let i = 0; i < inputs.length; i++) {
    const src = await loadPdf(inputs[i].bytes, { password: inputs[i].password });
    const indices = (inputs[i].pages ?? src.getPageIndices().map((x) => x + 1)).map((p) => p - 1);
    const copied = await out.copyPages(src, indices);
    copied.forEach((p) => out.addPage(p));
    onProgress?.(i + 1, inputs.length);
  }
  out.setProducer("UtilityHub");
  return savePdf(out);
}

/** Copies the given 1-based pages of `src` into a new document (duplicates allowed). */
export async function copyToNewDoc(src: PdfDoc, pages: number[], rotations?: Map<number, number>): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await pdfLib();
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1),
  );
  copied.forEach((p, i) => {
    const delta = rotations?.get(pages[i]) ?? 0;
    if (delta) p.setRotation(degrees(normalizeAngle(p.getRotation().angle + delta)));
    out.addPage(p);
  });
  const title = src.getTitle();
  if (title) out.setTitle(title);
  out.setProducer("UtilityHub");
  return savePdf(out);
}

export function normalizeAngle(a: number): number {
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}

export type SplitMode =
  | { kind: "each" }
  | { kind: "every"; n: number }
  | { kind: "groups"; groups: number[][] };

/** Turns a split mode into page groups (1-based). */
export function splitGroups(mode: SplitMode, total: number): number[][] {
  if (mode.kind === "each") return Array.from({ length: total }, (_, i) => [i + 1]);
  if (mode.kind === "every") {
    const n = Math.max(1, Math.floor(mode.n));
    const groups: number[][] = [];
    for (let s = 1; s <= total; s += n) groups.push(Array.from({ length: Math.min(n, total - s + 1) }, (_, i) => s + i));
    return groups;
  }
  const groups = mode.groups.filter((g) => g.length);
  for (const g of groups) for (const p of g) if (p < 1 || p > total) throw new RangeError(`Page ${p} does not exist.`);
  if (!groups.length) throw new RangeError("No pages selected.");
  return groups;
}

/** Groups from split points: a new part starts after each page in `after` (1-based). */
export function groupsFromSplitPoints(after: number[], total: number): number[][] {
  const cuts = [...new Set(after.filter((p) => p >= 1 && p < total))].sort((a, b) => a - b);
  const groups: number[][] = [];
  let start = 1;
  for (const c of [...cuts, total]) {
    groups.push(Array.from({ length: c - start + 1 }, (_, i) => start + i));
    start = c + 1;
  }
  return groups;
}

export async function splitPdf(
  bytes: Uint8Array,
  groups: number[][],
  { password, onProgress }: { password?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<Uint8Array[]> {
  const src = await loadPdf(bytes, { password });
  const outs: Uint8Array[] = [];
  for (let i = 0; i < groups.length; i++) {
    outs.push(await copyToNewDoc(src, groups[i]));
    onProgress?.(i + 1, groups.length);
  }
  return outs;
}

/**
 * Rotates pages in place (keeps forms, bookmarks and links). `rotations` maps 1-based page
 * number → clockwise delta in degrees (multiples of 90).
 */
export async function rotatePdf(bytes: Uint8Array, rotations: Map<number, number>, password?: string): Promise<Uint8Array> {
  const { degrees } = await pdfLib();
  const doc = await loadPdf(bytes, { password });
  doc.getPages().forEach((page, i) => {
    const delta = rotations.get(i + 1) ?? 0;
    if (delta % 360) page.setRotation(degrees(normalizeAngle(page.getRotation().angle + delta)));
  });
  return savePdf(doc);
}

/**
 * Builds a document containing `order` (1-based, in that order). When the order is ascending
 * (delete / extract) the operation is done in place, so bookmarks, links and form fields that
 * point at kept pages survive; reordered or duplicated pages are copied into a new document.
 */
export async function selectPages(
  bytes: Uint8Array,
  order: number[],
  { password, rotations }: { password?: string; rotations?: Map<number, number> } = {},
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes, { password });
  const total = doc.getPageCount();
  if (!order.length) throw new Error("The result would have no pages. Keep at least one page.");
  for (const p of order) if (p < 1 || p > total) throw new RangeError(`Page ${p} does not exist.`);
  const ascending = order.every((p, i) => i === 0 || p > order[i - 1]);
  // Reordering (or duplicating) pages: copy into a fresh document. pdf-lib corrupts the page
  // tree when every page is removed and re-inserted, so in-place moves aren't safe.
  if (!ascending) return copyToNewDoc(doc, order, rotations);
  // Delete/extract keep document order: remove the other pages in place, so bookmarks, links
  // and form fields that point at kept pages survive.
  const { degrees } = await pdfLib();
  const keep = new Set(order);
  for (let i = total; i >= 1; i--) if (!keep.has(i)) doc.removePage(i - 1);
  doc.getPages().forEach((page, i) => {
    const delta = rotations?.get(order[i]) ?? 0;
    if (delta % 360) page.setRotation(degrees(normalizeAngle(page.getRotation().angle + delta)));
  });
  return savePdf(doc);
}

/** Pages to keep after deleting `remove` (1-based). */
export function keepAfterDelete(remove: number[], total: number): number[] {
  const del = new Set(remove);
  return Array.from({ length: total }, (_, i) => i + 1).filter((p) => !del.has(p));
}

/** Fractions (0–1) of the visible page to trim from each edge, as the user sees the page. */
export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Converts visual (as displayed) margins into unrotated PDF-space margins for a /Rotate value. */
export function visualToPdfMargins(m: CropMargins, rotation: number): CropMargins {
  switch (normalizeAngle(rotation)) {
    case 90:
      return { left: m.top, top: m.right, right: m.bottom, bottom: m.left };
    case 180:
      return { top: m.bottom, right: m.left, bottom: m.top, left: m.right };
    case 270:
      return { right: m.top, bottom: m.right, left: m.bottom, top: m.left };
    default:
      return m;
  }
}

export async function cropPdf(
  bytes: Uint8Array,
  margins: CropMargins,
  { pages, password, setMediaBox = false }: { pages?: number[]; password?: string; setMediaBox?: boolean } = {},
): Promise<Uint8Array> {
  const { top, right, bottom, left } = margins;
  if ([top, right, bottom, left].some((v) => v < 0 || v >= 1) || left + right >= 0.98 || top + bottom >= 0.98)
    throw new RangeError("The crop area is too small or invalid.");
  const doc = await loadPdf(bytes, { password });
  const target = new Set(pages ?? doc.getPageIndices().map((i) => i + 1));
  doc.getPages().forEach((page: PDFPage, i) => {
    if (!target.has(i + 1)) return;
    const box = page.getCropBox();
    const m = visualToPdfMargins(margins, page.getRotation().angle);
    const x = box.x + box.width * m.left;
    const y = box.y + box.height * m.bottom;
    const w = box.width * (1 - m.left - m.right);
    const h = box.height * (1 - m.top - m.bottom);
    page.setCropBox(x, y, w, h);
    if (setMediaBox) {
      page.setMediaBox(x, y, w, h);
      page.setBleedBox(x, y, w, h);
      page.setTrimBox(x, y, w, h);
      page.setArtBox(x, y, w, h);
    }
  });
  return savePdf(doc);
}
