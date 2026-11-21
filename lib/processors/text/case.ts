/** Pure case conversions. Unicode-aware; no DOM access. */

export type CaseMode =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "capitalized"
  | "alternating"
  | "inverse"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "dot"
  | "train";

export type TitleStyle = "chicago" | "ap" | "apa" | "simple";

export interface CaseOptions {
  /** BCP 47 locale for upper/lower mapping (e.g. "tr" maps i → İ). */
  locale?: string;
  titleStyle?: TitleStyle;
  /** Keep words that already contain inner capitals or are all-caps acronyms (iPhone, NASA). Title/sentence case only. */
  preserveAcronyms?: boolean;
}

export const CASE_MODES: { value: CaseMode; label: string; example: string }[] = [
  { value: "sentence", label: "Sentence case", example: "The quick brown fox" },
  { value: "lower", label: "lower case", example: "the quick brown fox" },
  { value: "upper", label: "UPPER CASE", example: "THE QUICK BROWN FOX" },
  { value: "title", label: "Title Case", example: "The Quick Brown Fox" },
  { value: "capitalized", label: "Capitalize Each Word", example: "The Quick Brown Fox" },
  { value: "alternating", label: "aLtErNaTiNg", example: "tHe QuIcK" },
  { value: "inverse", label: "iNVERSE cASE", example: "tHE qUICK" },
  { value: "camel", label: "camelCase", example: "theQuickBrownFox" },
  { value: "pascal", label: "PascalCase", example: "TheQuickBrownFox" },
  { value: "snake", label: "snake_case", example: "the_quick_brown_fox" },
  { value: "kebab", label: "kebab-case", example: "the-quick-brown-fox" },
  { value: "constant", label: "CONSTANT_CASE", example: "THE_QUICK_BROWN_FOX" },
  { value: "dot", label: "dot.case", example: "the.quick.brown.fox" },
  { value: "train", label: "Train-Case", example: "The-Quick-Brown-Fox" },
];

const up = (s: string, l?: string) => (l ? s.toLocaleUpperCase(l) : s.toUpperCase());
const low = (s: string, l?: string) => (l ? s.toLocaleLowerCase(l) : s.toLowerCase());

function capFirst(word: string, locale?: string): string {
  const chars = [...word];
  const i = chars.findIndex((c) => /\p{L}|\p{N}/u.test(c));
  if (i < 0) return word;
  chars[i] = up(chars[i], locale);
  return chars.join("");
}

// Articles, coordinating conjunctions and short prepositions shared by every style.
const BASE_SMALL = ["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "off", "on", "per", "to", "up", "via", "vs", "vs.", "v.", "en"];
// Chicago lowercases prepositions regardless of length.
const CHICAGO_EXTRA = [
  "about", "above", "across", "after", "against", "along", "amid", "among", "around", "before", "behind", "below",
  "beneath", "beside", "between", "beyond", "down", "during", "except", "from", "inside", "into", "like", "near",
  "onto", "out", "outside", "over", "past", "since", "through", "throughout", "till", "toward", "towards", "under",
  "underneath", "until", "upon", "with", "within", "without",
];

export const SMALL_WORDS: Record<TitleStyle, Set<string>> = {
  chicago: new Set([...BASE_SMALL, ...CHICAGO_EXTRA]),
  // AP and APA capitalise every word of four letters or more.
  ap: new Set(BASE_SMALL.filter((w) => w.replace(/\.$/, "").length <= 3).concat(["out", "if"])),
  apa: new Set(BASE_SMALL.filter((w) => w.replace(/\.$/, "").length <= 3).concat(["if"])),
  simple: new Set(),
};

function isAcronymOrMixed(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return false;
  // all caps (NASA) or inner capital (iPhone, McDonald)
  return letters === letters.toUpperCase() && letters !== letters.toLowerCase() ? true : /\p{Ll}\p{Lu}/u.test(word);
}

/**
 * Title case with style-specific small-word rules:
 * first and last words are always capitalised, as is the first word after a colon,
 * em dash, question mark or exclamation mark. Hyphenated compounds capitalise each part.
 */
export function toTitleCase(text: string, opts: CaseOptions = {}): string {
  const style = opts.titleStyle ?? "chicago";
  const small = SMALL_WORDS[style];
  const locale = opts.locale;
  return text
    .split(/(\r?\n)/)
    .map((line) => {
      if (/^\r?\n$/.test(line)) return line;
      const tokens = line.split(/(\s+)/);
      const wordIdx = tokens.map((t, i) => (/\S/.test(t) ? i : -1)).filter((i) => i >= 0);
      const first = wordIdx[0];
      const last = wordIdx[wordIdx.length - 1];
      let forceNext = false;
      return tokens
        .map((tok, i) => {
          if (!/\S/.test(tok)) return tok;
          const force = i === first || i === last || forceNext;
          forceNext = /[:—–?!]$/.test(tok) || tok === "-" || tok === "—" || tok === "–";
          return tok
            .split("-")
            .map((part, pi, parts) => {
              if (!part) return part;
              if (opts.preserveAcronyms !== false && isAcronymOrMixed(part)) return part;
              // URLs, emails and file names stay untouched
              if (/[@/\\]|\.\w/.test(part.replace(/\.$/, ""))) return part;
              const bare = low(part, locale).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, "");
              const edge = force && (pi === 0 || pi === parts.length - 1);
              if (small.has(bare) && !edge) return low(part, locale);
              return capFirst(low(part, locale), locale);
            })
            .join("-");
        })
        .join("");
    })
    .join("");
}

/** Lowercases everything, then capitalises the first letter of each sentence and the pronoun "I". */
export function toSentenceCase(text: string, opts: CaseOptions = {}): string {
  const locale = opts.locale;
  const words = text.split(/(\s+)/);
  let startOfSentence = true;
  return words
    .map((w) => {
      if (!/\S/.test(w)) {
        if (/\n\s*\n/.test(w)) startOfSentence = true;
        return w;
      }
      let out: string;
      if (opts.preserveAcronyms && isAcronymOrMixed(w)) out = w;
      else out = low(w, locale);
      if (/^i(['’].*)?[.,;:!?]*$/i.test(out) && !/^i\./i.test(out)) out = "I" + out.slice(1);
      if (startOfSentence) out = capFirst(out, locale);
      startOfSentence = /[.!?…]["'”’)\]]*$/.test(w);
      return out;
    })
    .join("");
}

/** Splits identifiers and prose into words: handles spaces, punctuation, camelCase, acronyms and digits. */
export function splitWords(text: string): string[] {
  return (
    text
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
      .replace(/['’]/g, "")
      .match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
  );
}

function joinWords(text: string, fn: (words: string[]) => string): string {
  return text
    .split(/\r?\n/)
    .map((line) => fn(splitWords(line)))
    .join("\n");
}

export function convertCase(text: string, mode: CaseMode, opts: CaseOptions = {}): string {
  const l = opts.locale;
  switch (mode) {
    case "upper":
      return up(text, l);
    case "lower":
      return low(text, l);
    case "title":
      return toTitleCase(text, opts);
    case "sentence":
      return toSentenceCase(text, opts);
    case "capitalized":
      return text.replace(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu, (w) => capFirst(low(w, l), l));
    case "alternating": {
      let i = 0;
      return [...text].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? up(c, l) : low(c, l)) : c)).join("");
    }
    case "inverse":
      return [...text].map((c) => (c === up(c, l) ? low(c, l) : up(c, l))).join("");
    case "camel":
      return joinWords(text, (w) => w.map((x, i) => (i ? capFirst(low(x, l), l) : low(x, l))).join(""));
    case "pascal":
      return joinWords(text, (w) => w.map((x) => capFirst(low(x, l), l)).join(""));
    case "snake":
      return joinWords(text, (w) => w.map((x) => low(x, l)).join("_"));
    case "kebab":
      return joinWords(text, (w) => w.map((x) => low(x, l)).join("-"));
    case "constant":
      return joinWords(text, (w) => w.map((x) => up(x, l)).join("_"));
    case "dot":
      return joinWords(text, (w) => w.map((x) => low(x, l)).join("."));
    case "train":
      return joinWords(text, (w) => w.map((x) => capFirst(low(x, l), l)).join("-"));
  }
}
