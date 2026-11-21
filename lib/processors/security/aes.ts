/**
 * UtilityHub encryption container, version 1 ("UHE1"). Web Crypto only.
 *
 *   offset  size  field
 *   0       4     magic "UHE1" (55 48 45 31)
 *   4       1     format version = 1
 *   5       1     cipher: 1 = AES-256-GCM, 2 = AES-256-CBC + HMAC-SHA-256 (encrypt-then-MAC)
 *   6       1     key mode: 1 = passphrase (PBKDF2-HMAC-SHA-256), 2 = raw 256-bit key
 *   7       1     reserved (0)
 *   8       4     PBKDF2 iterations, unsigned big-endian (0 for raw keys)
 *   12      16    random salt
 *   28      12|16 random IV (12 bytes for GCM, 16 for CBC)
 *   …       n     ciphertext (GCM: includes the 16-byte authentication tag at the end)
 *   end-32  32    CBC only: HMAC-SHA-256 over every preceding byte
 *
 * GCM authenticates the header (bytes 0 … end of IV) as additional data, so tampering with
 * any field, including the iteration count, makes decryption fail.
 * Keys: passphrase → PBKDF2-SHA-256(salt, iterations) → 256-bit key (GCM) or 512 bits split into
 * encryption + MAC keys (CBC). Raw key → used directly (GCM) or expanded with HKDF-SHA-256 (CBC).
 * Text output is the whole container encoded as standard Base64; files are written as binary ".enc".
 */

import { fromBase64, fromHex, toBase64 } from "./hash";

export const MAGIC = [0x55, 0x48, 0x45, 0x31] as const;
export const VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 310_000;
const MAX_ITERATIONS = 10_000_000;
const SALT_LEN = 16;
const HEADER_LEN = 12;

export type Cipher = "aes-256-gcm" | "aes-256-cbc-hmac";
export type KeyInput = { passphrase: string; iterations?: number } | { rawKey: Uint8Array };

const CIPHER_ID: Record<Cipher, number> = { "aes-256-gcm": 1, "aes-256-cbc-hmac": 2 };

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto is unavailable. Use HTTPS and a modern browser.");
  return s;
}

function rand(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

const bs = (u: Uint8Array) => u as unknown as BufferSource;

export class DecryptionError extends Error {
  constructor(message = "Decryption failed: wrong password/key, or the data was modified or corrupted.") {
    super(message);
    this.name = "DecryptionError";
  }
}

/** Parse a raw AES-256 key given as 64 hex characters or Base64 of 32 bytes. */
export function parseRawKey(input: string): Uint8Array {
  const s = input.trim();
  let key: Uint8Array;
  if (/^(0x)?[0-9a-f]{64}$/i.test(s)) key = fromHex(s);
  else {
    try {
      key = fromBase64(s);
    } catch {
      throw new Error("Key must be 64 hex characters or Base64 of 32 bytes.");
    }
  }
  if (key.length !== 32) throw new Error(`An AES-256 key is 32 bytes; this one is ${key.length} bytes.`);
  return key;
}

export function generateRawKey(): Uint8Array {
  return rand(32);
}

async function deriveKeys(
  cipher: Cipher,
  key: KeyInput,
  salt: Uint8Array,
  iterations: number,
): Promise<{ enc: CryptoKey; mac?: CryptoKey }> {
  const s = subtle();
  const encAlg = cipher === "aes-256-gcm" ? "AES-GCM" : "AES-CBC";
  if ("passphrase" in key) {
    const base = await s.importKey("raw", bs(new TextEncoder().encode(key.passphrase.normalize("NFC"))), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(
      await s.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bs(salt), iterations }, base, cipher === "aes-256-gcm" ? 256 : 512),
    );
    const enc = await s.importKey("raw", bs(bits.slice(0, 32)), encAlg, false, ["encrypt", "decrypt"]);
    if (cipher === "aes-256-gcm") return { enc };
    const mac = await s.importKey("raw", bs(bits.slice(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return { enc, mac };
  }
  if (key.rawKey.length !== 32) throw new Error("Raw key must be 32 bytes (256 bits).");
  if (cipher === "aes-256-gcm") return { enc: await s.importKey("raw", bs(key.rawKey), "AES-GCM", false, ["encrypt", "decrypt"]) };
  const hk = await s.importKey("raw", bs(key.rawKey), "HKDF", false, ["deriveBits"]);
  const bits = new Uint8Array(await s.deriveBits({ name: "HKDF", hash: "SHA-256", salt: bs(salt), info: bs(new TextEncoder().encode("UHE1 cbc-hmac")) }, hk, 512));
  return {
    enc: await s.importKey("raw", bs(bits.slice(0, 32)), "AES-CBC", false, ["encrypt", "decrypt"]),
    mac: await s.importKey("raw", bs(bits.slice(32)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]),
  };
}

export async function encryptBytes(plain: Uint8Array, key: KeyInput, cipher: Cipher = "aes-256-gcm"): Promise<Uint8Array> {
  const isPass = "passphrase" in key;
  if (isPass && !key.passphrase) throw new Error("Enter a password.");
  const iterations = isPass ? (key.iterations ?? DEFAULT_ITERATIONS) : 0;
  if (isPass && (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS))
    throw new Error(`Iterations must be between ${MIN_ITERATIONS.toLocaleString()} and ${MAX_ITERATIONS.toLocaleString()}.`);
  const salt = rand(SALT_LEN);
  const iv = rand(cipher === "aes-256-gcm" ? 12 : 16);
  const header = new Uint8Array(HEADER_LEN);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  header[5] = CIPHER_ID[cipher];
  header[6] = isPass ? 1 : 2;
  new DataView(header.buffer).setUint32(8, iterations, false);
  const prefix = concat([header, salt, iv]);
  const keys = await deriveKeys(cipher, key, salt, iterations);
  const s = subtle();
  if (cipher === "aes-256-gcm") {
    const ct = new Uint8Array(await s.encrypt({ name: "AES-GCM", iv: bs(iv), additionalData: bs(prefix), tagLength: 128 }, keys.enc, bs(plain)));
    return concat([prefix, ct]);
  }
  const ct = new Uint8Array(await s.encrypt({ name: "AES-CBC", iv: bs(iv) }, keys.enc, bs(plain)));
  const body = concat([prefix, ct]);
  const tag = new Uint8Array(await s.sign("HMAC", keys.mac!, bs(body)));
  return concat([body, tag]);
}

export interface ContainerInfo {
  version: number;
  cipher: Cipher;
  keyMode: "passphrase" | "raw";
  iterations: number;
}

export function inspectContainer(data: Uint8Array): ContainerInfo {
  if (data.length < HEADER_LEN + SALT_LEN + 12 + 16 || MAGIC.some((m, i) => data[i] !== m))
    throw new Error("This is not UtilityHub-encrypted data (missing UHE1 header).");
  if (data[4] !== VERSION) throw new Error(`Unsupported container version ${data[4]}.`);
  const cipher: Cipher | null = data[5] === 1 ? "aes-256-gcm" : data[5] === 2 ? "aes-256-cbc-hmac" : null;
  if (!cipher) throw new Error(`Unknown cipher id ${data[5]}.`);
  const keyMode = data[6] === 1 ? "passphrase" : data[6] === 2 ? "raw" : null;
  if (!keyMode) throw new Error(`Unknown key mode ${data[6]}.`);
  const iterations = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(8, false);
  return { version: data[4], cipher, keyMode, iterations };
}

export async function decryptBytes(data: Uint8Array, key: KeyInput): Promise<Uint8Array> {
  const info = inspectContainer(data);
  if (info.keyMode === "passphrase" && !("passphrase" in key)) throw new Error("This data was encrypted with a password, not a raw key.");
  if (info.keyMode === "raw" && !("rawKey" in key)) throw new Error("This data was encrypted with a raw key, not a password.");
  if (info.keyMode === "passphrase" && (info.iterations < 1 || info.iterations > MAX_ITERATIONS)) throw new DecryptionError("Invalid iteration count in header.");
  const ivLen = info.cipher === "aes-256-gcm" ? 12 : 16;
  const prefixLen = HEADER_LEN + SALT_LEN + ivLen;
  const salt = data.slice(HEADER_LEN, HEADER_LEN + SALT_LEN);
  const iv = data.slice(HEADER_LEN + SALT_LEN, prefixLen);
  const keys = await deriveKeys(info.cipher, key, salt, info.iterations);
  const s = subtle();
  try {
    if (info.cipher === "aes-256-gcm") {
      const pt = await s.decrypt(
        { name: "AES-GCM", iv: bs(iv), additionalData: bs(data.slice(0, prefixLen)), tagLength: 128 },
        keys.enc,
        bs(data.slice(prefixLen)),
      );
      return new Uint8Array(pt);
    }
    if (data.length < prefixLen + 16 + 32) throw new DecryptionError("Data is truncated.");
    const body = data.slice(0, data.length - 32);
    const tag = data.slice(data.length - 32);
    const ok = await s.verify("HMAC", keys.mac!, bs(tag), bs(body));
    if (!ok) throw new DecryptionError();
    return new Uint8Array(await s.decrypt({ name: "AES-CBC", iv: bs(iv) }, keys.enc, bs(body.slice(prefixLen))));
  } catch (e) {
    if (e instanceof DecryptionError) throw e;
    throw new DecryptionError();
  }
}

export async function encryptText(text: string, key: KeyInput, cipher: Cipher = "aes-256-gcm"): Promise<string> {
  return toBase64(await encryptBytes(new TextEncoder().encode(text), key, cipher));
}

export async function decryptText(b64: string, key: KeyInput): Promise<string> {
  let data: Uint8Array;
  try {
    data = fromBase64(b64.trim());
  } catch {
    throw new Error("The input is not valid Base64.");
  }
  const plain = await decryptBytes(data, key);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw new Error("Decrypted data is not UTF-8 text. It may be a file; use AES Decryption in file mode.");
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
