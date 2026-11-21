/** UUID generation (v4, v7, nil, max) and inspection, per RFC 9562. Uses crypto.getRandomValues. */

export type UuidVersion = "v4" | "v7" | "nil" | "max";

function hex(bytes: Uint8Array): string {
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function random(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function uuidV4(rand: Uint8Array = random(16)): string {
  const b = new Uint8Array(rand);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return hex(b);
}

/**
 * UUID v7: 48-bit Unix ms timestamp + version + 12 bits rand_a + variant + 62 bits rand_b.
 * `seq` (when provided) replaces rand_a with a counter so UUIDs created in the same
 * millisecond stay strictly ordered (RFC 9562 §6.2 method 1).
 */
export function uuidV7(ms: number = Date.now(), rand: Uint8Array = random(16), seq?: number): string {
  const b = new Uint8Array(rand);
  const t = Math.floor(ms);
  if (t < 0 || t > 0xffffffffffff) throw new RangeError("Timestamp out of range for UUID v7");
  const hi = Math.floor(t / 2 ** 16);
  b[0] = (hi >>> 24) & 0xff;
  b[1] = (hi >>> 16) & 0xff;
  b[2] = (hi >>> 8) & 0xff;
  b[3] = hi & 0xff;
  b[4] = (t >>> 8) & 0xff;
  b[5] = t & 0xff;
  if (seq != null) {
    b[6] = 0x70 | ((seq >> 8) & 0x0f);
    b[7] = seq & 0xff;
  } else {
    b[6] = (b[6] & 0x0f) | 0x70;
  }
  b[8] = (b[8] & 0x3f) | 0x80;
  return hex(b);
}

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";
export const MAX_UUID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export interface UuidFormat {
  uppercase?: boolean;
  hyphens?: boolean;
  braces?: boolean;
  urn?: boolean;
}

export function formatUuid(u: string, f: UuidFormat = {}): string {
  let s = f.hyphens === false ? u.replace(/-/g, "") : u;
  if (f.uppercase) s = s.toUpperCase();
  if (f.braces) s = `{${s}}`;
  if (f.urn) s = `urn:uuid:${s}`;
  return s;
}

/** Generates `count` UUIDs. v7 batches are monotonic within the same millisecond. */
export function generateUuids(version: UuidVersion, count: number, now: () => number = Date.now): string[] {
  const n = Math.max(1, Math.min(10000, Math.floor(count)));
  const out: string[] = [];
  let lastMs = -1;
  let seq = 0;
  for (let i = 0; i < n; i++) {
    if (version === "nil") out.push(NIL_UUID);
    else if (version === "max") out.push(MAX_UUID);
    else if (version === "v4") out.push(uuidV4());
    else {
      let ms = now();
      if (ms <= lastMs) {
        ms = lastMs;
        seq++;
        if (seq > 0xfff) {
          ms = lastMs + 1; // counter overflow: borrow the next millisecond
          seq = random(2)[0] & 0x3ff;
        }
      } else {
        seq = random(2)[0] & 0x3ff; // random start leaves headroom for increments
      }
      lastMs = ms;
      out.push(uuidV7(ms, undefined, seq));
    }
  }
  return out;
}

export interface UuidInfo {
  valid: boolean;
  canonical?: string;
  version?: number;
  variant?: string;
  /** v1/v6/v7 embedded timestamp. */
  timestamp?: Date;
  note?: string;
}

const uuidRe = /^(?:urn:uuid:)?\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i;

export function inspectUuid(input: string): UuidInfo {
  const m = uuidRe.exec(input.trim());
  if (!m) return { valid: false, note: "Not a UUID: expected 32 hex digits, optionally as 8-4-4-4-12 with hyphens." };
  const canonical = `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`.toLowerCase();
  if (canonical === NIL_UUID) return { valid: true, canonical, note: "Nil UUID (all zeros)." };
  if (canonical === MAX_UUID) return { valid: true, canonical, note: "Max UUID (all ones, RFC 9562)." };
  const version = parseInt(canonical[14], 16);
  const v = parseInt(canonical[19], 16);
  const variant = v < 8 ? "NCS (reserved)" : v < 12 ? "RFC 9562 / RFC 4122" : v < 14 ? "Microsoft (reserved)" : "Future (reserved)";
  const info: UuidInfo = { valid: true, canonical, version, variant };
  const h = canonical.replace(/-/g, "");
  if (version === 7) {
    info.timestamp = new Date(parseInt(h.slice(0, 12), 16));
  } else if (version === 1 || version === 6) {
    // 60-bit count of 100 ns intervals since 1582-10-15
    const tHex = version === 1 ? h.slice(13, 16) + h.slice(8, 12) + h.slice(0, 8) : h.slice(0, 12) + h.slice(13, 16);
    const t = BigInt("0x" + tHex);
    const ms = Number((t - 122192928000000000n) / 10000n);
    info.timestamp = new Date(ms);
  }
  const names: Record<number, string> = {
    1: "time-based (MAC address)",
    2: "DCE security",
    3: "name-based (MD5)",
    4: "random",
    5: "name-based (SHA-1)",
    6: "reordered time-based",
    7: "Unix-time-ordered",
    8: "custom",
  };
  info.note = names[version] ? `Version ${version}: ${names[version]}.` : `Unknown version ${version}.`;
  return info;
}
