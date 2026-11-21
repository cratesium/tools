// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { computeDiff, diffStats, inlineChanges, sideBySide, unifiedPatch } from "@/lib/processors/text/diff";
import { firstHeading, htmlDocument, htmlToMarkdown, markdownToHtml, sanitizeHtml } from "@/lib/processors/text/markdown";

describe("text diff", () => {
  const a = "one\ntwo\nthree\nfour";
  const b = "one\n2\nthree\nfour\nfive";
  it("line diff with stats", () => {
    const parts = computeDiff(a, b, { granularity: "lines", ignoreCase: false, ignoreWhitespace: false });
    expect(parts.map((p) => p.type)).toEqual(["equal", "removed", "added", "equal", "added"]);
    expect(diffStats(parts, "lines")).toEqual({ added: 2, removed: 1, unchanged: 3, unit: "lines", identical: false });
  });
  it("ignore case / whitespace", () => {
    const o = { granularity: "lines", ignoreCase: true, ignoreWhitespace: true } as const;
    expect(diffStats(computeDiff("Hello  World\nX", "hello world \nx", o), "lines").identical).toBe(true);
    expect(diffStats(computeDiff("Hello", "hello", { ...o, ignoreCase: false }), "lines").identical).toBe(false);
  });
  it("treats a missing final newline as identical", () => {
    const o = { granularity: "lines", ignoreCase: false, ignoreWhitespace: false } as const;
    expect(diffStats(computeDiff("a\nb", "a\nb\n", o), "lines").identical).toBe(true);
  });
  it("word and char granularity", () => {
    const w = computeDiff("the quick fox", "the slow fox", { granularity: "words", ignoreCase: false, ignoreWhitespace: false });
    expect(w.filter((p) => p.type !== "equal").map((p) => [p.type, p.value])).toEqual([
      ["removed", "quick"],
      ["added", "slow"],
    ]);
    const c = computeDiff("cat", "cut", { granularity: "chars", ignoreCase: false, ignoreWhitespace: false });
    expect(diffStats(c, "chars")).toMatchObject({ added: 1, removed: 1, unchanged: 2 });
  });
  it("side-by-side rows pair changes and number lines", () => {
    const rows = sideBySide(computeDiff(a, b, { granularity: "lines", ignoreCase: false, ignoreWhitespace: false }));
    expect(rows).toEqual([
      { type: "equal", leftNo: 1, rightNo: 1, left: "one", right: "one" },
      { type: "changed", leftNo: 2, rightNo: 2, left: "two", right: "2" },
      { type: "equal", leftNo: 3, rightNo: 3, left: "three", right: "three" },
      { type: "equal", leftNo: 4, rightNo: 4, left: "four", right: "four" },
      { type: "added", leftNo: null, rightNo: 5, left: null, right: "five" },
    ]);
    const inl = inlineChanges("total = 10", "total = 12");
    expect(inl.left.find((p) => p.type === "removed")?.value).toBe("10");
    expect(inl.right.find((p) => p.type === "added")?.value).toBe("12");
  });
  it("unified patch", () => {
    const p = unifiedPatch(a, b, { ignoreCase: false, ignoreWhitespace: false });
    expect(p).toContain("--- original.txt");
    expect(p).toContain("+++ changed.txt");
    expect(p).toContain("-two");
    expect(p).toContain("+2");
    expect(p).toContain("@@ -1,4 +1,5 @@");
  });
});

describe("markdown", () => {
  it("renders GFM", () => {
    const html = markdownToHtml("# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n~~gone~~");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<del>gone</del>");
    expect(markdownToHtml("a\nb", { gfm: true, breaks: true })).toContain("<br>");
  });
  it("sanitizes dangerous HTML", async () => {
    const raw = markdownToHtml('Hi <img src=x onerror="alert(1)"> <script>alert(2)</script> [x](javascript:alert(3))');
    const clean = await sanitizeHtml(raw);
    expect(clean).not.toMatch(/onerror|<script|javascript:/i);
    expect(clean).toContain("<img");
  });
  it("wraps a document and finds the title", () => {
    expect(htmlDocument("<p>x</p>", "A <b>")).toContain("<title>A &lt;b&gt;</title>");
    expect(firstHeading("intro\n## Getting started ##\n")).toBe("Getting started");
  });
  it("converts HTML to markdown, with GFM tables and strikethrough", async () => {
    const md = await htmlToMarkdown(
      "<h2>Hi</h2><p>Some <strong>bold</strong> and <em>it</em> <del>old</del></p><ul><li>one</li><li>two</li></ul>" +
        "<pre><code>x = 1</code></pre><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2|3</td></tr></tbody></table>" +
        "<script>alert(1)</script>",
    );
    expect(md).toContain("## Hi");
    expect(md).toContain("**bold**");
    expect(md).toContain("_it_");
    expect(md).toContain("~~old~~");
    expect(md).toMatch(/^-\s+one$/m);
    expect(md).toContain("```\nx = 1\n```");
    expect(md).toContain("| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
    expect(md).not.toContain("alert");
  });
});
