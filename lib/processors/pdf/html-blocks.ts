/**
 * Converts semantic HTML/XHTML (from mammoth, EPUB chapters or user HTML) into layout blocks.
 * Requires a DOM (DOMParser): runs in the browser, and in tests under jsdom.
 * CSS is not interpreted except `page-break-before/after` and `text-align` on blocks.
 */
import type { Align, Block, Run } from "./layout";

export type ImageResolver = (src: string, el: Element) => Promise<{ data: Uint8Array; mime: "image/png" | "image/jpeg" } | null>;

export interface HtmlToBlocksOptions {
  resolveImage?: ImageResolver;
  /** Parse as XHTML (EPUB). */
  xml?: boolean;
}

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
  "section", "table", "ul", "summary", "center", "img", "svg",
]);
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "title", "meta", "link", "iframe", "object", "button", "select", "input", "textarea"]);

function alignOf(el: Element): Align | undefined {
  const style = (el.getAttribute("style") || "").toLowerCase();
  const m = style.match(/text-align\s*:\s*(left|center|right)/);
  if (m) return m[1] as Align;
  const a = (el.getAttribute("align") || "").toLowerCase();
  if (a === "center" || a === "right" || a === "left") return a;
  if (el.tagName.toLowerCase() === "center") return "center";
  return undefined;
}

function pageBreak(el: Element, when: "before" | "after"): boolean {
  const style = (el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
  return style.includes(`page-break-${when}:always`) || style.includes(`break-${when}:page`);
}

/** Inline runs of an element (text with bold/italic/code/link flags). */
export function inlineRuns(node: Node, inherited: Omit<Run, "text"> = {}): Run[] {
  const runs: Run[] = [];
  const walk = (n: Node, fmt: Omit<Run, "text">) => {
    if (n.nodeType === 3) {
      const t = (n.textContent || "").replace(/\s+/g, " ");
      if (t) runs.push({ text: t, ...fmt });
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase().replace(/^.*:/, "");
    if (SKIP_TAGS.has(tag)) return;
    if (tag === "br") {
      runs.push({ text: "\n", ...fmt });
      return;
    }
    const next = { ...fmt };
    if (tag === "b" || tag === "strong" || tag === "th") next.bold = true;
    if (tag === "i" || tag === "em" || tag === "cite" || tag === "dfn") next.italic = true;
    if (tag === "code" || tag === "kbd" || tag === "samp" || tag === "tt") next.code = true;
    if (tag === "a" && el.getAttribute("href")) next.link = el.getAttribute("href")!;
    const style = (el.getAttribute("style") || "").toLowerCase();
    if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) next.bold = true;
    if (/font-style\s*:\s*italic/.test(style)) next.italic = true;
    if (tag === "sup") runs.push({ text: "^", ...fmt });
    el.childNodes.forEach((c) => walk(c, next));
  };
  walk(node, inherited);
  // Trim leading/trailing whitespace of the whole run list.
  while (runs.length && !runs[0].text.trim() && runs[0].text !== "\n") runs.shift();
  if (runs.length) runs[0] = { ...runs[0], text: runs[0].text.replace(/^ +/, "") };
  while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
  if (runs.length) {
    const l = runs.length - 1;
    runs[l] = { ...runs[l], text: runs[l].text.replace(/ +$/, "") };
  }
  return runs;
}

function plainText(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

export async function htmlToBlocks(html: string, opts: HtmlToBlocksOptions = {}): Promise<Block[]> {
  const parser = new DOMParser();
  let doc = parser.parseFromString(html, opts.xml ? "application/xhtml+xml" : "text/html");
  if (opts.xml && doc.getElementsByTagName("parsererror").length) doc = parser.parseFromString(html, "text/html");
  const body = doc.body ?? doc.documentElement;
  const blocks: Block[] = [];

  const pushImage = async (img: Element) => {
    const src = img.getAttribute("src") || img.getAttribute("xlink:href") || img.getAttribute("href") || "";
    if (!src || !opts.resolveImage) return;
    try {
      const res = await opts.resolveImage(src, img);
      if (!res) return;
      const w = Number(img.getAttribute("width")) || undefined;
      const h = Number(img.getAttribute("height")) || undefined;
      blocks.push({
        type: "image",
        data: res.data,
        mime: res.mime,
        width: w ? w * 0.75 : undefined,
        height: h ? h * 0.75 : undefined,
        alt: img.getAttribute("alt") || undefined,
      });
    } catch {
      /* unresolvable images are skipped */
    }
  };

  const listItems = (list: Element, depth: number, out: { runs: Run[]; depth: number }[]) => {
    for (const li of Array.from(list.children)) {
      if (li.tagName.toLowerCase() !== "li") continue;
      const clone = li.cloneNode(true) as Element;
      clone.querySelectorAll("ul,ol").forEach((n) => n.remove());
      const runs = inlineRuns(clone);
      out.push({ runs: runs.length ? runs : [{ text: "" }], depth });
      for (const sub of Array.from(li.children)) {
        const t = sub.tagName.toLowerCase();
        if (t === "ul" || t === "ol") listItems(sub, depth + 1, out);
      }
    }
  };

  const walkChildren = async (el: Element) => {
    let inline: Node[] = [];
    const flushInline = () => {
      if (!inline.length) return;
      const wrapper = doc.createElement("span");
      inline.forEach((n) => wrapper.appendChild(n.cloneNode(true)));
      const runs = inlineRuns(wrapper);
      if (runs.some((r) => r.text.trim())) blocks.push({ type: "paragraph", runs, align: alignOf(el) });
      inline = [];
    };
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1) {
        const tag = (child as Element).tagName.toLowerCase().replace(/^.*:/, "");
        if (SKIP_TAGS.has(tag)) continue;
        if (BLOCK_TAGS.has(tag) || (child as Element).querySelector?.("img,table,p,div,ul,ol,h1,h2,h3,h4,h5,h6,pre,blockquote")) {
          flushInline();
          await walkBlock(child as Element);
          continue;
        }
      }
      inline.push(child);
    }
    flushInline();
  };

  const walkBlock = async (el: Element) => {
    const tag = el.tagName.toLowerCase().replace(/^.*:/, "");
    if (pageBreak(el, "before")) blocks.push({ type: "pagebreak" });
    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const runs = inlineRuns(el);
        if (runs.length) blocks.push({ type: "heading", level: Number(tag[1]), runs, align: alignOf(el) });
        for (const img of Array.from(el.querySelectorAll("img"))) await pushImage(img);
        break;
      }
      case "p":
      case "dt":
      case "dd":
      case "figcaption":
      case "summary":
      case "address": {
        if (el.querySelector("img")) {
          await walkChildren(el);
          break;
        }
        const runs = inlineRuns(el, tag === "dt" ? { bold: true } : {});
        if (runs.some((r) => r.text.trim())) blocks.push({ type: "paragraph", runs, align: alignOf(el) });
        break;
      }
      case "ul":
      case "ol": {
        const items: { runs: Run[]; depth: number }[] = [];
        listItems(el, 0, items);
        if (items.length) blocks.push({ type: "list", ordered: tag === "ol", items, start: Number(el.getAttribute("start")) || 1 });
        break;
      }
      case "pre":
        blocks.push({ type: "pre", text: el.textContent || "" });
        break;
      case "blockquote": {
        const runs = inlineRuns(el, { italic: true });
        if (runs.length) blocks.push({ type: "quote", runs });
        break;
      }
      case "hr":
        blocks.push({ type: "hr" });
        break;
      case "img":
        await pushImage(el);
        break;
      case "svg":
        break;
      case "table": {
        const rows: string[][] = [];
        let header = false;
        el.querySelectorAll("tr").forEach((tr, i) => {
          const cells = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName));
          if (i === 0 && cells.length && cells.every((c) => c.tagName.toLowerCase() === "th")) header = true;
          rows.push(cells.map(plainText));
        });
        if (rows.length) blocks.push({ type: "table", rows, header });
        break;
      }
      default:
        await walkChildren(el);
    }
    if (pageBreak(el, "after")) blocks.push({ type: "pagebreak" });
  };

  await walkChildren(body);
  return blocks;
}

export function documentTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() || undefined : undefined;
}
