/**
 * Hashing on top of hash-wasm (WebAssembly, streaming). hash-wasm is imported lazily.
 * Large files are read in fixed-size slices so memory stays flat and progress is real.
 */

export type HashAlgorithm = "md5" | "sha1" | "sha224" | "sha256" | "sha384" | "sha512" | "sha3-256" | "sha3-512" | "crc32" | "xxh64" | "blake3";

export const HASH_INFO: Record<HashAlgorithm, { label: string; bits: number; secure: boolean; hmac: boolean }> = {
  md5: { label: "MD5", bits: 128, secure: false, hmac: true },
  sha1: { label: "SHA-1", bits: 160, secure: false, hmac: true },
  sha224: { label: "SHA-224", bits: 224, secure: true, hmac: true },
  sha256: { label: "SHA-256", bits: 256, secure: true, hmac: true },
  sha384: { label: "SHA-384", bits: 384, secure: true, hmac: true },
  sha512: { label: "SHA-512", bits: 512, secure: true, hmac: true },
  "sha3-256": { label: "SHA3-256", bits: 256, secure: true, hmac: true },
  "sha3-512": { label: "SHA3-512", bits: 512, secure: true, hmac: true },
  crc32: { label: "CRC-32", bits: 32, secure: false, hmac: false },
  xxh64: { label: "xxHash64", bits: 64, secure: false, hmac: false },
  blake3: { label: "BLAKE3", bits: 256, secure: true, hmac: false },
};

export interface Hasher {
  init(): unknown;
  update(data: Uint8Array | string): unknown;
  digest(outputType: "binary"): Uint8Array;
}

export async function createHasher(algo: HashAlgorithm, hmacKey?: Uint8Array | string): Promise<Hasher> {
  const hw = await import("hash-wasm");
  const make = (): Promise<Hasher> => {
    switch (algo) {
      case "md5":
        return hw.createMD5();
      case "sha1":
        return hw.createSHA1();
      case "sha224":
        return hw.createSHA224();
      case "sha256":
        return hw.createSHA256();
      case "sha384":
        return hw.createSHA384();
      case "sha512":
        return hw.createSHA512();
      case "sha3-256":
        return hw.createSHA3(256);
      case "sha3-512":
        return hw.createSHA3(512);
      case "crc32":
        return hw.createCRC32();
      case "xxh64":
        return hw.createXXHash64();
      case "blake3":
        return hw.createBLAKE3();
    }
  };
  if (hmacKey != null && hmacKey !== "") {
    if (!HASH_INFO[algo].hmac) throw new Error(`HMAC is not defined for ${HASH_INFO[algo].label}.`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = await hw.createHMAC(make() as any, hmacKey);
    h.init();
    return h as Hasher;
  }
  const h = await make();
  h.init();
  return h;
}

export function toHex(bytes: Uint8Array, upper = false): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return upper ? s.toUpperCase() : s;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").replace(/[\s:]/g, "");
  if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error("Invalid hexadecimal string.");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export type DigestEncoding = "hex" | "HEX" | "base64";

export function encodeDigest(bytes: Uint8Array, enc: DigestEncoding): string {
  return enc === "base64" ? toBase64(bytes) : toHex(bytes, enc === "HEX");
}

/** Hash a string (UTF-8) or bytes. */
export async function hashData(algo: HashAlgorithm, data: string | Uint8Array, hmacKey?: string): Promise<Uint8Array> {
  const h = await createHasher(algo, hmacKey || undefined);
  h.update(typeof data === "string" ? new TextEncoder().encode(data) : data);
  return h.digest("binary");
}

export const CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Hash a Blob/File with several algorithms in one streaming pass.
 * `onProgress` receives bytes processed / total (real progress).
 */
export async function hashBlob(
  blob: Blob,
  algos: HashAlgorithm[],
  { onProgress, signal, hmacKey, chunkSize = CHUNK_SIZE }: { onProgress?: (f: number) => void; signal?: AbortSignal; hmacKey?: string; chunkSize?: number } = {},
): Promise<Record<string, Uint8Array>> {
  const hashers = await Promise.all(algos.map((a) => createHasher(a, hmacKey || undefined)));
  const total = blob.size;
  for (let off = 0; off < total; off += chunkSize) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const chunk = new Uint8Array(await blob.slice(off, Math.min(total, off + chunkSize)).arrayBuffer());
    for (const h of hashers) h.update(chunk);
    onProgress?.(Math.min(1, (off + chunk.length) / (total || 1)));
  }
  if (total === 0) onProgress?.(1);
  const out: Record<string, Uint8Array> = {};
  algos.forEach((a, i) => (out[a] = hashers[i].digest("binary")));
  return out;
}

/** Candidate algorithms for a pasted digest, by its length/encoding. */
export function detectAlgorithms(digest: string): { encoding: "hex" | "base64"; algorithms: HashAlgorithm[] } | null {
  const s = digest.trim().replace(/^0x/i, "");
  let bytes: number | null = null;
  let encoding: "hex" | "base64" = "hex";
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) bytes = s.length / 2;
  else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) {
    encoding = "base64";
    try {
      bytes = fromBase64(s).length;
    } catch {
      bytes = null;
    }
  }
  if (bytes == null) return null;
  const byBytes: Record<number, HashAlgorithm[]> = {
    4: ["crc32"],
    8: ["xxh64"],
    16: ["md5"],
    20: ["sha1"],
    28: ["sha224"],
    32: ["sha256", "sha3-256", "blake3"],
    48: ["sha384"],
    64: ["sha512", "sha3-512"],
  };
  const algorithms = byBytes[bytes];
  return algorithms ? { encoding, algorithms } : null;
}

/** Parse a digest string (hex or base64) to bytes. */
export function parseDigest(digest: string): Uint8Array {
  const s = digest.trim().replace(/^0x/i, "");
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0) return fromHex(s);
  return fromBase64(s);
}

/**
 * Constant-time comparison of two byte arrays (time depends only on length).
 * Not security-critical in a client-side checker, but avoids early-exit comparisons.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Extracts a digest from common checksum-file lines: "<hash>  file", "<hash> *file",
 * "SHA256 (file) = <hash>" (BSD style) or a bare hash.
 */
export function extractDigest(line: string): string {
  const t = line.trim();
  const bsd = t.match(/^[A-Z0-9-]+\s*\(.*\)\s*=\s*([0-9a-fA-F]+)$/);
  if (bsd) return bsd[1];
  const gnu = t.match(/^([0-9a-fA-F]{8,})\s+\*?.+$/);
  if (gnu) return gnu[1];
  return t;
}
