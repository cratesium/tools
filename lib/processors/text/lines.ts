/** Pure line- and whitespace-oriented text transforms. */

export const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/);

/* ------------------------------------------------------------------ whitespace */

export interface WhitespaceOptions {
  /** Collapse runs of spaces/tabs inside a line to one space. */
  collapseSpaces: boolean;
  /** Remove leading and trailing whitespace on every line. */
  trimLines: boolean;
  /** Replace 2+ consecutive blank lines with a single blank line. */
  collapseBlankLines: boolean;
  /** Remove every blank line. */
  removeBlankLines: boolean;
  /** Join everything into one line. */
  removeLineBreaks: boolean;
  /** Convert tabs to single spaces before collapsing. */
  tabsToSpaces: boolean;
  /** Treat non-breaking, zero-width and other Unicode spaces as normal spaces (zero-width removed). */
  normalizeUnicodeSpaces: boolean;
  /** Remove the space before , . ; : ! ? */
  fixPunctuationSpacing: boolean;
}

export const defaultWhitespaceOptions: WhitespaceOptions = {
  collapseSpaces: true,
  trimLines: true,
  collapseBlankLines: true,
  removeBlankLines: false,
  removeLineBreaks: false,
  tabsToSpaces: true,
  normalizeUnicodeSpaces: true,
  fixPunctuationSpacing: false,
};

export function removeExtraSpaces(text: string, o: WhitespaceOptions = defaultWhitespaceOptions): string {
  let t = text.replace(/\r\n?/g, "\n");
  if (o.normalizeUnicodeSpaces) t = t.replace(/[​-‍⁠﻿]/g, "").replace(/[   -   　]/g, " ");
  if (o.tabsToSpaces) t = t.replace(/\t/g, " ");
  let lines = t.split("\n");
  if (o.collapseSpaces) lines = lines.map((l) => l.replace(/[ \t]{2,}/g, " "));
  if (o.trimLines) lines = lines.map((l) => l.trim());
  if (o.fixPunctuationSpacing) lines = lines.map((l) => l.replace(/[ \t]+([,.;:!?])/g, "$1"));
  if (o.removeBlankLines) lines = lines.filter((l) => l.trim() !== "");
  else if (o.collapseBlankLines) lines = lines.filter((l, i, a) => !(l.trim() === "" && i > 0 && a[i - 1].trim() === ""));
  if (o.removeLineBreaks) {
    const joined = lines.filter((l) => l.trim() !== "").join(" ");
    return o.collapseSpaces ? joined.replace(/ {2,}/g, " ") : joined;
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ dedupe */

export interface DedupeOptions {
  caseSensitive: boolean;
  /** Compare lines after trimming whitespace (the kept line is output unchanged unless trimOutput). */
  ignoreWhitespace: boolean;
  keep: "first" | "last";
  removeEmpty: boolean;
  /** "dedupe": keep one of each; "unique": only lines that occur once; "duplicates": one copy of each repeated line. */
  mode: "dedupe" | "unique" | "duplicates";
}

export const defaultDedupeOptions: DedupeOptions = {
  caseSensitive: true,
  ignoreWhitespace: false,
  keep: "first",
  removeEmpty: false,
  mode: "dedupe",
};

export interface DedupeResult {
  text: string;
  inputLines: number;
  outputLines: number;
  removed: number;
  /** Lines that occurred more than once, with their counts, most frequent first. */
  duplicates: [string, number][];
}

export function dedupeLines(text: string, o: DedupeOptions = defaultDedupeOptions): DedupeResult {
  const lines = text === "" ? [] : splitLines(text);
  const key = (l: string) => {
    let k = o.ignoreWhitespace ? l.trim().replace(/\s+/g, " ") : l;
    if (!o.caseSensitive) k = k.toLowerCase();
    return k;
  };
  const counts = new Map<string, number>();
  const firstSeen = new Map<string, string>();
  for (const l of lines) {
    if (o.removeEmpty && l.trim() === "") continue;
    const k = key(l);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (!firstSeen.has(k)) firstSeen.set(k, l);
  }
  const candidates = lines.filter((l) => !(o.removeEmpty && l.trim() === ""));
  const ordered = o.keep === "first" ? candidates : [...candidates].reverse();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of ordered) {
    const k = key(l);
    const n = counts.get(k) ?? 0;
    if (o.mode === "unique" && n > 1) continue;
    if (o.mode === "duplicates" && n < 2) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  if (o.keep === "last") out.reverse();
  const duplicates = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([k, n]) => [firstSeen.get(k) ?? k, n] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  return { text: out.join("\n"), inputLines: lines.length, outputLines: out.length, removed: lines.length - out.length, duplicates };
}

/* ------------------------------------------------------------------ sort */

export type SortMethod = "alphabetical" | "natural" | "length" | "random" | "reverse-order";

export interface SortOptions {
  method: SortMethod;
  caseSensitive: boolean;
  descending: boolean;
  removeEmpty: boolean;
  dedupe: boolean;
  trim: boolean;
  /** Seed for "random" so the shuffle is reproducible. */
  seed?: number;
  /** Locale for collation. */
  locale?: string;
}

export const defaultSortOptions: SortOptions = {
  method: "alphabetical",
  caseSensitive: false,
  descending: false,
  removeEmpty: true,
  dedupe: false,
  trim: false,
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sortLines(text: string, o: SortOptions = defaultSortOptions): string {
  let lines = text === "" ? [] : splitLines(text);
  if (o.trim) lines = lines.map((l) => l.trim());
  if (o.removeEmpty) lines = lines.filter((l) => l.trim() !== "");
  if (o.dedupe) {
    const seen = new Set<string>();
    lines = lines.filter((l) => {
      const k = o.caseSensitive ? l : l.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const sensitivity = o.caseSensitive ? "variant" : "base";
  const alpha = new Intl.Collator(o.locale, { sensitivity, numeric: false });
  const natural = new Intl.Collator(o.locale, { sensitivity, numeric: true });
  // Deterministic tiebreak so case-sensitive sorts are stable regardless of engine.
  const tie = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  let out: string[];
  switch (o.method) {
    case "alphabetical":
      out = [...lines].sort((a, b) => alpha.compare(a, b) || (o.caseSensitive ? tie(a, b) : 0));
      break;
    case "natural":
      out = [...lines].sort((a, b) => natural.compare(a, b) || (o.caseSensitive ? tie(a, b) : 0));
      break;
    case "length":
      out = [...lines].sort((a, b) => [...a].length - [...b].length || natural.compare(a, b));
      break;
    case "random": {
      const rnd = mulberry32(o.seed ?? Date.now());
      out = [...lines];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out.join("\n");
    }
    case "reverse-order":
      out = [...lines].reverse();
      return out.join("\n");
  }
  if (o.descending) out.reverse();
  return out.join("\n");
}

/* ------------------------------------------------------------------ reverse */

export function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

export type ReverseMode = "characters" | "each-line" | "line-order" | "each-word";

/**
 * Reverses text. Works on grapheme clusters, so emoji with skin tones, flags and
 * combining accents (é written as e + ◌́) stay intact.
 */
export function reverseText(text: string, mode: ReverseMode = "characters"): string {
  const nl = /\r\n|\r|\n/;
  switch (mode) {
    case "characters":
      return graphemes(text.replace(/\r\n/g, "\n")).reverse().join("");
    case "each-line":
      return text.split(nl).map((l) => graphemes(l).reverse().join("")).join("\n");
    case "line-order":
      return text.split(nl).reverse().join("\n");
    case "each-word":
      return text.replace(/[^\s]+/g, (w) => graphemes(w).reverse().join(""));
  }
}

export interface ReverseWordsOptions {
  /** "line": reverse word order within each line; "all": across the whole text. */
  scope: "line" | "all";
  /** Keep trailing sentence punctuation at the end of the line instead of moving it with its word. */
  keepEndPunctuation: boolean;
}

export function reverseWords(text: string, o: ReverseWordsOptions = { scope: "line", keepEndPunctuation: true }): string {
  const rev = (line: string) => {
    const lead = line.match(/^\s*/)![0];
    let body = line.trim();
    let end = "";
    if (o.keepEndPunctuation) {
      const m = body.match(/[.!?…]+$/);
      if (m) {
        end = m[0];
        body = body.slice(0, -end.length);
      }
    }
    if (!body) return line;
    return lead + body.split(/\s+/).reverse().join(" ") + end;
  };
  if (o.scope === "all") return rev(text.replace(/\s+/g, " "));
  return splitLines(text).map(rev).join("\n");
}

/* ------------------------------------------------------------------ repeat */

export interface RepeatOptions {
  count: number;
  separator: string;
  /** Prefix each copy with "1. ", "2. " … */
  numbered: boolean;
}

/** Upper bound on generated output (characters) so a typo cannot freeze the tab. */
export const MAX_REPEAT_OUTPUT = 5_000_000;

export function repeatText(text: string, o: RepeatOptions): string {
  const count = Math.max(0, Math.floor(o.count));
  if (!text || count === 0) return "";
  const est = (text.length + o.separator.length + (o.numbered ? String(count).length + 2 : 0)) * count;
  if (est > MAX_REPEAT_OUTPUT)
    throw new Error(`That would produce about ${est.toLocaleString("en-US")} characters. The limit is ${MAX_REPEAT_OUTPUT.toLocaleString("en-US")}; lower the count.`);
  const parts = new Array<string>(count);
  for (let i = 0; i < count; i++) parts[i] = o.numbered ? `${i + 1}. ${text}` : text;
  return parts.join(o.separator);
}
