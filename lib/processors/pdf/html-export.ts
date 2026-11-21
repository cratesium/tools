/** PDF → HTML: semantic (reflowed) or positioned (absolute) markup from extracted text. */
import { bodyFontSize, groupLines, linesToParagraphs, type PageText } from "./text";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const BASE_CSS = `body{margin:0;background:#f4f4f5;color:#111;font-family:Helvetica,Arial,sans-serif}`;

function shell(title: string, css: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="UtilityHub PDF to HTML">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}${css}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Reflowed HTML: headings and paragraphs detected from font sizes and line spacing. */
export function pagesToSemanticHtml(pages: PageText[], { title = "Document", pageMarkers = true }: { title?: string; pageMarkers?: boolean } = {}): string {
  const allLines = pages.flatMap((p) => groupLines(p.items));
  const body = bodyFontSize(allLines);
  const sections = pages.map((p) => {
    const paras = linesToParagraphs(groupLines(p.items), body);
    const inner = paras
      .map((para) => {
        const text = escapeHtml(para.text);
        return para.headingLevel ? `<h${para.headingLevel}>${text}</h${para.headingLevel}>` : `<p>${text}</p>`;
      })
      .join("\n");
    return `<section class="page" id="page-${p.page}">${pageMarkers ? `\n<div class="marker">Page ${p.page}</div>` : ""}\n${inner}\n</section>`;
  });
  const css = `main{max-width:760px;margin:0 auto;padding:32px 20px;background:#fff;line-height:1.6;font-size:16px}
h1,h2,h3{line-height:1.25;margin:1.2em 0 .5em}p{margin:0 0 1em}
.marker{font-size:12px;color:#888;border-top:1px solid #e4e4e7;padding-top:6px;margin:24px 0 12px}
section.page:first-child .marker{border-top:0;margin-top:0}`;
  return shell(title, css, `<main>\n${sections.join("\n")}\n</main>`);
}

/**
 * Positioned HTML: one absolutely positioned span per text run, in points, so the page geometry
 * matches the PDF. With a background image per page, text is kept transparent but selectable.
 */
export function pagesToPositionedHtml(
  pages: PageText[],
  { title = "Document", backgrounds }: { title?: string; backgrounds?: (string | null | undefined)[] } = {},
): string {
  const out = pages.map((p, i) => {
    const bg = backgrounds?.[i];
    const spans = p.items
      .filter((it) => it.str.trim())
      .map((it) => {
        const top = p.height - it.y - it.fontSize * 0.86;
        return `<span style="left:${it.x.toFixed(2)}pt;top:${top.toFixed(2)}pt;font-size:${it.fontSize.toFixed(2)}pt">${escapeHtml(it.str)}</span>`;
      })
      .join("\n");
    const bgImg = bg ? `<img class="bg" src="${bg}" alt="" width="100%" height="100%">` : "";
    return `<div class="page${bg ? " with-bg" : ""}" id="page-${p.page}" style="width:${p.width.toFixed(2)}pt;height:${p.height.toFixed(2)}pt">${bgImg}\n${spans}\n</div>`;
  });
  const css = `.page{position:relative;margin:24px auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15);overflow:hidden}
.page span{position:absolute;white-space:pre;line-height:1;transform-origin:0 0}
.page .bg{position:absolute;inset:0;width:100%;height:100%;user-select:none}
.page.with-bg span{color:transparent}
.page.with-bg span::selection{background:rgba(0,90,255,.3);color:transparent}`;
  return shell(title, css, out.join("\n"));
}
