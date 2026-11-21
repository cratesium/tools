import { describe, expect, it } from "vitest";
import { minifyHtml } from "@/lib/processors/developer/html-minify";
import { CodeError, formatCode, minifyCss, minifyJs } from "@/lib/processors/developer/code-format";

describe("HTML minifier", () => {
  it("collapses whitespace and removes comments", async () => {
    const out = await minifyHtml("<!DOCTYPE html>\n<html>\n  <head>\n    <title> Hi </title>\n  </head>\n  <body>\n    <!-- remove me -->\n    <p>Hello   <b>big</b>   world</p>\n  </body>\n</html>\n");
    expect(out).toBe("<!DOCTYPE html><html><head><title>Hi</title></head><body><p>Hello <b>big</b> world</p></body></html>");
  });
  it("preserves <pre>, <textarea>, <script> and <style> contents exactly", async () => {
    const pre = "<pre>  line 1\n    <b>line 2</b>\n</pre>";
    const ta = "<textarea name=t>\n  keep   this\n</textarea>";
    const sc = "<script>\n  if (a <b && c> d) {  x();  }\n</script>";
    const st = "<style>\n  a   >   b { color : red }\n</style>";
    const out = await minifyHtml(`<div>\n  ${pre}\n  ${ta}\n  ${sc}\n  ${st}\n</div>`);
    expect(out).toContain(pre);
    expect(out).toContain(ta);
    expect(out).toContain(sc);
    expect(out).toContain(st);
    expect(out.startsWith("<div><pre>")).toBe(true);
  });
  it("keeps conditional and <!--! comments, or all comments when asked", async () => {
    expect(await minifyHtml("<p>a</p><!--[if IE]><p>ie</p><![endif]--><!--! license --><!-- x -->")).toBe("<p>a</p><!--[if IE]><p>ie</p><![endif]--><!--! license -->");
    expect(await minifyHtml("<p>a</p> <!-- x -->", { removeComments: false })).toBe("<p>a</p><!-- x -->");
  });
  it("normalises tags without changing attribute values", async () => {
    expect(await minifyHtml('<a   href = "x  y"\n   class="c" >t</a>')).toBe('<a href="x  y" class="c">t</a>');
  });
  it("optionally removes quotes and default types and aggressive whitespace", async () => {
    expect(await minifyHtml('<script type="text/javascript">x()</script><a href="page.html" title="a b">t</a>', { removeAttributeQuotes: true, removeDefaultTypes: true })).toBe(
      '<script>x()</script><a href=page.html title="a b">t</a>',
    );
    expect(await minifyHtml("<span>a</span> <span>b</span>", { aggressiveWhitespace: true })).toBe("<span>a</span><span>b</span>");
    expect(await minifyHtml("<span>a</span> <span>b</span>")).toBe("<span>a</span> <span>b</span>");
  });
  it("runs CSS/JS transforms on inline code only", async () => {
    const out = await minifyHtml('<style> a { color: red } </style><script src="x.js"></script><script type="application/ld+json">{ "a": 1 }</script><script> var a = 1; </script>', {}, {
      css: (c) => c.replace(/\s+/g, ""),
      js: (c) => c.trim().toUpperCase(),
    });
    expect(out).toBe('<style>a{color:red}</style><script src="x.js"></script><script type="application/ld+json">{ "a": 1 }</script><script>VAR A = 1;</script>');
  });
});

describe("CSS minifier (csso)", () => {
  it("minifies and restructures", async () => {
    expect(await minifyCss("a { color: #ff0000; margin: 0px 0px }\n/* c */\nb { color: red }")).toBe("a{margin:0}a,b{color:red}");
    expect(await minifyCss("a { color: #ff0000 } b { color: red }", { restructure: false })).toBe("a{color:red}b{color:red}");
  });
  it("keeps /*! license comments by default", async () => {
    expect(await minifyCss("/*! MIT */ a { color: red }")).toContain("/*! MIT */");
    expect(await minifyCss("/*! MIT */ a { color: red }", { keepLicenseComments: false })).toBe("a{color:red}");
  });
});

describe("JS minifier (terser)", () => {
  it("compresses and mangles", async () => {
    const out = await minifyJs("function add(first, second) {\n  // comment\n  return first + second;\n}\nconsole.log(add(1, 2));");
    expect(out).toMatch(/^function add\((\w),(\w)\)\{return \1\+\2\}console\.log\(add\(1,2\)\);$/);
  });
  it("can drop console calls and skip mangling", async () => {
    expect(await minifyJs("function f(longName){console.log(longName);return longName}", { dropConsole: true, mangle: false })).toBe("function f(longName){return longName}");
  });
  it("reports syntax errors with line and column", async () => {
    await expect(minifyJs("let a = 1;\nfunction (")).rejects.toMatchObject({ line: 2, column: 10 });
    await expect(minifyJs("let a = ;")).rejects.toBeInstanceOf(CodeError);
  });
});

describe("Prettier formatting", () => {
  it("formats HTML and preserves <pre>", async () => {
    const out = await formatCode("<div><p>hi</p><pre>  x\n y</pre></div>", "html");
    expect(out).toContain("<div>\n  <p>hi</p>");
    expect(out).toContain("  x\n y</pre>");
  });
  it("formats CSS and SCSS", async () => {
    expect(await formatCode("a{color:red;margin:0}", "css")).toBe("a {\n  color: red;\n  margin: 0;\n}\n");
    expect(await formatCode("$c: red; a{ b{color:$c} }", "css", { cssParser: "scss" })).toContain("  b {\n    color: $c;");
  });
  it("formats JavaScript with options", async () => {
    expect(await formatCode("const a = {b:1,c:\"x\"}", "javascript")).toBe('const a = { b: 1, c: "x" };\n');
    expect(await formatCode('const a = "x"', "javascript", { singleQuote: true, semi: false, tabWidth: 4 })).toBe("const a = 'x'\n");
  });
  it("formats YAML keeping comments", async () => {
    expect(await formatCode("a:   1 # note\nb:\n    - x\n", "yaml")).toBe("a: 1 # note\nb:\n  - x\n");
  });
  it("reports syntax errors with line and column", async () => {
    await expect(formatCode("const a = ;", "javascript")).rejects.toMatchObject({ line: 1, column: 11 });
    await expect(formatCode("a { color: ", "css")).rejects.toBeInstanceOf(CodeError);
  });
});
