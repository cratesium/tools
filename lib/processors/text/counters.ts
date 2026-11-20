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
