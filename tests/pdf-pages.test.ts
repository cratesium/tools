import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees, PDFName } from "@cantoo/pdf-lib";
import { formatPageRanges, parsePageRanges } from "@/lib/processors/pdf/ranges";
import { isPdfPasswordError, loadPdf } from "@/lib/processors/pdf/load";
import {
  cropPdf,
  groupsFromSplitPoints,
  keepAfterDelete,
  mergePdfs,
  rotatePdf,
  selectPages,
  splitGroups,
  splitPdf,
  visualToPdfMargins,
} from "@/lib/processors/pdf/organize";
import { looksEncrypted, protectPdf, unlockPdf, ALL_PERMISSIONS } from "@/lib/processors/pdf/security";
import { readPdfInfo, writePdfMetadata } from "@/lib/processors/pdf/metadata";
import { addWatermark, expandTemplate, formatNumberStyle, stampPageText, visualFrame } from "@/lib/processors/pdf/stamp";
import { detectImageMime, imagesToPdf, jpegOrientation } from "@/lib/processors/pdf/from-images";

/** Creates a PDF whose pages each say "Page N" and have distinct widths (400 + N). */
async function makePdf(pages: number, label = "Page"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([400 + i, 600]);
    p.drawText(`${label} ${i}`, { x: 50, y: 500, size: 20, font });
  }
  return doc.save();
}

async function widths(bytes: Uint8Array, password?: string) {
  const doc = await loadPdf(bytes, { password });
  return doc.getPages().map((p) => Math.round(p.getWidth()));
}

async function pageText(bytes: Uint8Array, password?: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), password, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await doc.loadingTask.destroy();
  return out;
}

describe("page ranges", () => {
  it("parses lists, ranges, open ranges and keywords", () => {
    expect(parsePageRanges("1-3, 5", 10)).toEqual([1, 2, 3, 5]);
    expect(parsePageRanges("8-", 10)).toEqual([8, 9, 10]);
    expect(parsePageRanges("-2", 10)).toEqual([1, 2]);
    expect(parsePageRanges("4-2", 10)).toEqual([4, 3, 2]);
    expect(parsePageRanges("last", 7)).toEqual([7]);
    expect(parsePageRanges("odd", 5)).toEqual([1, 3, 5]);
    expect(parsePageRanges("even", 5)).toEqual([2, 4]);
    expect(parsePageRanges("", 3)).toEqual([1, 2, 3]);
    expect(parsePageRanges("2,2,1", 3)).toEqual([2, 1]);
    expect(parsePageRanges("2,2,1", 3, { dedupe: false })).toEqual([2, 2, 1]);
  });
  it("rejects invalid or out-of-range input", () => {
    expect(() => parsePageRanges("0", 3)).toThrow(/does not exist/);
    expect(() => parsePageRanges("4", 3)).toThrow(/does not exist/);
    expect(() => parsePageRanges("abc", 3)).toThrow(/not a valid/);
  });
  it("formats page lists", () => {
    expect(formatPageRanges([5, 1, 2, 3, 9, 10])).toBe("1-3, 5, 9-10");
  });
});

describe("organize", () => {
  it("merges documents with per-file page selections", async () => {
    const a = await makePdf(3);
    const b = await makePdf(2);
    const merged = await mergePdfs([{ bytes: a }, { bytes: b, pages: [2] }]);
    expect(await widths(merged)).toEqual([401, 402, 403, 402]);
  });

  it("computes split groups", () => {
    expect(splitGroups({ kind: "each" }, 3)).toEqual([[1], [2], [3]]);
    expect(splitGroups({ kind: "every", n: 2 }, 5)).toEqual([[1, 2], [3, 4], [5]]);
    expect(groupsFromSplitPoints([2, 4], 5)).toEqual([[1, 2], [3, 4], [5]]);
    expect(groupsFromSplitPoints([], 3)).toEqual([[1, 2, 3]]);
    expect(() => splitGroups({ kind: "groups", groups: [[9]] }, 3)).toThrow();
  });

  it("splits into separate files", async () => {
    const parts = await splitPdf(await makePdf(5), [[1, 2], [5]]);
    expect(parts).toHaveLength(2);
    expect(await widths(parts[0])).toEqual([401, 402]);
    expect(await widths(parts[1])).toEqual([405]);
  });

  it("rotates selected pages relative to their current rotation", async () => {
    const src = await PDFDocument.load(await makePdf(3));
    src.getPage(1).setRotation(degrees(90));
    const out = await rotatePdf(
      await src.save(),
      new Map([
        [1, 90],
        [2, 270],
      ]),
    );
    const doc = await PDFDocument.load(out);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 0, 0]);
  });

  it("deletes, extracts and reorders pages", async () => {
    const src = await makePdf(5);
    expect(await widths(await selectPages(src, keepAfterDelete([2, 4], 5)))).toEqual([401, 403, 405]);
    expect(await widths(await selectPages(src, [5, 1, 3]))).toEqual([405, 401, 403]);
    expect(await widths(await selectPages(src, [2, 2]))).toEqual([402, 402]);
    await expect(selectPages(src, [])).rejects.toThrow(/no pages/);
    const reordered = await selectPages(src, [5, 4, 3, 2, 1]);
    expect(await pageText(reordered)).toEqual(["Page 5", "Page 4", "Page 3", "Page 2", "Page 1"]);
  });

  it("maps visual crop margins through page rotation", () => {
    const m = { top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 };
    expect(visualToPdfMargins(m, 0)).toEqual(m);
    expect(visualToPdfMargins(m, 90)).toEqual({ left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 });
    expect(visualToPdfMargins(m, 180)).toEqual({ top: 0.3, right: 0.4, bottom: 0.1, left: 0.2 });
    expect(visualToPdfMargins(m, 270)).toEqual({ right: 0.1, bottom: 0.2, left: 0.3, top: 0.4 });
  });

  it("crops the CropBox of selected pages", async () => {
    const out = await cropPdf(await makePdf(2), { top: 0.1, right: 0, bottom: 0.1, left: 0.25 }, { pages: [1] });
    const doc = await PDFDocument.load(out);
    const box = doc.getPage(0).getCropBox();
    expect(box.x).toBeCloseTo(401 * 0.25);
    expect(box.y).toBeCloseTo(60);
    expect(box.height).toBeCloseTo(480);
    expect(doc.getPage(1).getCropBox().width).toBeCloseTo(402);
    await expect(cropPdf(await makePdf(1), { top: 0.5, right: 0, bottom: 0.5, left: 0 })).rejects.toThrow();
  });
});

describe("security", () => {
  it("protects with AES-256 and unlocks with the password", async () => {
    const { bytes: enc } = await protectPdf(await makePdf(2), { userPassword: "s3cret", permissions: { ...ALL_PERMISSIONS, copying: false } });
    expect(looksEncrypted(enc)).toBe(true);
    await expect(loadPdf(enc)).rejects.toSatisfy((e: unknown) => isPdfPasswordError(e) && !(e as { incorrect: boolean }).incorrect);
    await expect(loadPdf(enc, { password: "nope" })).rejects.toSatisfy((e: unknown) => isPdfPasswordError(e) && (e as { incorrect: boolean }).incorrect);
    expect(await pageText(enc, "s3cret")).toEqual(["Page 1", "Page 2"]);
    const plain = await unlockPdf(enc, "s3cret");
    expect(looksEncrypted(plain)).toBe(false);
    expect(await pageText(plain)).toEqual(["Page 1", "Page 2"]);
  });

  it("removes owner-only restrictions without a password", async () => {
    const { bytes: enc } = await protectPdf(await makePdf(1), { userPassword: "", ownerPassword: "owner", permissions: { ...ALL_PERMISSIONS, printing: "none" } });
    expect(looksEncrypted(enc)).toBe(true);
    const plain = await unlockPdf(enc);
    expect(looksEncrypted(plain)).toBe(false);
    expect(await widths(plain)).toEqual([401]);
  });
});

describe("metadata", () => {
  it("writes, reads and clears document info", async () => {
    const created = new Date("2020-05-01T10:00:00Z");
    const out = await writePdfMetadata(await makePdf(1), {
      title: "Quarterly report",
      author: "Ada",
      subject: "Finance",
      keywords: "q1, budget planning",
      creator: "",
      producer: "UtilityHub",
      creationDate: created,
      modificationDate: null,
    });
    const info = await readPdfInfo(out);
    expect(info.title).toBe("Quarterly report");
    expect(info.author).toBe("Ada");
    expect(info.keywords).toBe("q1, budget planning");
    expect(info.creator).toBe("");
    expect(info.creationDate?.toISOString()).toBe(created.toISOString());
    expect(info.modificationDate).toBeNull();
    expect(info.pageCount).toBe(1);
    expect(info.hasXmp).toBe(false);
  });
});

describe("stamping", () => {
  it("maps visual points through rotation", () => {
    const box = { x: 0, y: 0, width: 100, height: 200 };
    expect(visualFrame(box, 0).toPdf(10, 20)).toEqual({ x: 10, y: 20 });
    const f90 = visualFrame(box, 90);
    expect([f90.width, f90.height]).toEqual([200, 100]);
    // Visual bottom-left of a page rotated 90° clockwise is the PDF's bottom-right corner.
    expect(f90.toPdf(0, 0)).toEqual({ x: 100, y: 0 });
    expect(visualFrame(box, 180).toPdf(0, 0)).toEqual({ x: 100, y: 200 });
    expect(visualFrame(box, 270).toPdf(0, 0)).toEqual({ x: 0, y: 200 });
  });

  it("formats numbers and templates", () => {
    expect(formatNumberStyle(14, "roman")).toBe("xiv");
    expect(formatNumberStyle(2024, "roman-upper")).toBe("MMXXIV");
    expect(formatNumberStyle(28, "alpha")).toBe("ab");
    expect(expandTemplate("Page {n} of {total} – {filename}", { page: 2, total: 9, filename: "a.pdf" })).toBe("Page 2 of 9 – a.pdf");
  });

  it("adds page numbers that pdf.js can read", async () => {
    const { bytes } = await stampPageText(await makePdf(3), {
      stamps: (n, total) => [{ text: `Page ${n} of ${total}`, v: "bottom", h: "center" }],
      pages: [2, 3],
    });
    const text = await pageText(bytes);
    expect(text[0]).not.toContain("of 3");
    expect(text[1]).toContain("Page 2 of 3");
    expect(text[2]).toContain("Page 3 of 3");
  });

  it("adds a text watermark, optionally behind the content", async () => {
    const { bytes, replacedChars } = await addWatermark(await makePdf(2), {
      kind: "text",
      text: "CONFIDENTIAL ✓",
      opacity: 0.3,
      angle: 45,
      position: "center",
      behind: true,
    });
    expect(replacedChars).toBe(0); // ✓ is transliterated
    const text = await pageText(bytes);
    expect(text[0]).toContain("CONFIDENTIAL");
    const doc = await PDFDocument.load(bytes);
    const contents = doc.getPage(0).node.Contents();
    expect(contents).toBeDefined();
    expect(doc.getPage(0).node.Resources()?.get(PDFName.of("ExtGState"))).toBeDefined();
  });
});

describe("images to PDF", () => {
  // 1×1 red PNG
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );
  it("detects formats and EXIF orientation", () => {
    expect(detectImageMime(png)).toBe("image/png");
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    // Minimal JPEG with an EXIF APP1 block carrying Orientation = 6 (big-endian TIFF).
    const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0];
    const app1 = [0xff, 0xe1, 0, exif.length + 2, ...exif];
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xda]))).toBe(6);
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toBe(1);
  });
  it("creates one page per image", async () => {
    const fit = await imagesToPdf([{ bytes: png, mime: "image/png" }, { bytes: png, mime: "image/png" }], { pageSize: "fit", orientation: "auto", margin: 0, dpi: 72 });
    expect(await widths(fit)).toEqual([1, 1]);
    const a4 = await imagesToPdf([{ bytes: png, mime: "image/png" }], { pageSize: "a4", orientation: "landscape", margin: 20 });
    expect(await widths(a4)).toEqual([842]);
  });
});
