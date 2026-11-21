/** Full-text search over extracted page text. Pure: works on plain strings per page. */

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  /** Characters of context on each side of a hit. */
  context?: number;
  /** Stop after this many hits (protects the UI on huge documents). */
  limit?: number;
}

export interface SearchHit {
  page: number;
  /** Offset of the match in that page's text. */
  index: number;
  before: string;
  match: string;
  after: string;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  pagesWithHits: number;
  truncated: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds the search regex. Whitespace in the query matches any run of whitespace (incl. line breaks). */
export function buildSearchRegex(query: string, { caseSensitive = false, wholeWord = false }: SearchOptions = {}): RegExp | null {
  const q = query.trim();
  if (!q) return null;
  const body = q.split(/\s+/).map(escapeRegExp).join("\\s+");
  const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(pattern, caseSensitive ? "gu" : "giu");
}

export function searchPages(pages: { page: number; text: string }[], query: string, opts: SearchOptions = {}): SearchResult {
  const re = buildSearchRegex(query, opts);
  const context = opts.context ?? 60;
  const limit = opts.limit ?? 2000;
  const hits: SearchHit[] = [];
  let total = 0;
  const pagesHit = new Set<number>();
  if (!re) return { hits, total: 0, pagesWithHits: 0, truncated: false };
  const flat = (s: string) => s.replace(/\s+/g, " ");
  for (const { page, text } of pages) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      total++;
      pagesHit.add(page);
      if (hits.length < limit) {
        const start = Math.max(0, m.index - context);
        const end = Math.min(text.length, m.index + m[0].length + context);
        hits.push({
          page,
          index: m.index,
          before: (start > 0 ? "…" : "") + flat(text.slice(start, m.index)).trimStart(),
          match: flat(m[0]),
          after: flat(text.slice(m.index + m[0].length, end)).trimEnd() + (end < text.length ? "…" : ""),
        });
      }
    }
  }
  return { hits, total, pagesWithHits: pagesHit.size, truncated: total > hits.length };
}
