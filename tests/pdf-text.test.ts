import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { getAllPageText, groupLines, linesToParagraphs, type PageText, type PdfjsDocLike } from "@/lib/processors/pdf/text";
import { buildSearchRegex, searchPages } from "@/lib/processors/pdf/search";
import { comparePageTexts, diffLines, pixelDiff } from "@/lib/processors/pdf/compare";
import { emptyPages, pagesToText, pageToLayoutText } from "@/lib/processors/pdf/text-export";
import { escapeHtml, pagesToPositionedHtml, pagesToSemanticHtml } from "@/lib/processors/pdf/html-export";
import { buildEpub, pagesToChapters, parseEpub, resolveZipPath } from "@/lib/processors/pdf/epub";
import { buildSearchablePdf } from "@/lib/processors/pdf/ocr";
import { decodeDataUrl, sniffImageMime, makeImageResolver } from "@/lib/processors/pdf/text-html-pdf";
import { layoutBlocks, makeSanitizer } from "@/lib/processors/pdf/layout";

async function openText(bytes: Uint8Array): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    return await getAllPageText(doc as unknown as PdfjsDocLike);
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Two pages: a heading + two paragraphs, then a two-column table. */
async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const p1 = doc.addPage([612, 792]);
  p1.drawText("Quarterly Report", { x: 72, y: 700, size: 24, font: b });
  p1.drawText("Revenue grew strongly in the third quarter across all", { x: 72, y: 660, size: 11, font: f });
  p1.drawText("regions and product lines.", { x: 72, y: 646, size: 11, font: f });
  p1.drawText("A second paragraph follows after a gap.", { x: 72, y: 610, size: 11, font: f });
  const p2 = doc.addPage([612, 792]);
  const rows = [["Region", "Sales"], ["North", "120"], ["South", "95"]];
  rows.forEach((r, i) => {
    p2.drawText(r[0], { x: 72, y: 700 - i * 18, size: 11, font: f });
    p2.drawText(r[1], { x: 300, y: 700 - i * 18, size: 11, font: f });
  });
  doc.addPage([612, 792]);
  return doc.save();
}

describe("pdf text extraction + export", () => {
  it("extracts lines, paragraphs and headings from a generated PDF", async () => {
    const pages = await openText(await samplePdf());
    expect(pages).toHaveLength(3);
    const lines = groupLines(pages[0].items).map((l) => l.text);
    expect(lines[0]).toBe("Quarterly Report");
    const paras = linesToParagraphs(groupLines(pages[0].items));
    expect(paras[0].headingLevel).toBe(1);
    expect(paras[1].text).toBe("Revenue grew strongly in the third quarter across all regions and product lines.");
    expect(paras[2].text).toBe("A second paragraph follows after a gap.");
    expect(emptyPages(pages)).toEqual([3]);
  });

  it("builds plain text in lines, paragraph and layout modes", async () => {
    const pages = await openText(await samplePdf());
    const lines = pagesToText(pages.slice(0, 1), { mode: "lines", separators: true });
    expect(lines.startsWith("--- Page 1 ---\nQuarterly Report\n")).toBe(true);
    const paras = pagesToText(pages.slice(0, 1), { mode: "paragraphs", separators: false });
    expect(paras).toContain("across all regions");
    const layout = pageToLayoutText(pages[1]).split("\n");
    expect(layout[0].indexOf("Sales")).toBe(layout[1].indexOf("120"));
  });

  it("searches with case, whole-word and cross-line matching", async () => {
    const pages = await openText(await samplePdf());
    const texts = pages.map((p) => ({ page: p.page, text: groupLines(p.items).map((l) => l.text).join("\n") }));
    expect(searchPages(texts, "revenue").total).toBe(1);
    expect(searchPages(texts, "revenue", { caseSensitive: true }).total).toBe(0);
    expect(searchPages(texts, "all regions").hits[0].page).toBe(1);
    expect(searchPages(texts, "north").hits[0]).toMatchObject({ page: 2, match: "North" });
    const plain = [{ page: 1, text: "cat category cat." }];
    expect(searchPages(plain, "cat").total).toBe(3);
    expect(searchPages(plain, "cat", { wholeWord: true }).total).toBe(2);
    expect(buildSearchRegex("  ")).toBeNull();
    expect(searchPages(plain, "a.b").total).toBe(0);
  });

  it("produces semantic and positioned HTML", async () => {
    const pages = await openText(await samplePdf());
    const sem = pagesToSemanticHtml(pages, { title: "R & D" });
    expect(sem).toContain("<title>R &amp; D</title>");
    expect(sem).toContain("<h1>Quarterly Report</h1>");
    expect(sem).toContain('<section class="page" id="page-2">');
    const pos = pagesToPositionedHtml(pages, { backgrounds: ["data:image/png;base64,AAAA"] });
    expect(pos).toContain('class="page with-bg"');
    expect(pos).toMatch(/left:72\.00pt;top:\d+\.\d+pt;font-size:24\.00pt">Quarterly Report<\/span>/);
    expect(escapeHtml(`<a href="x">'`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;");
  });
});

describe("compare", () => {
  it("diffs lines with LCS", () => {
    const ops = diffLines(["a", "b", "c", "d"], ["a", "x", "c", "d", "e"]);
    expect(ops.map((o) => `${o.type[0]}${o.text}`)).toEqual(["sa", "db", "ax", "sc", "sd", "ae"]);
    expect(diffLines(["Hello  World"], ["hello world"], { ignoreCase: true, ignoreWhitespace: true })).toEqual([{ type: "same", text: "hello world" }]);
  });
  it("compares page texts including missing pages", () => {
    const r = comparePageTexts(["one\ntwo", "same"], ["one\nthree", "same", "extra"]);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ added: 1, removed: 1 });
    expect(r[1]).toMatchObject({ added: 0, removed: 0 });
    expect(r[2].missing).toBe("a");
  });
  it("computes a pixel diff", () => {
    const a = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const b = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    const d = pixelDiff(a, b, 2, 1);
    expect(d.changed).toBe(1);
    expect(d.ratio).toBe(0.5);
    expect(Array.from(d.data.slice(4, 8))).toEqual([230, 30, 30, 255]);
  });
});

describe("epub", () => {
  it("splits chapters and round-trips through build + parse", async () => {
    const pages = await openText(await samplePdf());
    const chapters = pagesToChapters(pages);
    expect(chapters[0].title).toBe("Quarterly Report");
    expect(pagesToChapters(pages, { split: "pages", pagesPerChapter: 1 }).map((c) => c.title)).toEqual(["Page 1", "Page 2"]);
    const bytes = await buildEpub({ title: "Test & Book", author: "Ann", language: "en" }, chapters);
    // mimetype must be the first entry, stored uncompressed.
    expect(new TextDecoder().decode(bytes.subarray(30, 38))).toBe("mimetype");
    expect(new TextDecoder().decode(bytes.subarray(38, 58))).toBe("application/epub+zip");
    expect(bytes[8] | (bytes[9] << 8)).toBe(0);
    const parsed = await parseEpub(bytes);
    expect(parsed.title).toBe("Test & Book");
    expect(parsed.author).toBe("Ann");
    expect(parsed.documents.length).toBe(chapters.length);
    expect(parsed.documents[0].html).toContain("<h1>Quarterly Report</h1>");
    expect(parsed.mediaType("OEBPS/style.css")).toBe("text/css");
  });
  it("resolves zip paths and rejects non-epub input", async () => {
    expect(resolveZipPath("OEBPS/text/ch1.xhtml", "../images/a%20b.png#x")).toBe("OEBPS/images/a b.png");
    expect(resolveZipPath("ch1.xhtml", "img.png")).toBe("img.png");
    await expect(parseEpub(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a valid EPUB/);
  });
});

describe("ocr text layer", () => {
  it("builds a PDF whose invisible text is extractable", async () => {
    const { bytes, replacedChars } = await buildSearchablePdf([
      { width: 612, height: 792, imageWidth: 1224, imageHeight: 1584, words: [
        { text: "Scanned", x0: 144, y0: 200, x1: 400, y1: 240 },
        { text: "invoice", x0: 420, y0: 200, x1: 640, y1: 240 },
        { text: "日本", x0: 660, y0: 200, x1: 720, y1: 240 },
      ] },
    ]);
    expect(replacedChars).toBe(2);
    const pages = await openText(bytes);
    const text = groupLines(pages[0].items).map((l) => l.text).join(" ");
    expect(text).toContain("Scanned");
    expect(text).toContain("invoice");
    const scanned = pages[0].items.find((i) => i.str.includes("Scanned"))!;
    expect(scanned.x).toBeCloseTo(72, 0);
    // The text layer must use rendering mode 3 (invisible). Content streams are compressed, so decode them first.
    const lib = await import("@cantoo/pdf-lib");
    const { pageContentBytes } = await import("@/lib/processors/pdf/edit-utils");
    const doc = await lib.PDFDocument.load(bytes);
    expect(Buffer.from(pageContentBytes(lib, doc.getPage(0))).toString("latin1")).toMatch(/3 Tr/);
  });
});

describe("html-to-pdf helpers", () => {
  it("decodes data URLs and sniffs images", () => {
    const png = decodeDataUrl("data:image/png;base64,iVBORw0KGgo=")!;
    expect(sniffImageMime(png)).toBe("image/png");
    expect(new TextDecoder().decode(decodeDataUrl("data:text/plain,hi%20there")!)).toBe("hi there");
    expect(decodeDataUrl("https://x")).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toBe("image/jpeg");
    expect(sniffImageMime(new TextEncoder().encode("<svg xmlns='x'></svg>"))).toBe("image/svg+xml");
  });
  it("counts embedded and skipped images", async () => {
    const { resolve, stats } = makeImageResolver(async (s) => (s === "ok" ? new Uint8Array([0xff, 0xd8, 0xff, 1]) : s === "gif" ? new TextEncoder().encode("GIF89a") : null));
    const el = {} as Element;
    expect(await resolve("ok", el)).toMatchObject({ mime: "image/jpeg" });
    expect(await resolve("gif", el)).toBeNull();
    expect(await resolve("missing", el)).toBeNull();
    expect(stats).toEqual({ embedded: 1, skipped: 2 });
  });
});

describe("layout engine", () => {
  it("sanitizes characters outside the standard fonts", () => {
    const s = makeSanitizer(new Set([..."abc ?"].map((c) => c.codePointAt(0)!)));
    expect(s.sanitize("a b ā 中")).toBe("a b a ?");
    expect(s.count()).toBe(1);
  });
  it("lays out headings, lists, tables and paginates long content", async () => {
    const long = Array.from({ length: 120 }, (_, i) => `Paragraph number ${i} with enough words to wrap across the line width of the page.`);
    const res = await layoutBlocks([
      { type: "heading", level: 1, runs: [{ text: "Title" }] },
      { type: "list", ordered: true, items: [{ runs: [{ text: "first" }], depth: 0 }, { runs: [{ text: "nested" }], depth: 1 }] },
      { type: "table", header: true, rows: [["Name", "Qty"], ["Apple", "3"]] },
      { type: "pre", text: "  indented code\nline 2" },
      ...long.map((t) => ({ type: "paragraph" as const, runs: [{ text: t }] })),
      { type: "pagebreak" },
      { type: "paragraph", runs: [{ text: "Last page", bold: true }] },
    ], { title: "Layout test" });
    expect(res.pages).toBeGreaterThan(3);
    const pages = await openText(res.bytes);
    const first = groupLines(pages[0].items).map((l) => l.text);
    expect(first[0]).toBe("Title");
    expect(first).toContain("1. first");
    expect(first.some((l) => l.includes("Name") && l.includes("Qty"))).toBe(true);
    expect(groupLines(pages[pages.length - 1].items).map((l) => l.text)).toEqual(["Last page"]);
  });
});
