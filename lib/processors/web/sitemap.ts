/**
 * XML sitemap generation per sitemaps.org protocol 0.9: entity-escaped <loc>, optional
 * <lastmod> (W3C datetime), <changefreq> and <priority>; files split at 50,000 URLs or
 * 50 MB, with a sitemap index when more than one file is produced.
 */

export const MAX_URLS_PER_SITEMAP = 50_000;
export const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;
export const CHANGEFREQS = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] as const;
export type ChangeFreq = (typeof CHANGEFREQS)[number];

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: ChangeFreq;
  priority?: number;
}

export interface ParseError {
  line: number;
  input: string;
  message: string;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** W3C Datetime: YYYY, YYYY-MM, YYYY-MM-DD, or full date-time with timezone. */
export function isW3cDate(s: string): boolean {
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return !Number.isNaN(Date.parse(s.length === 4 ? `${s}-01-01` : s.length === 7 ? `${s}-01` : s));
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) return !Number.isNaN(Date.parse(s));
  return false;
}

/**
 * Parses one URL per line. Optional extra columns (comma, tab or whitespace separated):
 * lastmod, changefreq, priority, in any order. Lines starting with # are ignored.
 */
export function parseUrlList(
  text: string,
  defaults: { lastmod?: string; changefreq?: ChangeFreq; priority?: number } = {},
): { entries: SitemapEntry[]; errors: ParseError[]; duplicates: number } {
  const entries: SitemapEntry[] = [];
  const errors: ParseError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cols = line.split(/[\t,]+|\s+/).filter(Boolean);
    let url: URL;
    try {
      url = new URL(cols[0]);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      errors.push({ line: i + 1, input: line, message: "Not an absolute http(s) URL." });
      return;
    }
    url.hash = "";
    const entry: SitemapEntry = { loc: url.href };
    for (const c of cols.slice(1)) {
      const lc = c.toLowerCase();
      if ((CHANGEFREQS as readonly string[]).includes(lc)) entry.changefreq = lc as ChangeFreq;
      else if (/^(0(\.\d+)?|1(\.0+)?)$/.test(c)) entry.priority = Number(c);
      else if (isW3cDate(c)) entry.lastmod = c;
      else errors.push({ line: i + 1, input: line, message: `Ignored unrecognised value "${c}".` });
    }
    entry.lastmod ??= defaults.lastmod || undefined;
    entry.changefreq ??= defaults.changefreq;
    entry.priority ??= defaults.priority;
    if (seen.has(entry.loc)) {
      duplicates++;
      return;
    }
    seen.add(entry.loc);
    entries.push(entry);
  });
  return { entries, errors, duplicates };
}

function urlXml(e: SitemapEntry): string {
  let s = `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n`;
  if (e.lastmod) s += `    <lastmod>${escapeXml(e.lastmod)}</lastmod>\n`;
  if (e.changefreq) s += `    <changefreq>${e.changefreq}</changefreq>\n`;
  if (e.priority != null && Number.isFinite(e.priority)) s += `    <priority>${Math.min(1, Math.max(0, e.priority)).toFixed(1)}</priority>\n`;
  return `${s}  </url>\n`;
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
const TAIL = "</urlset>\n";

export function buildUrlset(entries: SitemapEntry[]): string {
  return HEAD + entries.map(urlXml).join("") + TAIL;
}

export interface SitemapFile {
  name: string;
  xml: string;
  count: number;
}

/**
 * Builds one or more sitemap files. When more than one file is needed, also returns a
 * sitemap index that references them at `${indexBaseUrl}/${name}`.
 */
export function buildSitemaps(
  entries: SitemapEntry[],
  opts: { maxPerFile?: number; maxBytes?: number; baseName?: string; indexBaseUrl?: string; lastmod?: string } = {},
): { files: SitemapFile[]; index: string | null } {
  const maxPer = opts.maxPerFile ?? MAX_URLS_PER_SITEMAP;
  const maxBytes = opts.maxBytes ?? MAX_SITEMAP_BYTES;
  const base = opts.baseName ?? "sitemap";
  const enc = new TextEncoder();
  const chunks: SitemapEntry[][] = [];
  let cur: SitemapEntry[] = [];
  let bytes = enc.encode(HEAD + TAIL).length;
  for (const e of entries) {
    const b = enc.encode(urlXml(e)).length;
    if (cur.length && (cur.length >= maxPer || bytes + b > maxBytes)) {
      chunks.push(cur);
      cur = [];
      bytes = enc.encode(HEAD + TAIL).length;
    }
    cur.push(e);
    bytes += b;
  }
  if (cur.length || !chunks.length) chunks.push(cur);
  if (chunks.length === 1) return { files: [{ name: `${base}.xml`, xml: buildUrlset(chunks[0]), count: chunks[0].length }], index: null };
  const files = chunks.map((c, i) => ({ name: `${base}-${i + 1}.xml`, xml: buildUrlset(c), count: c.length }));
  const root = (opts.indexBaseUrl ?? "").replace(/\/+$/, "");
  const index =
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    files
      .map(
        (f) =>
          `  <sitemap>\n    <loc>${escapeXml(root ? `${root}/${f.name}` : f.name)}</loc>\n${opts.lastmod ? `    <lastmod>${escapeXml(opts.lastmod)}</lastmod>\n` : ""}  </sitemap>\n`,
      )
      .join("") +
    "</sitemapindex>\n";
  return { files, index };
}
