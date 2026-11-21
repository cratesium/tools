/** Short-link code helpers shared by /api/shorten and /s/[code]. Exports no route handler. */

export const CODE_LENGTH = 7;
export const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const CODE_PATTERN = /^[0-9A-Za-z]{7}$/;

export interface StoredLink {
  url: string;
  createdAt: string;
}

/** Random base62 code using rejection sampling (no modulo bias). */
export function generateCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    const buf = random(new Uint8Array(16));
    for (const b of buf) {
      if (b < 248) out += CODE_ALPHABET[b % 62]; // 248 = 62 * 4
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export function parseStoredLink(raw: string | null): StoredLink | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v.url === "string" ? { url: v.url, createdAt: String(v.createdAt ?? "") } : null;
  } catch {
    return null;
  }
}
