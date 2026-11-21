// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToBlocks, inlineRuns } from "@/lib/processors/pdf/html-blocks";
import { epubToPdf, htmlToPdf } from "@/lib/processors/pdf/text-html-pdf";
import { buildEpub, parseEpub } from "@/lib/processors/pdf/epub";
import { PDFDocument } from "@cantoo/pdf-lib";

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("htmlToBlocks", () => {
  it("maps semantic HTML to blocks", async () => {
    const blocks = await htmlToBlocks(`<h1>Title</h1><p>Hello <b>bold</b> <em>it</em><br>next</p>
      <ul><li>One<ul><li>Sub</li></ul></li><li>Two</li></ul><ol start="3"><li>Three</li></ol>
      <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
      <pre>  code</pre><blockquote>Quote</blockquote><hr><div style="page-break-before:always">After</div>
      <script>alert(1)</script>loose text`);
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(["heading", "paragraph", "list", "list", "table", "pre", "quote", "hr", "pagebreak", "paragraph", "paragraph"]);
    const p = blocks[1] as Extract<(typeof blocks)[number], { type: "paragraph" }>;
    expect(p.runs.find((r) => r.text === "bold")?.bold).toBe(true);
    expect(p.runs.some((r) => r.text === "\n")).toBe(true);
    const ul = blocks[2] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(ul.items.map((i) => i.depth)).toEqual([0, 1, 0]);
    expect((blocks[3] as { start?: number }).start).toBe(3);
    expect((blocks[4] as { header?: boolean; rows: string[][] }).rows).toEqual([["A", "B"], ["1", "2"]]);
    expect(JSON.stringify(blocks)).not.toContain("alert");
  });
  it("collects inline runs with links", () => {
    const div = document.createElement("div");
    div.innerHTML = ` <a href="https://e.x">link</a> and <code>x</code> `;
    const runs = inlineRuns(div);
    expect(runs[0]).toMatchObject({ text: "link", link: "https://e.x" });
    expect(runs[runs.length - 1]).toMatchObject({ text: "x", code: true });
  });
});

describe("htmlToPdf", () => {
  it("renders HTML with a data: image into a PDF", async () => {
    const res = await htmlToPdf(`<html><head><title>Doc</title></head><body><h1>Hi</h1><p>Text</p><img src="data:image/png;base64,${PNG_1x1}"><img src="https://example.invalid/x.png"></body></html>`);
    expect(res.images).toEqual({ embedded: 1, skipped: 1 });
    const doc = await PDFDocument.load(res.bytes);
    expect(doc.getTitle()).toBe("Doc");
    expect(doc.getPageCount()).toBe(1);
  });
  it("rejects empty HTML", async () => {
    await expect(htmlToPdf("<p>   </p>")).rejects.toThrow(/No readable content/);
  });
});

describe("epubToPdf", () => {
  it("converts an EPUB with chapters into a PDF with page breaks", async () => {
    const epub = await buildEpub({ title: "Book", author: "Me" }, [
      { title: "One", body: "<h1>One</h1><p>First chapter.</p>" },
      { title: "Two", body: "<h1>Two</h1><p>Second chapter.</p>" },
    ]);
    const parsed = await parseEpub(epub);
    let progress = 0;
    const res = await epubToPdf(parsed, { onProgress: (d) => (progress = d) });
    expect(progress).toBe(2);
    expect(res.pages).toBe(2);
    const doc = await PDFDocument.load(res.bytes);
    expect(doc.getTitle()).toBe("Book");
    expect(doc.getAuthor()).toBe("Me");
  });
});
