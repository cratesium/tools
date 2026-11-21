/**
 * Text hashing with many algorithms at once. hash-wasm is imported dynamically so the
 * WebAssembly modules load only when hashing starts.
 */
import { bytesToBase64 } from "./base64";

export interface HashAlgorithm {
  id: string;
  label: string;
  bits: number;
  /** Supports a key (HMAC, or the algorithm's native keyed mode). */
  keyed: boolean;
  /** Not suitable for security; shown with a note. */
  insecure?: boolean;
  checksum?: boolean;
}

export const HASH_ALGORITHMS: HashAlgorithm[] = [
  { id: "md5", label: "MD5", bits: 128, keyed: true, insecure: true },
  { id: "sha1", label: "SHA-1", bits: 160, keyed: true, insecure: true },
  { id: "sha224", label: "SHA-224", bits: 224, keyed: true },
  { id: "sha256", label: "SHA-256", bits: 256, keyed: true },
  { id: "sha384", label: "SHA-384", bits: 384, keyed: true },
  { id: "sha512", label: "SHA-512", bits: 512, keyed: true },
  { id: "sha3-256", label: "SHA3-256", bits: 256, keyed: true },
  { id: "sha3-512", label: "SHA3-512", bits: 512, keyed: true },
  { id: "keccak256", label: "Keccak-256", bits: 256, keyed: true },
  { id: "blake2b", label: "BLAKE2b-512", bits: 512, keyed: true },
  { id: "blake3", label: "BLAKE3", bits: 256, keyed: true },
  { id: "ripemd160", label: "RIPEMD-160", bits: 160, keyed: true },
  { id: "crc32", label: "CRC32", bits: 32, keyed: false, checksum: true },
  { id: "xxhash64", label: "xxHash64", bits: 64, keyed: false, checksum: true },
];

export type HashOutput = "hex" | "HEX" | "base64";

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function formatDigest(hex: string, output: HashOutput): string {
  if (output === "HEX") return hex.toUpperCase();
  if (output === "base64") return bytesToBase64(hexToBytes(hex));
  return hex;
}

/**
 * Computes the hex digest. With a key: HMAC (RFC 2104) for MD/SHA/SHA3/Keccak/RIPEMD,
 * native keyed mode for BLAKE2b (key ≤ 64 bytes) and BLAKE3 (key must be exactly 32 bytes).
 */
export async function hashText(id: string, data: string | Uint8Array, key?: string): Promise<string | null> {
  const hw = await import("hash-wasm");
  const keyBytes = key ? new TextEncoder().encode(key) : undefined;
  if (keyBytes) {
    const hmac = async (factory: Parameters<typeof hw.createHMAC>[0]) => {
      const h = await hw.createHMAC(factory, keyBytes);
      h.init();
      h.update(data);
      return h.digest("hex");
    };
    switch (id) {
      case "md5": return hmac(hw.createMD5());
      case "sha1": return hmac(hw.createSHA1());
      case "sha224": return hmac(hw.createSHA224());
      case "sha256": return hmac(hw.createSHA256());
      case "sha384": return hmac(hw.createSHA384());
      case "sha512": return hmac(hw.createSHA512());
      case "sha3-256": return hmac(hw.createSHA3(256));
      case "sha3-512": return hmac(hw.createSHA3(512));
      case "keccak256": return hmac(hw.createKeccak(256));
      case "ripemd160": return hmac(hw.createRIPEMD160());
      case "blake2b": return keyBytes.length <= 64 ? hw.blake2b(data, 512, keyBytes) : null;
      case "blake3": return keyBytes.length === 32 ? hw.blake3(data, 256, keyBytes) : null;
      default: return null;
    }
  }
  switch (id) {
    case "md5": return hw.md5(data);
    case "sha1": return hw.sha1(data);
    case "sha224": return hw.sha224(data);
    case "sha256": return hw.sha256(data);
    case "sha384": return hw.sha384(data);
    case "sha512": return hw.sha512(data);
    case "sha3-256": return hw.sha3(data, 256);
    case "sha3-512": return hw.sha3(data, 512);
    case "keccak256": return hw.keccak(data, 256);
    case "blake2b": return hw.blake2b(data, 512);
    case "blake3": return hw.blake3(data, 256);
    case "ripemd160": return hw.ripemd160(data);
    case "crc32": return hw.crc32(data);
    case "xxhash64": return hw.xxhash64(data);
    default: return null;
  }
}

export interface HashRow {
  id: string;
  label: string;
  hex: string | null;
  note?: string;
}

export async function hashAll(text: string, key?: string): Promise<HashRow[]> {
  const data = new TextEncoder().encode(text);
  return Promise.all(
    HASH_ALGORITHMS.map(async (a) => {
      let note: string | undefined;
      if (key && !a.keyed) note = "Not keyed: plain checksum shown";
      if (key && a.id === "blake3" && new TextEncoder().encode(key).length !== 32) note = "BLAKE3 keyed mode needs a 32-byte key";
      if (key && a.id === "blake2b" && new TextEncoder().encode(key).length > 64) note = "BLAKE2b keys are limited to 64 bytes";
      const hex = await hashText(a.id, data, key && a.keyed ? key : undefined);
      return { id: a.id, label: key && a.keyed && !a.id.startsWith("blake") ? `HMAC-${a.label}` : a.label, hex, note };
    }),
  );
}
