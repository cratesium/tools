/** Reversible text encodings. Pure; every scheme works on full Unicode (UTF-8 where bytes are involved). */

export type Scheme =
  | "base64"
  | "base64url"
  | "url"
  | "html"
  | "unicode"
  | "hex"
  | "binary"
  | "decimal"
  | "rot13"
  | "morse";

export const SCHEMES: { value: Scheme; label: string; hint: string }[] = [
  { value: "base64", label: "Base64", hint: "RFC 4648, UTF-8 bytes" },
  { value: "base64url", label: "Base64URL", hint: "URL-safe alphabet, no padding" },
  { value: "url", label: "URL (percent)", hint: "encodeURIComponent" },
  { value: "html", label: "HTML entities", hint: "Named for & < > \" ', numeric for non-ASCII" },
  { value: "unicode", label: "Unicode escapes", hint: "\\uXXXX (JavaScript/JSON style)" },
  { value: "hex", label: "Hex", hint: "UTF-8 bytes, space separated" },
  { value: "binary", label: "Binary", hint: "UTF-8 bytes, 8 bits each" },
  { value: "decimal", label: "Decimal code points", hint: "One number per character" },
  { value: "rot13", label: "ROT13", hint: "Letters shifted by 13 (self-inverse)" },
  { value: "morse", label: "Morse code", hint: "ITU; / between words" },
];

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error("Input contains characters that are not valid Base64.");
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("Base64 input has an invalid length.");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8Decode(bytes: Uint8Array): string {
  try {
    return dec.decode(bytes);
  } catch {
    throw new Error("The decoded bytes are not valid UTF-8 text.");
  }
}

const NAMED: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const NAMED_DECODE: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", hellip: "…",
  mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euro: "€", pound: "£", yen: "¥", cent: "¢",
  deg: "°", times: "×", divide: "÷", middot: "·", bull: "•", sect: "§", para: "¶", laquo: "«", raquo: "»",
};

const ROT = (s: string) =>
  s.replace(/[A-Za-z]/g, (c) => {
    const b = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
  });

export const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-",
  L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-",
  W: ".--", X: "-..-", Y: "-.--", Z: "--..", "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..",
  "'": ".----.", "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.",
  "=": "-...-", "+": ".-.-.", "-": "-....-", _: "..--.-", '"': ".-..-.", $: "...-..-", "@": ".--.-.",
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function encode(text: string, scheme: Scheme): string {
  switch (scheme) {
    case "base64":
      return bytesToBase64(enc.encode(text));
    case "base64url":
      return bytesToBase64(enc.encode(text)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    case "url":
      return encodeURIComponent(text);
    case "html":
      return Array.from(text, (c) => NAMED[c] ?? (c.codePointAt(0)! > 126 ? `&#${c.codePointAt(0)};` : c)).join("");
    case "unicode":
      return Array.from(text, (c) => {
        const cp = c.codePointAt(0)!;
        if (cp >= 0x20 && cp < 0x7f && c !== "\\") return c;
        // Encode as UTF-16 code units so the output is valid in JSON and every JS engine.
        return Array.from({ length: c.length }, (_, i) => "\\u" + c.charCodeAt(i).toString(16).padStart(4, "0")).join("");
      }).join("");
    case "hex":
      return Array.from(enc.encode(text), (b) => b.toString(16).padStart(2, "0")).join(" ");
    case "binary":
      return Array.from(enc.encode(text), (b) => b.toString(2).padStart(8, "0")).join(" ");
    case "decimal":
      return Array.from(text, (c) => c.codePointAt(0)).join(" ");
    case "rot13":
      return ROT(text);
    case "morse": {
      const unknown = new Set<string>();
      const out = text
        .trim()
        .split(/\s+/)
        .map((w) =>
          Array.from(w.toUpperCase())
            .map((c) => {
              const m = MORSE[c];
              if (!m) unknown.add(c);
              return m ?? "";
            })
            .filter(Boolean)
            .join(" "),
        )
        .filter(Boolean)
        .join(" / ");
      if (unknown.size) throw new Error(`Morse code has no symbol for: ${[...unknown].join(" ")}`);
      return out;
    }
  }
}

export function decode(text: string, scheme: Scheme): string {
  const t = text.trim();
  switch (scheme) {
    case "base64":
    case "base64url":
      return utf8Decode(base64ToBytes(t));
    case "url":
      try {
        return decodeURIComponent(t.replace(/\+/g, " "));
      } catch {
        throw new Error("Malformed percent-encoding (a % must be followed by two hex digits forming valid UTF-8).");
      }
    case "html":
      return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, body: string) => {
        if (body[0] === "#") {
          const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
        }
        return NAMED_DECODE[body] ?? NAMED_DECODE[body.toLowerCase()] ?? m;
      });
    case "unicode":
      return text
        .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\U([0-9a-f]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
    case "hex": {
      const clean = t.replace(/0x/gi, "").replace(/[\s,:-]/g, "");
      if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error("Hex input must be pairs of 0–9/A–F digits.");
      return utf8Decode(Uint8Array.from(clean.match(/../g) ?? [], (h) => parseInt(h, 16)));
    }
    case "binary": {
      const clean = t.replace(/[\s,]/g, "");
      if (clean.length % 8 || /[^01]/.test(clean)) throw new Error("Binary input must be groups of 8 bits (0 and 1).");
      return utf8Decode(Uint8Array.from(clean.match(/.{8}/g) ?? [], (b) => parseInt(b, 2)));
    }
    case "decimal": {
      if (!t) return "";
      const nums = t.split(/[\s,]+/);
      return nums
        .map((n) => {
          const cp = Number(n);
          if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) throw new Error(`"${n}" is not a valid code point.`);
          return String.fromCodePoint(cp);
        })
        .join("");
    }
    case "rot13":
      return ROT(text);
    case "morse":
      return t
        .split(/\s*(?:\/|\|)\s*|\s{3,}/)
        .map((w) =>
          w
            .split(/\s+/)
            .filter(Boolean)
            .map((sym) => {
              const s = sym.replace(/[•·]/g, ".").replace(/[—–_]/g, "-");
              const c = MORSE_REV[s];
              if (!c) throw new Error(`Unknown Morse sequence: ${sym}`);
              return c;
            })
            .join(""),
        )
        .join(" ");
  }
}

/** Best-effort guess of which scheme a string is encoded with (shown as a hint only). */
export function detectScheme(s: string): Scheme | null {
  const t = s.trim();
  if (!t) return null;
  if (/^[.\-/\s|]+$/.test(t) && /[.-]/.test(t)) return "morse";
  if (/^([01]{8}\s*)+$/.test(t)) return "binary";
  if (/^([0-9a-f]{2}[\s:]?)+$/i.test(t) && /\s/.test(t)) return "hex";
  if (/\\u[0-9a-f]{4}|\\u\{/i.test(t)) return "unicode";
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t)) return "html";
  if (/%[0-9a-f]{2}/i.test(t)) return "url";
  if (/^[A-Za-z0-9_-]+$/.test(t) && t.length >= 8 && /[-_]/.test(t)) return "base64url";
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length % 4 === 0 && t.length >= 8) return "base64";
  return null;
}
