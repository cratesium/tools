/** URL slug generation and reversal. Pure, Unicode-aware. */

/** Letters that NFKD decomposition does not reduce to ASCII. */
const SPECIAL: Record<string, string> = {
  ß: "ss", ẞ: "SS", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ø: "o", Ø: "O", ł: "l", Ł: "L", đ: "d", Đ: "D",
  ð: "d", Ð: "D", þ: "th", Þ: "TH", ı: "i", ħ: "h", Ħ: "H", ŀ: "l", Ŀ: "L", ŧ: "t", Ŧ: "T", ĸ: "k", ŋ: "ng", Ŋ: "NG",
  "’": "", "'": "", "‘": "", "`": "",
};

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u", ј: "j", љ: "lj", њ: "nj",
  ћ: "c", ђ: "dj", џ: "dz", ѓ: "gj", ќ: "kj", ѕ: "dz",
};

const GREEK: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x",
  ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

const SYMBOLS: Record<string, string> = { "&": " and ", "@": " at ", "%": " percent ", "+": " plus ", "€": " euro ", $: " dollar ", "£": " pound ", "©": " c ", "®": " r ", "™": " tm " };

/** Transliterates common Latin, Cyrillic and Greek letters to ASCII; other scripts pass through unchanged. */
export function transliterate(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const isUpper = ch !== lower;
    if (SPECIAL[ch] !== undefined) out += SPECIAL[ch];
    else if (CYRILLIC[lower] !== undefined) out += isUpper ? cap(CYRILLIC[lower]) : CYRILLIC[lower];
    else if (GREEK[lower.normalize("NFD").replace(/\p{M}/gu, "")] !== undefined) {
      const v = GREEK[lower.normalize("NFD").replace(/\p{M}/gu, "")];
      out += isUpper ? cap(v) : v;
    } else out += ch;
  }
  // Strip combining marks left after canonical decomposition: é → e, ñ → n, Å → A.
  return out.normalize("NFKD").replace(/\p{M}/gu, "");
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with", "by", "from", "is", "are", "was", "were", "be"]);

export interface SlugOptions {
  separator: "-" | "_" | ".";
  lowercase: boolean;
  /** 0 = unlimited. Cuts at a word boundary when possible. */
  maxLength: number;
  removeStopWords: boolean;
  /** Spell out & @ % + and currency symbols as words. */
  replaceSymbols: boolean;
  /** Keep non-Latin letters (e.g. 日本語) instead of dropping them. Produces an IRI-style slug. */
  keepUnicode: boolean;
  /** Transliterate Cyrillic/Greek and special Latin letters. */
  transliterate: boolean;
}

export const defaultSlugOptions: SlugOptions = {
  separator: "-",
  lowercase: true,
  maxLength: 0,
  removeStopWords: false,
  replaceSymbols: true,
  keepUnicode: false,
  transliterate: true,
};

export function slugify(text: string, o: SlugOptions = defaultSlugOptions): string {
  let t = text;
  if (o.replaceSymbols) t = t.replace(/[&@%+€$£©®™]/g, (c) => SYMBOLS[c] ?? c);
  t = o.transliterate ? transliterate(t) : t.normalize("NFKD").replace(/\p{M}/gu, "");
  if (o.lowercase) t = t.toLowerCase();
  const wordRe = o.keepUnicode ? /[\p{L}\p{N}]+/gu : /[A-Za-z0-9]+/g;
  let words: string[] = t.replace(/['’]/g, "").match(wordRe) ?? [];
  if (o.removeStopWords) {
    const filtered = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    if (filtered.length) words = filtered;
  }
  let slug = words.join(o.separator);
  if (o.maxLength > 0 && slug.length > o.maxLength) {
    const cut = slug.slice(0, o.maxLength + 1);
    const idx = cut.lastIndexOf(o.separator);
    slug = idx > 0 ? cut.slice(0, idx) : slug.slice(0, o.maxLength);
    slug = slug.replace(new RegExp(`\\${o.separator}+$`), "");
  }
  return slug;
}

export type UnslugCase = "sentence" | "title" | "lower" | "upper" | "as-is";

export interface UnslugOptions {
  case: UnslugCase;
  /** Remove a leading path ("/blog/2024/"), query string, hash and file extension. */
  stripUrlParts: boolean;
  /** Drop leading/trailing numeric ids such as "-12345" or "123-". */
  stripIds: boolean;
}

export const defaultUnslugOptions: UnslugOptions = { case: "sentence", stripUrlParts: true, stripIds: false };

const TITLE_SMALL = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "of", "in", "on", "at", "to", "by", "via", "vs"]);

export function unslug(slug: string, o: UnslugOptions = defaultUnslugOptions): string {
  let s = slug.trim();
  if (o.stripUrlParts) {
    s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
    s = s.slice(s.lastIndexOf("/") + 1);
    s = s.replace(/\.(html?|php|aspx?|md)$/i, "");
  }
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  let words = s.split(/[-_.+\s]+|%20/).filter(Boolean);
  if (o.stripIds) {
    while (words.length > 1 && /^\d+$/.test(words[words.length - 1])) words.pop();
    while (words.length > 1 && /^\d+$/.test(words[0])) words.shift();
  }
  switch (o.case) {
    case "lower":
      words = words.map((w) => w.toLowerCase());
      break;
    case "upper":
      words = words.map((w) => w.toUpperCase());
      break;
    case "sentence":
      words = words.map((w, i) => (i === 0 ? cap(w.toLowerCase()) : w.toLowerCase()));
      break;
    case "title":
      words = words.map((w, i, a) => {
        const l = w.toLowerCase();
        return i > 0 && i < a.length - 1 && TITLE_SMALL.has(l) ? l : cap(l);
      });
      break;
    case "as-is":
      break;
  }
  return words.join(" ");
}
