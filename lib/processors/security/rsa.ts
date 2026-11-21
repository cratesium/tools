/** RSA key pair generation with Web Crypto, exported as PEM (SPKI / PKCS#8) and JWK. */

import { toBase64 } from "./hash";

export type RsaAlgorithm = "RSA-OAEP" | "RSA-PSS" | "RSASSA-PKCS1-v1_5";
export type RsaHash = "SHA-256" | "SHA-384" | "SHA-512";
export type RsaBits = 2048 | 3072 | 4096;

export interface RsaKeyPairResult {
  algorithm: RsaAlgorithm;
  hash: RsaHash;
  bits: RsaBits;
  publicPem: string;
  privatePem: string;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  /** SHA-256 over the DER SPKI, base64 (like OpenSSH/OpenSSL "pin-sha256"). */
  fingerprint: string;
}

export function toPem(der: ArrayBuffer | Uint8Array, label: string): string {
  const b64 = toBase64(der instanceof Uint8Array ? der : new Uint8Array(der));
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export function usagesFor(alg: RsaAlgorithm): { pub: KeyUsage[]; priv: KeyUsage[] } {
  return alg === "RSA-OAEP" ? { pub: ["encrypt", "wrapKey"], priv: ["decrypt", "unwrapKey"] } : { pub: ["verify"], priv: ["sign"] };
}

export async function generateRsaKeyPair(algorithm: RsaAlgorithm, bits: RsaBits, hash: RsaHash = "SHA-256"): Promise<RsaKeyPairResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is unavailable. Use HTTPS and a modern browser.");
  const u = usagesFor(algorithm);
  const pair = (await subtle.generateKey(
    { name: algorithm, modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash },
    true,
    [...u.pub, ...u.priv],
  )) as CryptoKeyPair;
  const [spki, pkcs8, publicJwk, privateJwk] = await Promise.all([
    subtle.exportKey("spki", pair.publicKey),
    subtle.exportKey("pkcs8", pair.privateKey),
    subtle.exportKey("jwk", pair.publicKey),
    subtle.exportKey("jwk", pair.privateKey),
  ]);
  const fp = new Uint8Array(await subtle.digest("SHA-256", spki));
  return {
    algorithm,
    hash,
    bits,
    publicPem: toPem(spki, "PUBLIC KEY"),
    privatePem: toPem(pkcs8, "PRIVATE KEY"),
    publicJwk,
    privateJwk,
    fingerprint: toBase64(fp),
  };
}

/** Parses a PEM block back to DER bytes. */
export function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
