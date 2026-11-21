/**
 * Cryptographically secure, unbiased random selection built on crypto.getRandomValues.
 * Uses rejection sampling so every index in [0, n) is exactly equally likely (no modulo bias).
 */

export type RandomSource = (buf: Uint32Array) => Uint32Array;

const defaultSource: RandomSource = (buf) => globalThis.crypto.getRandomValues(buf);

/** Uniform integer in [0, n) for 1 ≤ n ≤ 2^32. */
export function randomInt(n: number, source: RandomSource = defaultSource): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError("n must be an integer in [1, 2^32]");
  if (n === 1) return 0;
  // Largest multiple of n that fits in 2^32; values at or above it are rejected.
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  for (;;) {
    source(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Picks `length` characters uniformly from `alphabet` (code points, so emoji/Unicode are safe). */
export function randomFromAlphabet(alphabet: string | string[], length: number, source: RandomSource = defaultSource): string {
  const chars = Array.isArray(alphabet) ? alphabet : Array.from(alphabet);
  if (!chars.length) throw new Error("The character set is empty.");
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length, source)];
  return out;
}

/** Fisher–Yates shuffle with unbiased indices. */
export function shuffle<T>(arr: T[], source: RandomSource = defaultSource): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, source);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>/?~",
  hex: "0123456789abcdef",
  base58: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  urlSafe: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
} as const;

/** Visually ambiguous characters removed by the "avoid ambiguous" option. */
export const AMBIGUOUS = "Il1O0o|`'\"";

export interface PasswordOptions {
  length: number;
  lower?: boolean;
  upper?: boolean;
  digits?: boolean;
  symbols?: boolean;
  /** Custom symbol set replacing the default. */
  symbolSet?: string;
  avoidAmbiguous?: boolean;
  /** Characters to exclude entirely. */
  exclude?: string;
  /** Guarantee at least one character from every selected class. */
  requireEach?: boolean;
}

export function passwordClasses(opts: PasswordOptions): string[] {
  const strip = (s: string) =>
    Array.from(new Set(Array.from(s)))
      .filter((c) => !(opts.avoidAmbiguous && AMBIGUOUS.includes(c)) && !(opts.exclude ?? "").includes(c))
      .join("");
  const classes: string[] = [];
  if (opts.lower) classes.push(strip(CHARSETS.lower));
  if (opts.upper) classes.push(strip(CHARSETS.upper));
  if (opts.digits) classes.push(strip(CHARSETS.digits));
  if (opts.symbols) classes.push(strip(opts.symbolSet ?? CHARSETS.symbols));
  return classes.filter(Boolean);
}

export function generatePassword(opts: PasswordOptions, source: RandomSource = defaultSource): string {
  const classes = passwordClasses(opts);
  if (!classes.length) throw new Error("Select at least one character type.");
  const all = Array.from(new Set(classes.join("")));
  if (!Number.isInteger(opts.length) || opts.length < 1) throw new Error("Length must be at least 1.");
  if (!opts.requireEach || opts.length < classes.length) return randomFromAlphabet(all, opts.length, source);
  // Rejection sampling over whole passwords keeps the distribution uniform over all
  // passwords that satisfy the constraint (unlike "insert one of each then shuffle").
  for (let attempt = 0; attempt < 1000; attempt++) {
    const pw = randomFromAlphabet(all, opts.length, source);
    if (classes.every((cls) => Array.from(pw).some((c) => cls.includes(c)))) return pw;
  }
  // Practically unreachable; fall back to a guaranteed construction.
  const chars = classes.map((cls) => randomFromAlphabet(cls, 1, source));
  while (chars.length < opts.length) chars.push(randomFromAlphabet(all, 1, source));
  return shuffle(chars, source).join("");
}

/** Entropy in bits of a uniformly random string of `length` symbols from an alphabet of `size`. */
export function entropyBits(alphabetSize: number, length: number): number {
  if (alphabetSize <= 1 || length <= 0) return 0;
  return length * Math.log2(alphabetSize);
}

export function passwordEntropy(opts: PasswordOptions): number {
  const size = new Set(passwordClasses(opts).join("")).size;
  return entropyBits(size, opts.length);
}

export function strengthLabel(bits: number): { label: string; tone: "danger" | "warning" | "success" } {
  if (bits < 40) return { label: "Weak", tone: "danger" };
  if (bits < 60) return { label: "Fair", tone: "warning" };
  if (bits < 80) return { label: "Strong", tone: "success" };
  return { label: "Very strong", tone: "success" };
}

/** Short word list for memorable passphrases (EFF-style; 512 words → 9 bits per word). */
export const PASSPHRASE_WORDS = (
  "able acid aged also area army away baby back ball band bank base bath bear beat bell belt best bike bird blow blue boat body bold bone book boot born boss both bowl bulk burn bush busy cake calm came camp card care cart case cash cast cave cell chef chip city clay clip club coal coat code coin cold cook cool copy cord core corn cost crew crop cube cure dark data date dawn deal deck deep deer desk dial dice diet dirt dish dock door dose down draw drum duck dune dust duty each earn east easy echo edge epic even exit face fact fair fall farm fast fern file film fire firm fish five flag flat flow foam fold folk food foot fork form fort four free frog fuel full fund gain game gate gear gift girl glad glow goal gold golf good grab gray grid grin grip half hall hand harp hawk heat herb hero high hike hill hint hive hold hole home hood hook hope horn host hour huge hunt idea inch iron item jade jazz jeep join joke jump june jury keen keep kept kick kind king kite knee knot lake lamb lamp land lane last lava lawn lead leaf lean left lens life lift lime line link lion list live load loaf lock loft long loop lord loud love luck lung made mail main make malt many maps mark mars mask mast math maze meal meat mesh mild mile milk mill mind mint mist mode mole moon moss moth move much mule must name navy neat neck nest news next nice nine node noon norm nose note nova oath oboe odds oils okay omen once only opal open oval oven over pace pack page pain palm park part path peak pear peel pine pink pipe plan play plot plum poem poet pole pond pony pool port pose post pour pulp puma pure push quad quiz race rack raft rail rain ramp rank rare rays read real reef rest rice rich ride ring ripe rise road roar robe rock role roof room root rope rose ruby rule rush safe sage sail salt sand save scan seal seat seed self send ship shoe shop shot show sign silk sing sink site size skip slab slow snap snow soap sock soda sofa soft soil solo song soup spin spot star stay stem step stir suit sung surf swan swim tail talk tall tank tape task taxi team tear tent term test text thaw tide tile time tiny tire toad tofu tone tool town tram tree trim trip tuba tube tune turf turn twin type unit upon used vast veil vent verb very vest view vine visa void volt vote wade wage wait wake walk wall wand warm wave wavy wax weak web weed week well west whale wheat wheel whip wide wife wild will wind wine wing wire wise wish wolf wood wool word work worm wrap yard yarn year yell yoga zebra zero zinc zone zoom acorn adobe agent album alley alpha amber angle ankle apple apron arena arrow aspen atlas attic audio avoid award bacon badge bagel baker banjo barn basil beach bench berry bison blade blank blaze blend bliss block bloom board bonus boost brain brave bread brick brook brush cabin cable camel candy canoe cargo cedar chalk charm chess chili cider cliff climb clock cloud coast cobra comet coral couch crane crisp crown"
).split(" ");

export function generatePassphrase(words: number, separator = "-", capitalize = false, source: RandomSource = defaultSource): string {
  const list = Array.from(new Set(PASSPHRASE_WORDS));
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    const w = list[randomInt(list.length, source)];
    out.push(capitalize ? w[0].toUpperCase() + w.slice(1) : w);
  }
  return out.join(separator);
}

export function passphraseEntropy(words: number): number {
  return entropyBits(new Set(PASSPHRASE_WORDS).size, words);
}
