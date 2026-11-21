/** Pure text statistics. No DOM access, safe to unit test and run in workers. */

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  uniqueWords: number;
  avgWordLength: number;
  readingTimeMin: number;
  speakingTimeMin: number;
}

const wordRe = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;

export function countWords(text: string): number {
  return text.match(wordRe)?.length ?? 0;
}

export function countSentences(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  // A sentence ends with . ! ? (or …) followed by whitespace/end; trailing text without punctuation counts as one.
  const parts = t.split(/(?<=[.!?…])["'”’)\]]*\s+/u).filter((s) => /[\p{L}\p{N}]/u.test(s));
  return parts.length;
}

export function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
}

export function textStats(text: string): TextStats {
  const words = text.match(wordRe) ?? [];
  const chars = [...text].length;
  return {
    words: words.length,
    characters: chars,
    charactersNoSpaces: [...text.replace(/\s/g, "")].length,
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    lines: text ? text.split(/\r\n|\r|\n/).length : 0,
    uniqueWords: new Set(words.map((w) => w.toLowerCase())).size,
    avgWordLength: words.length ? words.reduce((s, w) => s + [...w].length, 0) / words.length : 0,
    readingTimeMin: words.length / 238,
    speakingTimeMin: words.length / 140,
  };
}

/** Top-N most frequent words, ignoring case. */
export function wordFrequency(text: string, limit = 10): [string, number][] {
  const map = new Map<string, number>();
  for (const w of text.match(wordRe) ?? []) {
    const k = w.toLowerCase();
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

/* ------------------------------------------------------------ focus-specific details */

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// GSM 03.38 basic set plus the extension table (extension chars cost two septets).
const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM_EXT = new Set("^{}\\[~]|€\f");

export interface SmsInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Length in encoding units (septets for GSM-7, UTF-16 code units for UCS-2). */
  units: number;
  segments: number;
  perSegment: number;
  remaining: number;
}

/** SMS segment count, following the GSM-7 / UCS-2 rules used by carriers. */
export function smsInfo(text: string): SmsInfo {
  let gsm = true;
  let units = 0;
  for (const c of text) {
    if (GSM_BASIC.has(c)) units += 1;
    else if (GSM_EXT.has(c)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) units = text.length; // UTF-16 code units
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  const perSegment = segments > 1 ? multi : single;
  const remaining = segments === 0 ? single : segments * perSegment - units;
  return { encoding: gsm ? "GSM-7" : "UCS-2", units, segments, perSegment, remaining };
}

export function splitSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?…])["'”’)\]]*\s+/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

export interface SentenceDetails {
  count: number;
  avgWords: number;
  longest: { text: string; words: number } | null;
  shortest: { text: string; words: number } | null;
  /** Sentences of 25+ words, often flagged by readability checkers. */
  longSentences: number;
}

export function sentenceDetails(text: string): SentenceDetails {
  const ss = splitSentences(text).map((s) => ({ text: s, words: countWords(s) }));
  if (!ss.length) return { count: 0, avgWords: 0, longest: null, shortest: null, longSentences: 0 };
  const sorted = [...ss].sort((a, b) => b.words - a.words);
  return {
    count: ss.length,
    avgWords: ss.reduce((n, s) => n + s.words, 0) / ss.length,
    longest: sorted[0],
    shortest: sorted[sorted.length - 1],
    longSentences: ss.filter((s) => s.words >= 25).length,
  };
}

export interface ParagraphDetails {
  count: number;
  avgWords: number;
  avgSentences: number;
  longestWords: number;
  shortestWords: number;
  /** Words per paragraph, in order. */
  perParagraph: number[];
}

export function paragraphDetails(text: string): ParagraphDetails {
  const ps = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const words = ps.map(countWords);
  if (!ps.length) return { count: 0, avgWords: 0, avgSentences: 0, longestWords: 0, shortestWords: 0, perParagraph: [] };
  return {
    count: ps.length,
    avgWords: words.reduce((a, b) => a + b, 0) / ps.length,
    avgSentences: ps.reduce((n, p) => n + countSentences(p), 0) / ps.length,
    longestWords: Math.max(...words),
    shortestWords: Math.min(...words),
    perParagraph: words,
  };
}
