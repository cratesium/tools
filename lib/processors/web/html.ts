/**
 * In-browser HTML analysis on a parsed Document (DOMParser). Used by the Meta Tag Analyzer,
 * Open Graph Preview, Website Word Counter, Link Extractor, Broken Link Checker and the
 * Sitemap crawler. Pure functions: no network access, no React.
 */

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** Resolves a possibly relative URL against the document's <base href> and the page URL. */
export function resolveUrl(href: string, doc: Document, pageUrl?: string | null): string | null {
  const baseHref = doc.querySelector("base[href]")?.getAttribute("href");
  try {
    const page = pageUrl ? new URL(pageUrl) : null;
    const base = baseHref ? new URL(baseHref, page ?? undefined) : page;
    return base ? new URL(href, base).href : new URL(href).href;
  } catch {
    return null;
  }
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function meta(doc: Document, attr: "name" | "property" | "http-equiv", key: string): string | null {
  for (const el of Array.from(doc.querySelectorAll(`meta[${attr}]`)))
    if (el.getAttribute(attr)?.toLowerCase() === key.toLowerCase()) return el.getAttribute("content");
  return null;
}

/* ------------------------------------------------------------------ */
/* Social tags (Open Graph + Twitter)                                  */
/* ------------------------------------------------------------------ */

export interface SocialTags {
  og: Record<string, string>;
  twitter: Record<string, string>;
  title: string | null;
  description: string | null;
  image: string | null;
  imageAlt: string | null;
  siteName: string | null;
  url: string | null;
  domain: string | null;
  type: string | null;
  twitterCard: string | null;
  favicon: string | null;
  themeColor: string | null;
}

export function extractSocialTags(doc: Document, pageUrl?: string | null): SocialTags {
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  for (const el of Array.from(doc.querySelectorAll("meta"))) {
    const key = (el.getAttribute("property") || el.getAttribute("name") || "").trim();
    const content = el.getAttribute("content");
    if (content == null) continue;
    const lk = key.toLowerCase();
    if (lk.startsWith("og:") && !(lk in og)) og[lk] = content.trim();
    else if (lk.startsWith("twitter:") && !(lk in twitter)) twitter[lk] = content.trim();
  }
  const title = og["og:title"] || twitter["twitter:title"] || clean(doc.querySelector("title")?.textContent) || null;
  const description = og["og:description"] || twitter["twitter:description"] || meta(doc, "name", "description") || null;
  const rawImage = og["og:image"] || og["og:image:url"] || og["og:image:secure_url"] || twitter["twitter:image"] || twitter["twitter:image:src"] || null;
  const image = rawImage ? resolveUrl(rawImage, doc, pageUrl) : null;
  const url = og["og:url"] ? resolveUrl(og["og:url"], doc, pageUrl) : (pageUrl ?? null);
  let domain: string | null = null;
  try {
    domain = url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    /* ignore */
  }
  const iconHref =
    doc.querySelector('link[rel~="icon" i]')?.getAttribute("href") ??
    doc.querySelector('link[rel="shortcut icon" i]')?.getAttribute("href") ??
    doc.querySelector('link[rel="apple-touch-icon" i]')?.getAttribute("href") ??
    (pageUrl ? "/favicon.ico" : null);
  return {
    og,
    twitter,
    title,
    description,
    image,
    imageAlt: og["og:image:alt"] || twitter["twitter:image:alt"] || null,
    siteName: og["og:site_name"] || null,
    url,
    domain,
    type: og["og:type"] || null,
    twitterCard: twitter["twitter:card"] || null,
    favicon: iconHref ? resolveUrl(iconHref, doc, pageUrl) : null,
    themeColor: meta(doc, "name", "theme-color"),
  };
}

/* ------------------------------------------------------------------ */
/* Meta tag analysis                                                   */
/* ------------------------------------------------------------------ */

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface MetaAnalysis {
  title: string | null;
  titleCount: number;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  viewport: string | null;
  charset: string | null;
  lang: string | null;
  keywords: string | null;
  author: string | null;
  generator: string | null;
  favicon: string | null;
  hreflang: { lang: string; href: string }[];
  headings: { level: number; text: string }[];
  images: { total: number; missingAlt: number; emptyAlt: number; examplesMissing: string[] };
  structuredData: { jsonLdBlocks: number; types: string[]; microdata: number };
  social: SocialTags;
  allMeta: { key: string; content: string }[];
  checks: Check[];
  score: number;
}

const between = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

export function analyzeMeta(doc: Document, pageUrl?: string | null): MetaAnalysis {
  const titles = Array.from(doc.querySelectorAll("title")).filter((t) => !t.closest("svg"));
  const title = titles.length ? clean(titles[0].textContent) : null;
  const description = meta(doc, "name", "description");
  const canonicalEl = doc.querySelector('link[rel="canonical" i]');
  const canonical = canonicalEl?.getAttribute("href") ? resolveUrl(canonicalEl.getAttribute("href")!, doc, pageUrl) : null;
  const robots = meta(doc, "name", "robots");
  const viewport = meta(doc, "name", "viewport");
  const charset =
    doc.querySelector("meta[charset]")?.getAttribute("charset") ??
    /charset=([\w-]+)/i.exec(meta(doc, "http-equiv", "content-type") ?? "")?.[1] ??
    null;
  const lang = doc.documentElement.getAttribute("lang");
  const hreflang = Array.from(doc.querySelectorAll('link[rel="alternate" i][hreflang]')).map((l) => ({
    lang: l.getAttribute("hreflang") ?? "",
    href: resolveUrl(l.getAttribute("href") ?? "", doc, pageUrl) ?? l.getAttribute("href") ?? "",
  }));
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => ({
    level: Number(h.tagName[1]),
    text: clean(h.textContent).slice(0, 200),
  }));
  const imgs = Array.from(doc.querySelectorAll("img"));
  const missing = imgs.filter((i) => !i.hasAttribute("alt"));
  const empty = imgs.filter((i) => i.hasAttribute("alt") && !i.getAttribute("alt")!.trim());
  const ldBlocks = Array.from(doc.querySelectorAll('script[type="application/ld+json" i]'));
  const ldTypes = new Set<string>();
  for (const b of ldBlocks) {
    try {
      const collect = (v: unknown): void => {
        if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          const t = o["@type"];
          if (typeof t === "string") ldTypes.add(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && ldTypes.add(x));
          if (o["@graph"]) collect(o["@graph"]);
        }
      };
      collect(JSON.parse(b.textContent ?? ""));
    } catch {
      ldTypes.add("(invalid JSON-LD)");
    }
  }
  const social = extractSocialTags(doc, pageUrl);
  const allMeta = Array.from(doc.querySelectorAll("meta"))
    .map((m) => ({
      key: m.getAttribute("name") || m.getAttribute("property") || m.getAttribute("http-equiv") || (m.hasAttribute("charset") ? "charset" : m.getAttribute("itemprop") || ""),
      content: m.getAttribute("content") ?? m.getAttribute("charset") ?? "",
    }))
    .filter((m) => m.key);

  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });

  if (!title) add("title", "Title tag", "fail", "No <title> found. Search engines show the title as the headline of your result.");
  else if (between(title.length, 30, 60)) add("title", "Title tag", "pass", `${title.length} characters, within the 30–60 range that displays fully in most results.`);
  else if (title.length < 30) add("title", "Title tag", "warn", `${title.length} characters. Short titles miss the chance to describe the page; aim for 30–60.`);
  else add("title", "Title tag", "warn", `${title.length} characters. Titles longer than ~60 characters are usually truncated in search results.`);
  if (titles.length > 1) add("title-count", "Single title", "warn", `${titles.length} <title> elements found; only the first is used.`);

  if (!description) add("description", "Meta description", "fail", "No meta description. Search engines will pick a snippet from the page text instead.");
  else if (between(description.length, 70, 160)) add("description", "Meta description", "pass", `${description.length} characters, within the recommended 70–160.`);
  else if (description.length < 70) add("description", "Meta description", "warn", `${description.length} characters. Aim for 70–160 to give searchers a useful summary.`);
  else add("description", "Meta description", "warn", `${description.length} characters. Snippets are usually cut at ~160 characters.`);

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 1) add("h1", "One H1 heading", "pass", `"${h1s[0].text.slice(0, 80)}"`);
  else if (!h1s.length) add("h1", "One H1 heading", "fail", "No <h1> found. A single descriptive H1 helps users and search engines understand the page topic.");
  else add("h1", "One H1 heading", "warn", `${h1s.length} <h1> elements. One main heading is clearer.`);

  let skipped: string | null = null;
  for (let i = 1; i < headings.length; i++)
    if (headings[i].level > headings[i - 1].level + 1) {
      skipped = `H${headings[i - 1].level} → H${headings[i].level} before "${headings[i].text.slice(0, 60)}"`;
      break;
    }
  if (headings.length) add("heading-order", "Heading hierarchy", skipped ? "warn" : "pass", skipped ? `Skipped level: ${skipped}.` : "Headings descend without skipping levels.");

  if (!canonical) add("canonical", "Canonical URL", "warn", "No rel=canonical link. Adding one prevents duplicate-URL issues (tracking parameters, http/https, trailing slashes).");
  else {
    let same = true;
    try {
      if (pageUrl) {
        const a = new URL(canonical);
        const b = new URL(pageUrl);
        same = a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
      }
    } catch {
      /* ignore */
    }
    add("canonical", "Canonical URL", same ? "pass" : "info", same ? canonical : `${canonical} (points to a different URL than the analysed page)`);
  }

  if (robots && /noindex/i.test(robots)) add("robots", "Indexable", "fail", `robots meta is "${robots}": this page asks search engines not to index it.`);
  else if (robots && /nofollow/i.test(robots)) add("robots", "Indexable", "warn", `robots meta is "${robots}": links on this page will not pass ranking signals.`);
  else add("robots", "Indexable", "pass", robots ? `robots meta: "${robots}"` : "No robots meta tag, so the default (index, follow) applies.");

  if (!viewport) add("viewport", "Mobile viewport", "fail", "No viewport meta tag. Mobile browsers will render the page at desktop width.");
  else if (/width\s*=\s*device-width/i.test(viewport)) {
    const noZoom = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport);
    add("viewport", "Mobile viewport", noZoom ? "warn" : "pass", noZoom ? `"${viewport}" disables zooming, which hurts accessibility.` : viewport);
  } else add("viewport", "Mobile viewport", "warn", `"${viewport}" does not set width=device-width.`);

  add("lang", "Language attribute", lang ? "pass" : "warn", lang ? `<html lang="${lang}">` : "No lang attribute on <html>. Screen readers and translators rely on it.");
  add("charset", "Character encoding", charset ? "pass" : "warn", charset ? charset : "No charset declared in the HTML. Declare <meta charset=\"utf-8\"> early in <head>.");

  const ogMissing = ["og:title", "og:description", "og:image"].filter((k) => !social.og[k]);
  add(
    "og",
    "Open Graph tags",
    ogMissing.length === 0 ? "pass" : ogMissing.length === 3 ? "fail" : "warn",
    ogMissing.length ? `Missing ${ogMissing.join(", ")}. Shared links will fall back to guessed content.` : "og:title, og:description and og:image are set.",
  );
  add("twitter", "Twitter / X card", social.twitterCard ? "pass" : "info", social.twitterCard ? `twitter:card = ${social.twitterCard}` : "No twitter:card. X falls back to Open Graph tags with a small card.");

  if (imgs.length) {
    const pct = Math.round(((imgs.length - missing.length) / imgs.length) * 100);
    add(
      "alt",
      "Image alt text",
      missing.length === 0 ? "pass" : pct >= 80 ? "warn" : "fail",
      missing.length === 0
        ? `All ${imgs.length} images have an alt attribute${empty.length ? ` (${empty.length} empty, which is correct for decorative images)` : ""}.`
        : `${missing.length} of ${imgs.length} images have no alt attribute (${pct}% coverage).`,
    );
  }
  if (hreflang.length) {
    const hasDefault = hreflang.some((h) => h.lang.toLowerCase() === "x-default");
    add("hreflang", "hreflang alternates", hasDefault ? "pass" : "info", `${hreflang.length} alternates${hasDefault ? " including x-default" : "; consider adding an x-default"}.`);
  }
  add(
    "structured-data",
    "Structured data",
    ldBlocks.length ? (ldTypes.has("(invalid JSON-LD)") ? "warn" : "pass") : "info",
    ldBlocks.length ? `${ldBlocks.length} JSON-LD block(s): ${[...ldTypes].join(", ") || "no @type"}.` : "No JSON-LD found. Structured data can enable rich results.",
  );
  add("favicon", "Favicon", doc.querySelector('link[rel~="icon" i]') ? "pass" : "info", doc.querySelector('link[rel~="icon" i]') ? "Declared with <link rel=\"icon\">." : "No <link rel=\"icon\">; browsers will request /favicon.ico.");

  const weights: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0, info: 1 };
  const scored = checks.filter((c) => c.status !== "info");
  const score = scored.length ? Math.round((scored.reduce((s, c) => s + weights[c.status], 0) / scored.length) * 100) : 0;

  return {
    title,
    titleCount: titles.length,
    description,
    canonical,
    robots,
    viewport,
    charset,
    lang,
    keywords: meta(doc, "name", "keywords"),
    author: meta(doc, "name", "author"),
    generator: meta(doc, "name", "generator"),
    favicon: social.favicon,
    hreflang,
    headings,
    images: {
      total: imgs.length,
      missingAlt: missing.length,
      emptyAlt: empty.length,
      examplesMissing: missing.slice(0, 10).map((i) => i.getAttribute("src") ?? "(no src)"),
    },
    structuredData: { jsonLdBlocks: ldBlocks.length, types: [...ldTypes], microdata: doc.querySelectorAll("[itemscope]").length },
    social,
    allMeta,
    checks,
    score,
  };
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

export type LinkKind = "internal" | "external" | "mailto" | "tel" | "anchor" | "javascript" | "other";

export interface ExtractedLink {
  href: string;
  raw: string;
  text: string;
  kind: LinkKind;
  rel: string;
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
  newTab: boolean;
  tag: string;
}

const sameSite = (a: string, b: string) => a.replace(/^www\./, "") === b.replace(/^www\./, "");

/**
 * Extracts links from <a href> and <area href> (plus, optionally, resources such as
 * <link>, <img>, <script>, <iframe>, <source>, <video>, <audio>).
 */
export function extractLinks(doc: Document, pageUrl?: string | null, opts: { includeResources?: boolean } = {}): ExtractedLink[] {
  let pageHost: string | null = null;
  try {
    pageHost = pageUrl ? new URL(pageUrl).hostname : null;
  } catch {
    /* ignore */
  }
  const selectors = ["a[href]", "area[href]"];
  if (opts.includeResources)
    selectors.push("link[href]", "img[src]", "script[src]", "iframe[src]", "source[src]", "video[src]", "audio[src]", "embed[src]");
  const out: ExtractedLink[] = [];
  for (const el of Array.from(doc.querySelectorAll(selectors.join(",")))) {
    const tag = el.tagName.toLowerCase();
    const raw = (el.getAttribute("href") ?? el.getAttribute("src") ?? "").trim();
    if (tag === "link" && /^(preconnect|dns-prefetch)$/i.test(el.getAttribute("rel") ?? "")) continue;
    const rel = (el.getAttribute("rel") ?? "").toLowerCase();
    const relTokens = rel.split(/\s+/);
    const text =
      tag === "a" || tag === "area"
        ? clean(el.textContent) || clean(el.getAttribute("aria-label")) || clean(el.querySelector("img")?.getAttribute("alt")) || clean(el.getAttribute("title")) || clean(el.getAttribute("alt"))
        : `<${tag}>`;
    let kind: LinkKind;
    let href = raw;
    if (/^mailto:/i.test(raw)) kind = "mailto";
    else if (/^tel:/i.test(raw)) kind = "tel";
    else if (/^javascript:/i.test(raw)) kind = "javascript";
    else if (raw.startsWith("#")) kind = "anchor";
    else {
      const abs = resolveUrl(raw, doc, pageUrl);
      if (!abs) kind = "other";
      else {
        href = abs;
        const u = new URL(abs);
        if (u.protocol !== "http:" && u.protocol !== "https:") kind = "other";
        else if (!pageHost) kind = "external";
        else kind = sameSite(u.hostname, pageHost) ? "internal" : "external";
      }
    }
    out.push({
      href,
      raw,
      text: text.slice(0, 300),
      kind,
      rel,
      nofollow: relTokens.includes("nofollow"),
      sponsored: relTokens.includes("sponsored"),
      ugc: relTokens.includes("ugc"),
      newTab: el.getAttribute("target") === "_blank",
      tag,
    });
  }
  return out;
}

function csvCell(v: string | number | boolean): string {
  const s = String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@\t]/.test(s) ? `"${(/^[=+\-@\t]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with formula-injection protection. */
export function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function linksToCsv(links: ExtractedLink[]): string {
  return toCsv(
    ["URL", "Anchor text", "Type", "Element", "rel", "nofollow", "sponsored", "ugc", "Opens in new tab"],
    links.map((l) => [l.href, l.text, l.kind, l.tag, l.rel, l.nofollow, l.sponsored, l.ugc, l.newTab]),
  );
}

/** Unique http(s) URLs to check for the Broken Link Checker (fragments removed). */
export function checkableUrls(links: ExtractedLink[], opts: { internal?: boolean; external?: boolean } = {}): string[] {
  const set = new Set<string>();
  for (const l of links) {
    if (l.kind === "internal" ? opts.internal === false : l.kind === "external" ? opts.external === false : true) continue;
    try {
      const u = new URL(l.href);
      u.hash = "";
      set.add(u.href);
    } catch {
      /* skip */
    }
  }
  return [...set];
}

/* ------------------------------------------------------------------ */
/* Visible text                                                        */
/* ------------------------------------------------------------------ */

const ALWAYS_REMOVE = "script, style, noscript, template, svg, canvas, iframe, object, embed, head, [hidden], [aria-hidden='true']";
const BOILERPLATE = "nav, header, footer, aside, form, [role='navigation'], [role='banner'], [role='contentinfo'], [role='complementary']";
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul", "summary", "details",
]);

/**
 * Visible text of a document. Removes scripts, styles, hidden elements and (optionally)
 * navigation/header/footer/aside boilerplate, inserting line breaks at block boundaries.
 */
export function extractVisibleText(doc: Document, opts: { excludeBoilerplate?: boolean; mainOnly?: boolean } = {}): string {
  const clone = doc.cloneNode(true) as Document;
  clone.querySelectorAll(ALWAYS_REMOVE).forEach((n) => n.remove());
  clone.querySelectorAll("[style]").forEach((n) => {
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.getAttribute("style") ?? "")) n.remove();
  });
  if (opts.excludeBoilerplate) clone.querySelectorAll(BOILERPLATE).forEach((n) => n.remove());
  let root: Element | null = clone.body ?? clone.documentElement;
  if (opts.mainOnly) root = clone.querySelector("main, [role='main'], article") ?? root;
  if (!root) return "";
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const block = BLOCK.has(el.tagName.toLowerCase());
    if (block) parts.push("\n");
    if (el.tagName === "IMG") {
      return;
    }
    for (const c of Array.from(el.childNodes)) walk(c);
    if (block) parts.push("\n");
  };
  walk(root);
  return parts
    .join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Keyword density                                                     */
/* ------------------------------------------------------------------ */

export const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves " +
    "also just will one get may like new use using used us via etc can"
  ).split(/\s+/),
);

export interface KeywordStat {
  term: string;
  count: number;
  /** Percentage of all words (for phrases: occurrences × words in phrase / total words). */
  density: number;
}

export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []).map((w) => w.replace(/’/g, "'"));
}

export function keywordDensity(
  text: string,
  opts: { top?: number; minLength?: number; excludeStopwords?: boolean; ngram?: 1 | 2 | 3 } = {},
): KeywordStat[] {
  const words = tokenizeWords(text);
  const total = words.length;
  if (!total) return [];
  const n = opts.ngram ?? 1;
  const minLen = opts.minLength ?? 3;
  const skipStop = opts.excludeStopwords ?? true;
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= words.length; i++) {
    const gram = words.slice(i, i + n);
    if (n === 1) {
      const w = gram[0];
      if (w.length < minLen || /^\d+$/.test(w) || (skipStop && STOPWORDS.has(w))) continue;
    } else if (skipStop && (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[n - 1]))) continue;
    else if (gram.some((w) => /^\d+$/.test(w))) continue;
    const key = gram.join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => n === 1 || c > 1)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, opts.top ?? 20)
    .map(([term, count]) => ({ term, count, density: Math.round(((count * n) / total) * 10000) / 100 }));
}
