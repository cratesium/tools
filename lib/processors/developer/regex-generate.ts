/**
 * Regex generation: curated presets plus heuristic inference from example strings.
 * Inference generalizes character runs into classes; it is a starting point, not a
 * guarantee, so results are always checked against the examples (and counter-examples).
 */

export interface RegexPreset {
  id: string;
  label: string;
  pattern: string;
  flags: string;
  description: string;
  matches: string[];
  rejects: string[];
}

const octet = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const h16 = "[0-9a-fA-F]{1,4}";
const ipv4 = `${octet}(?:\\.${octet}){3}`;
const ipv6 =
  `(?:(?:${h16}:){7}${h16}|(?:${h16}:){1,7}:|(?:${h16}:){1,6}:${h16}|(?:${h16}:){1,5}(?::${h16}){1,2}|` +
  `(?:${h16}:){1,4}(?::${h16}){1,3}|(?:${h16}:){1,3}(?::${h16}){1,4}|(?:${h16}:){1,2}(?::${h16}){1,5}|` +
  `${h16}:(?::${h16}){1,6}|:(?:(?::${h16}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|` +
  `::(?:ffff(?::0{1,4})?:)?${ipv4}|(?:${h16}:){1,4}:${ipv4})`;

export const REGEX_PRESETS: RegexPreset[] = [
  {
    id: "email",
    label: "Email address",
    pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\\.[A-Za-z]{2,}$",
    flags: "",
    description: "Practical email check (local part, domain labels, TLD of 2+ letters). Not full RFC 5322; quoted local parts and IP-literal domains are rejected.",
    matches: ["jane.doe@example.com", "a+tag@sub.example.co.uk"],
    rejects: ["jane@", "jane@example", "@example.com", "jane doe@example.com"],
  },
  {
    id: "url",
    label: "URL (http/https)",
    pattern: "^https?:\\/\\/(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}(?::\\d{1,5})?(?:[\\/?#][^\\s]*)?$",
    flags: "i",
    description: "http or https URL with a domain name, optional port, path, query and fragment.",
    matches: ["https://example.com", "http://sub.example.org:8080/path?q=1#top"],
    rejects: ["ftp://example.com", "https://localhost", "example.com"],
  },
  {
    id: "ipv4",
    label: "IPv4 address",
    pattern: `^${ipv4}$`,
    flags: "",
    description: "Dotted-quad IPv4 with each octet limited to 0–255 and no leading zeros.",
    matches: ["192.168.0.1", "255.255.255.255", "0.0.0.0"],
    rejects: ["256.1.1.1", "192.168.1", "01.2.3.4"],
  },
  {
    id: "ipv6",
    label: "IPv6 address",
    pattern: `^${ipv6}$`,
    flags: "",
    description: "Full and compressed IPv6 forms, link-local with zone index and IPv4-mapped addresses.",
    matches: ["2001:0db8:85a3:0000:0000:8a2e:0370:7334", "2001:db8::1", "::1", "::ffff:192.168.0.1"],
    rejects: ["2001:db8:::1", "12345::1", "192.168.0.1"],
  },
  {
    id: "hex-color",
    label: "Hex color",
    pattern: "^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
    flags: "",
    description: "CSS hex colors: #RGB, #RGBA, #RRGGBB and #RRGGBBAA.",
    matches: ["#fff", "#1E293B", "#11223344"],
    rejects: ["fff", "#ggg", "#12345"],
  },
  {
    id: "date-iso",
    label: "Date (YYYY-MM-DD)",
    pattern: "^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$",
    flags: "",
    description: "ISO 8601 calendar date. Checks month 01–12 and day 01–31, not days per month.",
    matches: ["2026-11-21", "1999-01-31"],
    rejects: ["2026-13-01", "2026-1-5", "21/11/2026"],
  },
  {
    id: "date-us",
    label: "Date (MM/DD/YYYY)",
    pattern: "^(?:0[1-9]|1[0-2])\\/(?:0[1-9]|[12]\\d|3[01])\\/\\d{4}$",
    flags: "",
    description: "US-style date with two-digit month and day.",
    matches: ["11/21/2026", "01/01/2000"],
    rejects: ["21/11/2026", "1/1/2000"],
  },
  {
    id: "date-eu",
    label: "Date (DD/MM/YYYY)",
    pattern: "^(?:0[1-9]|[12]\\d|3[01])[\\/.-](?:0[1-9]|1[0-2])[\\/.-]\\d{4}$",
    flags: "",
    description: "Day-first date with /, . or - separators.",
    matches: ["21/11/2026", "01.02.2000"],
    rejects: ["11/21/2026", "2026-11-21"],
  },
  {
    id: "time-24",
    label: "Time (24-hour HH:MM[:SS])",
    pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$",
    flags: "",
    description: "24-hour clock time with optional seconds.",
    matches: ["00:00", "23:59:59"],
    rejects: ["24:00", "7:30", "12:60"],
  },
  {
    id: "phone-e164",
    label: "Phone (E.164 international)",
    pattern: "^\\+[1-9]\\d{6,14}$",
    flags: "",
    description: "International number in E.164: + then 7–15 digits, no spaces.",
    matches: ["+14155552671", "+919876543210"],
    rejects: ["14155552671", "+0123456789", "+1 415 555 2671"],
  },
  {
    id: "phone-us",
    label: "Phone (US/NANP, formatted)",
    pattern: "^(?:\\+1[ .-]?)?\\(?[2-9]\\d{2}\\)?[ .-]?[2-9]\\d{2}[ .-]?\\d{4}$",
    flags: "",
    description: "North American numbers with optional +1 and common separators.",
    matches: ["(415) 555-2671", "415.555.2671", "+1 415 555 2671"],
    rejects: ["123-456-7890", "555-2671"],
  },
  {
    id: "zip-us",
    label: "US ZIP code",
    pattern: "^\\d{5}(?:-\\d{4})?$",
    flags: "",
    description: "Five-digit ZIP or ZIP+4.",
    matches: ["94103", "94103-1234"],
    rejects: ["9410", "94103-12"],
  },
  {
    id: "uuid",
    label: "UUID",
    pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    flags: "",
    description: "RFC 9562 UUID, versions 1–8, standard variant.",
    matches: ["123e4567-e89b-42d3-a456-426614174000", "018f3c5e-7b1a-7c3d-9e2f-0a1b2c3d4e5f"],
    rejects: ["123e4567e89b42d3a456426614174000", "123e4567-e89b-02d3-a456-426614174000"],
  },
  {
    id: "slug",
    label: "URL slug",
    pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    flags: "",
    description: "Lowercase letters and digits separated by single hyphens.",
    matches: ["hello-world", "tool-2026"],
    rejects: ["Hello-World", "hello--world", "-hello"],
  },
  {
    id: "username",
    label: "Username (3–16 chars)",
    pattern: "^[A-Za-z][A-Za-z0-9_]{2,15}$",
    flags: "",
    description: "Starts with a letter, then letters, digits or underscores, 3–16 characters in total.",
    matches: ["jane_doe", "dev42"],
    rejects: ["4jane", "ab", "jane-doe"],
  },
  {
    id: "password",
    label: "Strong password",
    pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,}$",
    flags: "",
    description: "At least 12 characters with lowercase, uppercase, digit and symbol (lookaheads).",
    matches: ["Correct-Horse9", "Aa1!aaaaaaaa"],
    rejects: ["password", "Password1234", "Aa1!short"],
  },
  {
    id: "semver",
    label: "Semantic version",
    pattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$",
    flags: "",
    description: "The official semver.org pattern with prerelease and build metadata groups.",
    matches: ["1.0.0", "2.1.3-beta.1+build.5"],
    rejects: ["1.0", "01.0.0", "1.0.0-"],
  },
  {
    id: "mac",
    label: "MAC address",
    pattern: "^(?:[0-9A-Fa-f]{2}([:-]))(?:[0-9A-Fa-f]{2}\\1){4}[0-9A-Fa-f]{2}$",
    flags: "",
    description: "Six hex octets separated consistently by colons or hyphens.",
    matches: ["00:1A:2B:3C:4D:5E", "00-1a-2b-3c-4d-5e"],
    rejects: ["00:1A:2B:3C:4D", "00:1A-2B:3C:4D:5E"],
  },
  {
    id: "integer",
    label: "Integer",
    pattern: "^[+-]?\\d+$",
    flags: "",
    description: "Optional sign followed by digits.",
    matches: ["42", "-7", "+0"],
    rejects: ["4.2", "1e3", ""],
  },
  {
    id: "decimal",
    label: "Decimal number",
    pattern: "^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$",
    flags: "",
    description: "Integers, decimals and scientific notation.",
    matches: ["3.14", "-0.5", ".5", "6.02e23"],
    rejects: ["1.2.3", "abc", "e5"],
  },
  {
    id: "credit-card",
    label: "Card number (format only)",
    pattern: "^(?:\\d[ -]?){12,18}\\d$",
    flags: "",
    description: "13–19 digits with optional spaces or hyphens. Format only: it does not run the Luhn checksum.",
    matches: ["4111 1111 1111 1111", "5500-0000-0000-0004"],
    rejects: ["4111", "4111 1111 1111 111a"],
  },
  {
    id: "html-tag",
    label: "HTML tag",
    pattern: "<\\/?([a-zA-Z][a-zA-Z0-9-]*)\\b[^>]*>",
    flags: "g",
    description: "Finds opening, closing and self-closing tags and captures the tag name. Not an HTML parser.",
    matches: ["<div class=\"a\">", "</p>", "<br/>"],
    rejects: ["< div>", "plain text"],
  },
  {
    id: "duplicate-words",
    label: "Repeated word",
    pattern: "\\b(\\w+)\\s+\\1\\b",
    flags: "gi",
    description: "Finds accidentally repeated words such as \"the the\" using a backreference.",
    matches: ["the the", "It is is fine"],
    rejects: ["the then", "one two"],
  },
];

// ---------- inference ----------

type TokKind = "digit" | "alpha" | "space" | "lit";

interface Tok {
  kind: TokKind;
  text: string;
}

function charKind(ch: string): TokKind {
  if (/\p{Nd}/u.test(ch)) return "digit";
  if (/\p{L}/u.test(ch)) return "alpha";
  if (/\s/.test(ch)) return "space";
  return "lit";
}

export function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  for (const ch of s) {
    const k = charKind(ch);
    const last = out[out.length - 1];
    if (last && last.kind === k && k !== "lit") last.text += ch;
    else out.push({ kind: k, text: ch });
  }
  return out;
}

export interface InferOptions {
  anchors?: boolean;
  /** Use exact lengths when every example agrees; otherwise ranges. With false, use + quantifiers. */
  exactLengths?: boolean;
  /** Keep text that is identical in every example as a literal. */
  keepLiterals?: boolean;
  /** Use [0-9] instead of \d (stricter: \d in JS is ASCII-only anyway, but other engines differ). */
  asciiDigits?: boolean;
}

export interface InferResult {
  pattern: string;
  flags: string;
  strategy: "positional" | "union";
  explanation: string[];
}

const escapeLit = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const escapeInClass = (s: string) => s.replace(/[\]\\^-]/g, "\\$&");

function quant(min: number, max: number, exact: boolean): string {
  if (!exact) return min === 0 ? "*" : "+";
  if (min === max) return min === 1 ? "" : `{${min}}`;
  return `{${min},${max}}`;
}

function alphaClass(texts: string[]): string {
  const all = texts.join("");
  const ascii = /^[A-Za-z]*$/.test(all);
  if (!ascii) return "\\p{L}";
  const upper = /[A-Z]/.test(all);
  const lower = /[a-z]/.test(all);
  if (upper && !lower) return "[A-Z]";
  if (lower && !upper) return "[a-z]";
  return "[A-Za-z]";
}

/** Infers a regex that matches every example. Returns null when there are no examples. */
export function inferRegex(examples: string[], opts: InferOptions = {}): InferResult | null {
  const { anchors = true, exactLengths = true, keepLiterals = true, asciiDigits = false } = opts;
  const ex = examples.filter((e) => e.length > 0);
  if (!ex.length) return null;
  const digit = asciiDigits ? "[0-9]" : "\\d";
  const toks = ex.map(tokenize);
  const sig = (t: Tok[]) => t.map((x) => (x.kind === "lit" ? `lit` : x.kind)).join(",");
  const explanation: string[] = [];
  let body = "";
  let strategy: InferResult["strategy"];
  let unicode = false;

  if (toks.every((t) => sig(t) === sig(toks[0]))) {
    strategy = "positional";
    explanation.push(`All ${ex.length} example(s) share the same structure of ${toks[0].length} segment(s), so each segment was generalized in place.`);
    for (let i = 0; i < toks[0].length; i++) {
      const col = toks.map((t) => t[i].text);
      const kind = toks[0][i].kind;
      const lens = col.map((c) => [...c].length);
      const min = Math.min(...lens);
      const max = Math.max(...lens);
      const same = col.every((c) => c === col[0]);
      if (kind === "lit") {
        const set = [...new Set(col)];
        body += set.length === 1 ? escapeLit(set[0]) : `[${set.map(escapeInClass).join("")}]`;
      } else if (same && keepLiterals && ex.length > 1 && kind === "alpha") {
        body += escapeLit(col[0]);
      } else if (kind === "digit") {
        body += digit + quant(min, max, exactLengths);
      } else if (kind === "space") {
        body += "\\s" + quant(min, max, exactLengths);
      } else {
        const cls = alphaClass(col);
        if (cls.startsWith("\\p")) unicode = true;
        body += cls + quant(min, max, exactLengths);
      }
    }
  } else {
    strategy = "union";
    explanation.push("The examples have different structures, so the pattern falls back to the set of character kinds they use with a length range. Add more similar examples for a tighter pattern.");
    const all = ex.join("");
    const parts: string[] = [];
    if (/\p{Nd}/u.test(all)) parts.push(asciiDigits ? "0-9" : "\\d");
    if (/\p{L}/u.test(all)) {
      const letters = [...all].filter((c) => /\p{L}/u.test(c));
      const cls = alphaClass(letters);
      if (cls.startsWith("\\p")) unicode = true;
      parts.push(cls.startsWith("[") ? cls.slice(1, -1) : cls);
    }
    if (/\s/.test(all)) parts.push("\\s");
    const lits = [...new Set([...all].filter((c) => charKind(c) === "lit"))];
    parts.push(...lits.map(escapeInClass));
    const lens = ex.map((e) => [...e].length);
    body = `[${parts.join("")}]${quant(Math.min(...lens), Math.max(...lens), exactLengths)}`;
  }
  if (!keepLiterals) explanation.push("Text shared by all examples was generalized instead of kept literally.");
  return {
    pattern: anchors ? `^${body}$` : body,
    flags: unicode ? "u" : "",
    strategy,
    explanation,
  };
}

export interface CheckResult {
  text: string;
  expected: boolean;
  actual: boolean;
}

/** Tests a pattern against positives (should match) and negatives (should not). */
export function checkExamples(pattern: string, flags: string, positives: string[], negatives: string[]): CheckResult[] {
  const re = new RegExp(pattern, flags.replace(/[gy]/g, ""));
  return [
    ...positives.map((t) => ({ text: t, expected: true, actual: re.test(t) })),
    ...negatives.map((t) => ({ text: t, expected: false, actual: re.test(t) })),
  ];
}

/** Escapes a JS regex source for use inside a double-quoted string in Java, C#, Go, etc. */
export function toStringLiteral(pattern: string): string {
  return `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
