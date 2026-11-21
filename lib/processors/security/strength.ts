/**
 * Offline password strength estimator (zxcvbn-style, simplified).
 *
 * The password is covered by pattern matches (common passwords, dictionary words with
 * capitalisation/l33t variants, sequences, repeats, keyboard walks, dates/years). A dynamic
 * program picks the cheapest way to describe the whole password as matches plus random
 * characters; that cost in bits approximates log2(guesses) for a smart attacker.
 */

import { COMMON_PASSWORDS, COMMON_WORDS, commonPasswordRank } from "./common-passwords";

export type PatternKind = "common-password" | "dictionary" | "sequence" | "repeat" | "keyboard" | "date" | "year" | "bruteforce";

export interface PatternMatch {
  kind: PatternKind;
  i: number;
  j: number; // inclusive
  token: string;
  bits: number;
  detail: string;
}

export interface CrackTime {
  scenario: string;
  rate: number;
  seconds: number;
  display: string;
}

export interface StrengthResult {
  length: number;
  /** Character pool size inferred from the classes used. */
  pool: number;
  /** Naive entropy: length × log2(pool). */
  naiveBits: number;
  /** Pattern-aware estimate (log2 of guesses). */
  bits: number;
  guesses: number;
  /** 0 (very weak) … 4 (very strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  sequence: PatternMatch[];
  matches: PatternMatch[];
  crackTimes: CrackTime[];
  warnings: string[];
  suggestions: string[];
}

const LEET: Record<string, string> = { "4": "a", "@": "a", "8": "b", "(": "c", "3": "e", "6": "g", "1": "i", "!": "i", "|": "l", "0": "o", $: "s", "5": "s", "7": "t", "+": "t", "2": "z" };

export function unleet(s: string): string {
  return Array.from(s.toLowerCase())
    .map((c) => LEET[c] ?? c)
    .join("");
}

export function charPool(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += /[^\x20-\x7e]/.test(pw) ? 100 : 33;
  return pool || 1;
}

const log2 = Math.log2;

function caseBits(token: string): number {
  if (token === token.toLowerCase()) return 0;
  if (/^[A-Z][^A-Z]*$/.test(token) || /^[^A-Z]*[A-Z]$/.test(token) || token === token.toUpperCase()) return 1;
  const upper = Array.from(token).filter((c) => /[A-Z]/.test(c)).length;
  const lower = Array.from(token).filter((c) => /[a-z]/.test(c)).length;
  let combos = 0;
  for (let k = 1; k <= Math.min(upper, lower); k++) combos += binom(upper + lower, k);
  return log2(Math.max(2, combos));
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

const WORD_SET = new Map<string, number>();
function dictionary(): Map<string, number> {
  if (WORD_SET.size) return WORD_SET;
  COMMON_PASSWORDS.forEach((w, i) => WORD_SET.set(w, i + 1));
  COMMON_WORDS.forEach((w, i) => {
    if (!WORD_SET.has(w)) WORD_SET.set(w, COMMON_PASSWORDS.length + i + 1);
  });
  return WORD_SET;
}

function dictionaryMatches(pw: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  const dict = dictionary();
  const lower = pw.toLowerCase();
  const leet = unleet(pw);
  const n = pw.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < Math.min(n, i + 24); j++) {
      const token = pw.slice(i, j + 1);
      const plain = lower.slice(i, j + 1);
      const sub = leet.slice(i, j + 1);
      const rank = dict.get(plain) ?? 0;
      const leetRank = sub !== plain ? (dict.get(sub) ?? 0) : 0;
      if (!rank && !leetRank) continue;
      if (j - i + 1 < 3 && !/^\d+$/.test(token)) continue;
      const r = rank || leetRank;
      const isLeet = !rank;
      const leetBits = isLeet ? Math.max(1, Array.from(token).filter((c) => LEET[c]).length) : 0;
      const kind: PatternKind = r <= COMMON_PASSWORDS.length ? "common-password" : "dictionary";
      out.push({
        kind,
        i,
        j,
        token,
        bits: log2(r) + caseBits(token) + leetBits,
        detail: `${kind === "common-password" ? "Common password" : "Dictionary word"} “${isLeet ? sub : plain}” (rank ${r})${isLeet ? ", with l33t substitutions" : ""}`,
      });
    }
  }
  // Reversed words.
  const rev = Array.from(lower).reverse().join("");
  for (let i = 0; i < n; i++)
    for (let j = i + 3; j < Math.min(n, i + 24); j++) {
      const r = dict.get(rev.slice(i, j + 1));
      if (r)
        out.push({
          kind: "dictionary",
          i: n - 1 - j,
          j: n - 1 - i,
          token: pw.slice(n - 1 - j, n - i),
          bits: log2(r) + 1,
          detail: `Reversed word “${rev.slice(i, j + 1)}”`,
        });
    }
  return out;
}

const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "0123456789"];

function sequenceMatches(pw: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  const s = pw.toLowerCase();
  let i = 0;
  while (i < s.length - 2) {
    let found = false;
    for (const seq of SEQUENCES) {
      for (const dir of [1, -1]) {
        let j = i;
        while (j + 1 < s.length) {
          const a = seq.indexOf(s[j]);
          const b = seq.indexOf(s[j + 1]);
          if (a < 0 || b < 0 || b - a !== dir) break;
          j++;
        }
        if (j - i + 1 >= 3) {
          const len = j - i + 1;
          const startBits = s[i] === "a" || s[i] === "1" || s[i] === "z" || s[i] === "9" || s[i] === "0" ? 1 : log2(seq.length);
          out.push({
            kind: "sequence",
            i,
            j,
            token: pw.slice(i, j + 1),
            bits: startBits + log2(len) + (dir < 0 ? 1 : 0),
            detail: `${dir > 0 ? "Ascending" : "Descending"} sequence “${pw.slice(i, j + 1)}”`,
          });
          i = j;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) i++;
  }
  return out;
}

function repeatMatches(pw: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  const re = /(.+?)\1+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pw))) {
    const base = m[1];
    const count = m[0].length / base.length;
    const baseBits = base.length === 1 ? log2(charPool(base)) : estimate(base).bits;
    out.push({
      kind: "repeat",
      i: m.index,
      j: m.index + m[0].length - 1,
      token: m[0],
      bits: baseBits + log2(count),
      detail: `Repeated “${base}” × ${count}`,
    });
  }
  return out;
}

const KEYBOARD_ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];
const KEYPOS = new Map<string, [number, number]>();
KEYBOARD_ROWS.forEach((row, r) => Array.from(row).forEach((c, col) => KEYPOS.set(c, [r, col + r * 0.5])));
const SHIFTED: Record<string, string> = { "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", _: "-", "+": "=" };

function adjacent(a: string, b: string): boolean {
  const pa = KEYPOS.get(SHIFTED[a] ?? a.toLowerCase());
  const pb = KEYPOS.get(SHIFTED[b] ?? b.toLowerCase());
  if (!pa || !pb) return false;
  return Math.abs(pa[0] - pb[0]) <= 1 && Math.abs(pa[1] - pb[1]) <= 1.5 && !(pa[0] === pb[0] && pa[1] === pb[1]);
}

function keyboardMatches(pw: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  let i = 0;
  while (i < pw.length - 3) {
    let j = i;
    let turns = 0;
    let lastDir = "";
    while (j + 1 < pw.length && adjacent(pw[j], pw[j + 1])) {
      const pa = KEYPOS.get(SHIFTED[pw[j]] ?? pw[j].toLowerCase())!;
      const pb = KEYPOS.get(SHIFTED[pw[j + 1]] ?? pw[j + 1].toLowerCase())!;
      const dir = `${Math.sign(pb[0] - pa[0])},${Math.sign(pb[1] - pa[1])}`;
      if (lastDir && dir !== lastDir) turns++;
      lastDir = dir;
      j++;
    }
    const len = j - i + 1;
    if (len >= 4) {
      out.push({
        kind: "keyboard",
        i,
        j,
        token: pw.slice(i, j + 1),
        bits: log2(47) + log2(len) + turns * log2(8) + caseBits(pw.slice(i, j + 1)),
        detail: `Keyboard pattern “${pw.slice(i, j + 1)}”`,
      });
      i = j + 1;
    } else i++;
  }
  return out;
}

function dateMatches(pw: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  // Years 1900–2039
  const yre = /(19\d\d|20[0-3]\d)/g;
  let m: RegExpExecArray | null;
  while ((m = yre.exec(pw))) out.push({ kind: "year", i: m.index, j: m.index + 3, token: m[0], bits: log2(140), detail: `Year “${m[0]}”` });
  // Numeric dates with optional separators: ddmmyyyy, mmddyyyy, yyyymmdd, ddmmyy, d/m/yy …
  const dre = /(\d{1,4})([\s/._-]?)(\d{1,2})\2(\d{2,4})/g;
  for (let start = 0; start < pw.length; start++) {
    dre.lastIndex = start;
    const d = dre.exec(pw);
    if (!d || d.index !== start) continue;
    const parts = [d[1], d[3], d[4]].map(Number);
    if (plausibleDate(parts, d[1].length, d[4].length)) {
      out.push({
        kind: "date",
        i: d.index,
        j: d.index + d[0].length - 1,
        token: d[0],
        bits: log2(365 * (d[1].length === 4 || d[4].length === 4 ? 120 : 100)) + (d[2] ? 2 : 0),
        detail: `Date “${d[0]}”`,
      });
    }
  }
  return out;
}

function plausibleDate([a, b, c]: number[], la: number, lc: number): boolean {
  const day = (x: number) => x >= 1 && x <= 31;
  const month = (x: number) => x >= 1 && x <= 12;
  const year = (x: number, len: number) => (len === 4 ? x >= 1900 && x <= 2039 : len === 2);
  if (la === 4) return year(a, 4) && month(b) && day(c) && lc === 2;
  if (!year(c, lc)) return false;
  return (day(a) && month(b)) || (month(a) && day(b));
}

/** Core estimator. Exported for tests. */
export function estimate(pw: string): { bits: number; sequence: PatternMatch[]; matches: PatternMatch[] } {
  const n = pw.length;
  if (!n) return { bits: 0, sequence: [], matches: [] };
  if (n > 256) {
    // Very long inputs: pattern search is skipped to stay fast; random-character estimate only.
    const bits = n * log2(charPool(pw));
    return { bits, sequence: [{ kind: "bruteforce", i: 0, j: n - 1, token: pw, bits, detail: "Random characters" }], matches: [] };
  }
  const matches = [...dictionaryMatches(pw), ...sequenceMatches(pw), ...keyboardMatches(pw), ...dateMatches(pw)];
  if (n <= 64) matches.push(...repeatMatches(pw));
  const charBits = log2(charPool(pw));
  const best = new Array<number>(n + 1).fill(Infinity);
  const back = new Array<PatternMatch | null>(n + 1).fill(null);
  best[0] = 0;
  for (let k = 1; k <= n; k++) {
    // brute-force single character
    const bf = best[k - 1] + charBits;
    if (bf < best[k]) {
      best[k] = bf;
      back[k] = { kind: "bruteforce", i: k - 1, j: k - 1, token: pw[k - 1], bits: charBits, detail: "Random characters" };
    }
    for (const m of matches) {
      if (m.j !== k - 1) continue;
      // one extra bit per additional pattern joined in sequence
      const cost = best[m.i] + m.bits + (m.i > 0 ? 1 : 0);
      if (cost < best[k]) {
        best[k] = cost;
        back[k] = m;
      }
    }
  }
  const seq: PatternMatch[] = [];
  let k = n;
  while (k > 0) {
    const m = back[k]!;
    seq.unshift(m);
    k = m.i;
  }
  // Merge consecutive brute-force characters for display.
  const merged: PatternMatch[] = [];
  for (const m of seq) {
    const last = merged[merged.length - 1];
    if (m.kind === "bruteforce" && last?.kind === "bruteforce") {
      last.j = m.j;
      last.token += m.token;
      last.bits += m.bits;
    } else merged.push({ ...m });
  }
  return { bits: Math.min(best[n], n * charBits), sequence: merged, matches };
}

export const CRACK_SCENARIOS = [
  { scenario: "Online, throttled (100 guesses/hour)", rate: 100 / 3600 },
  { scenario: "Online, unthrottled (10 guesses/second)", rate: 10 },
  { scenario: "Offline, slow hash such as bcrypt (10k/second)", rate: 1e4 },
  { scenario: "Offline, fast hash such as SHA-256 on GPUs (10 billion/second)", rate: 1e10 },
] as const;

export function formatDurationLong(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds > 1e18) return "centuries+";
  if (seconds < 1) return "less than a second";
  const units: [number, string][] = [
    [3153600000, "century"],
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  for (const [s, name] of units) {
    if (seconds >= s) {
      const v = Math.floor(seconds / s);
      if (name === "century" && v >= 100) return "centuries+";
      return `${v.toLocaleString("en-US")} ${name === "century" ? (v === 1 ? "century" : "centuries") : v === 1 ? name : `${name}s`}`;
    }
  }
  return "less than a second";
}

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

export function checkStrength(pw: string): StrengthResult {
  const { bits, sequence, matches } = estimate(pw);
  const pool = charPool(pw);
  const naiveBits = pw.length * log2(pool);
  const guesses = 2 ** bits;
  const score = (guesses < 1e3 ? 0 : guesses < 1e6 ? 1 : guesses < 1e8 ? 2 : guesses < 1e10 ? 3 : 4) as StrengthResult["score"];
  // Average case: half the space.
  const crackTimes = CRACK_SCENARIOS.map((s) => {
    const seconds = guesses / 2 / s.rate;
    return { ...s, seconds, display: formatDurationLong(seconds) };
  });
  const warnings: string[] = [];
  const suggestions: string[] = [];
  if (!pw) return { length: 0, pool: 0, naiveBits: 0, bits: 0, guesses: 0, score: 0, label: LABELS[0], sequence, matches, crackTimes, warnings, suggestions };
  if (commonPasswordRank(pw)) warnings.push("This is one of the most commonly used passwords. It would be guessed almost instantly.");
  const kinds = new Set(sequence.map((m) => m.kind));
  if (kinds.has("common-password") && !commonPasswordRank(pw)) warnings.push("Contains a commonly used password.");
  if (kinds.has("dictionary")) warnings.push("Contains dictionary words; attackers try word lists with capitals and l33t substitutions first.");
  if (kinds.has("sequence")) warnings.push("Sequences like abc or 123 are easy to guess.");
  if (kinds.has("repeat")) warnings.push("Repeated characters or chunks add very little strength.");
  if (kinds.has("keyboard")) warnings.push("Keyboard patterns like qwerty or asdf are in every cracking list.");
  if (kinds.has("date") || kinds.has("year")) warnings.push("Dates and years are easy to guess, especially if they relate to you.");
  if (pw.length < 12) suggestions.push("Use at least 12–16 characters; length matters more than complexity.");
  if (score < 3) suggestions.push("Use a random passphrase of 4–6 unrelated words, or a generated password stored in a password manager.");
  if (pool <= 36 && pw.length < 16) suggestions.push("Mix in upper-case letters, digits and symbols, or make it much longer.");
  if (score >= 3 && !warnings.length) suggestions.push("Good. Use it for one account only and store it in a password manager.");
  return { length: Array.from(pw).length, pool, naiveBits, bits, guesses, score, label: LABELS[score], sequence, matches, crackTimes, warnings, suggestions };
}
