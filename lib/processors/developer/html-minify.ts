/**
 * Conservative HTML minifier. Pure (no DOM), so it runs in tests and workers.
 *
 * - <pre>, <textarea>, <script> and <style> contents are preserved byte for byte
 *   (optionally passed through CSS/JS minifier callbacks).
 * - Comments are removed, except IE conditional comments and <!--! ... --> "keep" comments.
 * - Whitespace runs in text collapse to one space; whitespace around block-level tags
 *   is removed. Whitespace between inline elements is kept as a single space, because
 *   removing it would change rendering (e.g. "<b>a</b> <i>b</i>").
 * - Inside tags, whitespace between attributes is normalised; attribute values are untouched.
 */

const RAW = ["pre", "textarea", "script", "style"] as const;

const BLOCK = new Set(
  "html head body title meta link base script style noscript template div p ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col section article aside header footer nav main h1 h2 h3 h4 h5 h6 hr br form fieldset legend figure figcaption blockquote address details summary dialog option optgroup select iframe video audio source track canvas svg pre textarea"
    .split(" "),
);

export interface HtmlMinifyOptions {
  removeComments?: boolean;
  /** Remove whitespace between all tags, even inline ones (may change rendering). */
  aggressiveWhitespace?: boolean;
  /** Remove quotes around simple attribute values (a-z0-9-_. only). */
  removeAttributeQuotes?: boolean;
  /** Drop type="text/javascript" and type="text/css" (HTML5 defaults). */
  removeDefaultTypes?: boolean;
}

export interface HtmlMinifyTransforms {
  css?: (code: string) => string | Promise<string>;
  js?: (code: string) => string | Promise<string>;
}

function normalizeTag(tag: string, opts: HtmlMinifyOptions): string {
  let t = tag
    .split(/("[^"]*"|'[^']*')/)
    .map((p, i) => (i % 2 ? p : p.replace(/\s+/g, " ").replace(/\s*=\s*/g, "=")))
    .join("")
    .replace(/\s*(\/?)>$/, "$1>")
    .replace(/^<\s+/, "<");
  if (opts.removeDefaultTypes) t = t.replace(/\s+type=(["'])text\/(?:javascript|css)\1/i, "");
  if (opts.removeAttributeQuotes) t = t.replace(/=(["'])([A-Za-z0-9\-_.:]+)\1(?=[\s>]|\/>)/g, (m, _q, v) => (/\/$/.test(v) ? m : `=${v}`));
  return t;
}

function tagName(tag: string): string {
  const m = /^<\/?\s*([A-Za-z][\w:-]*)/.exec(tag);
  return m ? m[1].toLowerCase() : "";
}

type Seg = { kind: "raw"; open: string; body: string; close: string; name: string } | { kind: "html"; text: string } | { kind: "comment"; text: string };

function segment(html: string): Seg[] {
  const re = new RegExp(`<!--[\\s\\S]*?-->|<(${RAW.join("|")})(?=[\\s>/])[^>]*>([\\s\\S]*?)</\\1\\s*>`, "gi");
  const segs: Seg[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) segs.push({ kind: "html", text: html.slice(last, m.index) });
    if (m[0].startsWith("<!--")) segs.push({ kind: "comment", text: m[0] });
    else {
      const openEnd = m[0].indexOf(">") + 1;
      const closeStart = m[0].lastIndexOf("</");
      segs.push({ kind: "raw", name: m[1].toLowerCase(), open: m[0].slice(0, openEnd), body: m[0].slice(openEnd, closeStart), close: m[0].slice(closeStart) });
    }
    last = re.lastIndex;
  }
  if (last < html.length) segs.push({ kind: "html", text: html.slice(last) });
  return segs;
}

function minifyMarkup(text: string, opts: HtmlMinifyOptions): string {
  // Split into tags and text, honouring quotes inside tags.
  const parts = text.split(/(<[A-Za-z/!][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>)/);
  return parts
    .map((p, i) => {
      if (i % 2) return p.startsWith("<!") ? p : normalizeTag(p, opts);
      return p.replace(/\s+/g, " ");
    })
    .join("");
}

function isJsType(openTag: string): boolean {
  const m = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(openTag);
  if (!m) return true;
  return /^(?:text\/javascript|application\/javascript|module|text\/ecmascript)$/i.test(m[1]);
}

const PH = "uh-raw-7f3a-";

export async function minifyHtml(html: string, opts: HtmlMinifyOptions = {}, transforms: HtmlMinifyTransforms = {}): Promise<string> {
  const removeComments = opts.removeComments ?? true;
  const segs = segment(html);
  const out: string[] = [];
  // Raw blocks and kept comments are swapped for placeholder tags so the whitespace
  // passes below can never touch their contents.
  const held: { text: string; name: string }[] = [];
  const hold = (text: string, name: string) => {
    held.push({ text, name });
    return `<${PH}${held.length - 1}>`;
  };
  for (const s of segs) {
    if (s.kind === "comment") {
      const keep = !removeComments || /^<!--\s*\[if|^<!--\s*<!\[endif|^<!--!/i.test(s.text);
      if (keep) out.push(hold(s.text, "#comment"));
      continue;
    }
    if (s.kind === "html") {
      out.push(minifyMarkup(s.text, opts));
      continue;
    }
    let body = s.body;
    if (s.name === "style" && transforms.css && body.trim()) body = await transforms.css(body);
    if (s.name === "script" && transforms.js && body.trim() && isJsType(s.open) && !/\ssrc\s*=/i.test(s.open)) body = await transforms.js(body);
    out.push(hold(normalizeTag(s.open, opts) + body + s.close, s.name));
  }
  const isBlock = (tag: string) => {
    const n = tagName(tag);
    if (n.startsWith(PH)) {
      const h = held[Number(n.slice(PH.length))];
      return h.name === "#comment" || (h.name !== "textarea" && BLOCK.has(h.name));
    }
    return BLOCK.has(n);
  };
  let result = out.join("");
  result = result.replace(/\s+(<\/?[A-Za-z][^>]*>)/g, (_m, tag: string) => (opts.aggressiveWhitespace || isBlock(tag) ? tag : " " + tag));
  result = result.replace(/(<\/?[A-Za-z][^>]*>)\s+/g, (_m, tag: string) => (opts.aggressiveWhitespace || isBlock(tag) ? tag : tag + " "));
  result = result.replace(/(<!DOCTYPE[^>]*>)\s+/i, "$1").trim();
  return result.replace(new RegExp(`<${PH}(\\d+)>`, "g"), (_m, i: string) => held[Number(i)].text);
}
