/**
 * HTML entity encoding/decoding. Pure (no DOM), so it is safe to run on untrusted input.
 * The named table covers the complete HTML 4.01 set (252 entities) plus common HTML5
 * additions. Unknown named references are left untouched when decoding.
 */

const latin1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
const greekUpper = "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho";
const greekUpper2 = "Sigma Tau Upsilon Phi Chi Psi Omega";
const greekLower =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf sigma tau upsilon phi chi psi omega";

const explicit: Record<string, number> = {
  quot: 34, amp: 38, lt: 60, gt: 62, apos: 39,
  OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, fnof: 402, circ: 710, tilde: 732,
  thetasym: 977, upsih: 978, piv: 982,
  ensp: 8194, emsp: 8195, thinsp: 8201, zwnj: 8204, zwj: 8205, lrm: 8206, rlm: 8207,
  ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222,
  dagger: 8224, Dagger: 8225, bull: 8226, hellip: 8230, permil: 8240, prime: 8242, Prime: 8243,
  lsaquo: 8249, rsaquo: 8250, oline: 8254, frasl: 8260, euro: 8364,
  image: 8465, weierp: 8472, real: 8476, trade: 8482, alefsym: 8501,
  larr: 8592, uarr: 8593, rarr: 8594, darr: 8595, harr: 8596, crarr: 8629,
  lArr: 8656, uArr: 8657, rArr: 8658, dArr: 8659, hArr: 8660,
  forall: 8704, part: 8706, exist: 8707, empty: 8709, nabla: 8711, isin: 8712, notin: 8713, ni: 8715,
  prod: 8719, sum: 8721, minus: 8722, lowast: 8727, radic: 8730, prop: 8733, infin: 8734, ang: 8736,
  and: 8743, or: 8744, cap: 8745, cup: 8746, int: 8747, there4: 8756, sim: 8764, cong: 8773, asymp: 8776,
  ne: 8800, equiv: 8801, le: 8804, ge: 8805, sub: 8834, sup: 8835, nsub: 8836, sube: 8838, supe: 8839,
  oplus: 8853, otimes: 8855, perp: 8869, sdot: 8901, lceil: 8968, rceil: 8969, lfloor: 8970, rfloor: 8971,
  // HTML5 maps lang/rang to the mathematical angle brackets.
  lang: 10216, rang: 10217,
  loz: 9674, spades: 9824, clubs: 9827, hearts: 9829, diams: 9830,
  // Common HTML5 additions
  Tab: 9, NewLine: 10, excl: 33, num: 35, dollar: 36, percnt: 37, lpar: 40, rpar: 41, ast: 42, plus: 43,
  comma: 44, period: 46, sol: 47, colon: 58, semi: 59, equals: 61, quest: 63, commat: 64, lsqb: 91,
  bsol: 92, rsqb: 93, Hat: 94, lowbar: 95, grave: 96, lcub: 123, verbar: 124, vert: 124, rcub: 125,
  AMP: 38, LT: 60, GT: 62, QUOT: 34, COPY: 169, REG: 174, TRADE: 8482, half: 189, centerdot: 183,
  hyphen: 8208, dash: 8208, nbhy: 8209, check: 10003, cross: 10007, star: 9734, starf: 9733,
  phone: 9742, female: 9792, male: 9794, sharp: 9839, flat: 9837, natural: 9838, copysr: 8471,
  laquo: 171, raquo: 187, emsp13: 8196, emsp14: 8197, numsp: 8199, puncsp: 8200, hairsp: 8202,
  ZeroWidthSpace: 8203, NonBreakingSpace: 160, rarrw: 8605, lrarr: 8646, mapsto: 8614, deg: 176,
  times: 215, divide: 247, frac13: 8531, frac23: 8532, frac18: 8539, frac38: 8540, frac58: 8541, frac78: 8542,
  pi: 960, ohm: 937, micro: 181, angst: 197,
};

export const NAMED_ENTITIES: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  latin1.split(" ").forEach((n, i) => (m[n] = 160 + i));
  greekUpper.split(" ").forEach((n, i) => (m[n] = 913 + i));
  greekUpper2.split(" ").forEach((n, i) => (m[n] = 931 + i));
  greekLower.split(" ").forEach((n, i) => (m[n] = 945 + i));
  Object.assign(m, explicit);
  return m;
})();

/** Code point → preferred entity name (first HTML4 name wins over aliases). */
const preferredName: Map<number, string> = (() => {
  const m = new Map<number, string>();
  const aliases = new Set(["AMP", "LT", "GT", "QUOT", "COPY", "REG", "TRADE", "half", "centerdot", "dash", "vert", "ohm", "angst", "NonBreakingSpace"]);
  for (const [name, cp] of Object.entries(NAMED_ENTITIES)) {
    if (aliases.has(name)) continue;
    if (cp === 9 || cp === 10) continue; // never encode Tab / NewLine as entities
    if (!m.has(cp)) m.set(cp, name);
  }
  return m;
})();

export type EntityEncodeMode = "minimal" | "named" | "decimal" | "hex";

export interface EntityEncodeOptions {
  mode?: EntityEncodeMode;
  /** Encode apostrophe/quote (needed inside attributes). Default true. */
  quotes?: boolean;
  /** In minimal mode, also encode every non-ASCII character numerically. */
  nonAscii?: boolean;
}

const specials: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function encodeEntities(text: string, opts: EntityEncodeOptions = {}): string {
  const { mode = "minimal", quotes = true, nonAscii = false } = opts;
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch in specials) {
      if (!quotes && (ch === '"' || ch === "'")) out += ch;
      else if (mode === "decimal" && (ch === '"' || ch === "'")) out += `&#${cp};`;
      else if (mode === "hex" && (ch === '"' || ch === "'")) out += `&#x${cp.toString(16).toUpperCase()};`;
      else out += specials[ch];
      continue;
    }
    if (cp < 128) {
      out += ch;
      continue;
    }
    switch (mode) {
      case "minimal":
        out += nonAscii ? `&#${cp};` : ch;
        break;
      case "named": {
        const name = preferredName.get(cp);
        out += name ? `&${name};` : `&#${cp};`;
        break;
      }
      case "decimal":
        out += `&#${cp};`;
        break;
      case "hex":
        out += `&#x${cp.toString(16).toUpperCase()};`;
        break;
    }
  }
  return out;
}

/** HTML spec: numeric references in 0x80–0x9F are interpreted as Windows-1252. */
const win1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

export interface DecodeResult {
  text: string;
  /** Named references that were not in the table and were left as-is. */
  unknown: string[];
  decoded: number;
}

export function decodeEntitiesDetailed(text: string): DecodeResult {
  const unknown = new Set<string>();
  let decoded = 0;
  const out = text.replace(/&(?:#[xX]([0-9a-fA-F]{1,8});?|#([0-9]{1,10});?|([A-Za-z][A-Za-z0-9]{0,31});)/g, (m, hex, dec, name) => {
    if (name) {
      const cp = NAMED_ENTITIES[name];
      if (cp == null) {
        unknown.add(m);
        return m;
      }
      decoded++;
      return String.fromCodePoint(cp);
    }
    let cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    if (win1252[cp]) cp = win1252[cp];
    if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) cp = 0xfffd;
    decoded++;
    return String.fromCodePoint(cp);
  });
  return { text: out, unknown: [...unknown], decoded };
}

export function decodeEntities(text: string): string {
  return decodeEntitiesDetailed(text).text;
}
