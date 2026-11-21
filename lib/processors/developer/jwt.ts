/**
 * JSON Web Token (JWS compact serialization) decoding, signing and verification using
 * the Web Crypto API. Runs in browsers and in Node ≥ 20 (globalThis.crypto.subtle).
 */
import { base64ToBytes, bytesToBase64, bytesToUtf8 } from "./base64";

export const JWT_ALGS = ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512"] as const;
export type JwtAlg = (typeof JWT_ALGS)[number];

export class JwtError extends Error {}

export function b64urlEncodeBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes, { urlSafe: true, padding: false });
}
export function b64urlEncodeText(text: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(text));
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: unknown;
  /** Raw payload text (may be non-JSON for unusual tokens). */
  payloadText: string;
  signature: string;
  signingInput: string;
  alg: string | undefined;
}

function decodeSegment(seg: string, name: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(seg)) throw new JwtError(`The ${name} contains characters that are not Base64URL.`);
  const text = bytesToUtf8(base64ToBytes(seg));
  if (text == null) throw new JwtError(`The ${name} is not valid UTF-8.`);
  return text;
}

export function decodeJwt(token: string): DecodedJwt {
  const t = token.trim().replace(/^Bearer\s+/i, "");
  if (!t) throw new JwtError("Paste a token to decode.");
  const parts = t.split(".");
  if (parts.length === 5) throw new JwtError("This looks like an encrypted JWE (5 parts). Only signed JWS tokens (3 parts) can be decoded without the key.");
  if (parts.length !== 3) throw new JwtError(`A JWT has 3 dot-separated parts; this input has ${parts.length}.`);
  const headerText = decodeSegment(parts[0], "header");
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(headerText);
  } catch {
    throw new JwtError("The header is not valid JSON.");
  }
  if (!header || typeof header !== "object" || Array.isArray(header)) throw new JwtError("The header must be a JSON object.");
  const payloadText = decodeSegment(parts[1], "payload");
  let payload: unknown = payloadText;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    /* non-JSON payloads are allowed by JWS; keep the raw text */
  }
  if (!/^[A-Za-z0-9_-]*$/.test(parts[2])) throw new JwtError("The signature contains characters that are not Base64URL.");
  return {
    header,
    payload,
    payloadText,
    signature: parts[2],
    signingInput: `${parts[0]}.${parts[1]}`,
    alg: typeof header.alg === "string" ? header.alg : undefined,
  };
}

export interface ClaimInfo {
  claim: string;
  label: string;
  value: unknown;
  /** ISO date for NumericDate claims. */
  date?: string;
  note?: string;
}

const claimLabels: Record<string, string> = {
  iss: "Issuer",
  sub: "Subject",
  aud: "Audience",
  exp: "Expires at",
  nbf: "Not before",
  iat: "Issued at",
  jti: "JWT ID",
  azp: "Authorized party",
  scope: "Scope",
  nonce: "Nonce",
  auth_time: "Authentication time",
};

export function describeClaims(payload: unknown, nowSec = Date.now() / 1000): ClaimInfo[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const out: ClaimInfo[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const info: ClaimInfo = { claim: k, label: claimLabels[k] ?? "", value: v };
    if (["exp", "nbf", "iat", "auth_time"].includes(k) && typeof v === "number" && Number.isFinite(v)) {
      info.date = new Date(v * 1000).toISOString();
      const diff = v - nowSec;
      if (k === "exp") info.note = diff < 0 ? `Expired ${humanDuration(-diff)} ago` : `Expires in ${humanDuration(diff)}`;
      else if (k === "nbf") info.note = diff > 0 ? `Not valid for another ${humanDuration(diff)}` : "Active";
      else info.note = diff > 60 ? `In the future (${humanDuration(diff)})` : `${humanDuration(-diff)} ago`;
    }
    out.push(info);
  }
  return out;
}

export type TokenTimeStatus = "valid" | "expired" | "not-yet-valid" | "no-exp";

export function timeStatus(payload: unknown, nowSec = Date.now() / 1000): TokenTimeStatus {
  if (!payload || typeof payload !== "object") return "no-exp";
  const p = payload as Record<string, unknown>;
  if (typeof p.nbf === "number" && p.nbf > nowSec) return "not-yet-valid";
  if (typeof p.exp !== "number") return "no-exp";
  return p.exp <= nowSec ? "expired" : "valid";
}

export function humanDuration(sec: number): string {
  const s = Math.round(Math.abs(sec));
  if (s < 60) return `${s}s`;
  const units: [number, string][] = [
    [86400 * 365, "y"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  const parts: string[] = [];
  let rest = s;
  for (const [n, u] of units) {
    if (rest >= n) {
      parts.push(`${Math.floor(rest / n)}${u}`);
      rest %= n;
    }
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}

// ---------- keys ----------

const hashFor = (alg: JwtAlg) => `SHA-${alg.slice(2)}` as "SHA-256" | "SHA-384" | "SHA-512";
const curveFor: Record<string, string> = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };

function algParams(alg: JwtAlg): { importAlg: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams; signAlg: AlgorithmIdentifier | RsaPssParams | EcdsaParams } {
  const hash = hashFor(alg);
  switch (alg.slice(0, 2)) {
    case "HS":
      return { importAlg: { name: "HMAC", hash }, signAlg: { name: "HMAC" } };
    case "RS":
      return { importAlg: { name: "RSASSA-PKCS1-v1_5", hash }, signAlg: { name: "RSASSA-PKCS1-v1_5" } };
    case "PS":
      return { importAlg: { name: "RSA-PSS", hash }, signAlg: { name: "RSA-PSS", saltLength: Number(alg.slice(2)) / 8 } };
    default:
      return { importAlg: { name: "ECDSA", namedCurve: curveFor[alg] }, signAlg: { name: "ECDSA", hash } };
  }
}

export function isJwtAlg(a: unknown): a is JwtAlg {
  return typeof a === "string" && (JWT_ALGS as readonly string[]).includes(a);
}

function pemBody(pem: string, kind: "private" | "public"): Uint8Array {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!m) throw new JwtError(`Expected a PEM block (-----BEGIN ${kind === "private" ? "PRIVATE KEY" : "PUBLIC KEY"}-----) or a JWK JSON object.`);
  const label = m[1];
  if (kind === "private" && label !== "PRIVATE KEY") {
    if (label === "RSA PRIVATE KEY" || label === "EC PRIVATE KEY")
      throw new JwtError(`"${label}" (PKCS#1/SEC1) is not supported by Web Crypto. Convert it to PKCS#8: openssl pkcs8 -topk8 -nocrypt -in key.pem -out pkcs8.pem`);
    throw new JwtError(`Unsupported PEM type "${label}". Use an unencrypted PKCS#8 "PRIVATE KEY".`);
  }
  if (kind === "public" && label !== "PUBLIC KEY") {
    if (label === "CERTIFICATE") throw new JwtError("Certificates are not supported. Extract the public key: openssl x509 -pubkey -noout -in cert.pem");
    if (label === "RSA PUBLIC KEY") throw new JwtError('PKCS#1 "RSA PUBLIC KEY" is not supported. Convert it: openssl rsa -RSAPublicKey_in -in key.pem -pubout');
    throw new JwtError(`Unsupported PEM type "${label}". Use an SPKI "PUBLIC KEY".`);
  }
  return base64ToBytes(m[2]);
}

export type SecretEncoding = "utf8" | "base64" | "base64url";

async function importKey(alg: JwtAlg, keyText: string, usage: "sign" | "verify", secretEncoding: SecretEncoding = "utf8"): Promise<CryptoKey> {
  const { importAlg } = algParams(alg);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new JwtError("Web Crypto is unavailable (a secure HTTPS context is required).");
  try {
    if (alg.startsWith("HS")) {
      if (!keyText) throw new JwtError("Enter the shared secret.");
      const raw = secretEncoding === "utf8" ? new TextEncoder().encode(keyText) : base64ToBytes(keyText);
      return await subtle.importKey("raw", raw as BufferSource, importAlg, false, [usage]);
    }
    const trimmed = keyText.trim();
    if (!trimmed) throw new JwtError(usage === "sign" ? "Paste a PKCS#8 private key (PEM) or a private JWK." : "Paste an SPKI public key (PEM) or a public JWK.");
    if (trimmed.startsWith("{")) {
      let jwk: JsonWebKey;
      try {
        jwk = JSON.parse(trimmed);
      } catch {
        throw new JwtError("The JWK is not valid JSON.");
      }
      const clean: JsonWebKey = { ...jwk };
      delete clean.alg;
      delete clean.key_ops;
      delete clean.use;
      if (usage === "verify") delete clean.d;
      return await subtle.importKey("jwk", clean, importAlg, false, [usage]);
    }
    const der = pemBody(trimmed, usage === "sign" ? "private" : "public");
    return await subtle.importKey(usage === "sign" ? "pkcs8" : "spki", der as BufferSource, importAlg, false, [usage]);
  } catch (e) {
    if (e instanceof JwtError) throw e;
    throw new JwtError(`Could not import the key for ${alg}: ${(e as Error)?.message || "the key type does not match the algorithm"}.`);
  }
}

export interface SignOptions {
  alg: JwtAlg;
  header: Record<string, unknown>;
  payload: unknown;
  key: string;
  secretEncoding?: SecretEncoding;
}

/** Signs and returns the compact token. header.alg is forced to `alg`. */
export async function signJwt({ alg, header, payload, key, secretEncoding }: SignOptions): Promise<string> {
  const h = { ...header, alg };
  const signingInput = `${b64urlEncodeText(JSON.stringify(h))}.${b64urlEncodeText(typeof payload === "string" ? payload : JSON.stringify(payload))}`;
  const cryptoKey = await importKey(alg, key, "sign", secretEncoding);
  const sig = await globalThis.crypto.subtle.sign(algParams(alg).signAlg, cryptoKey, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlEncodeBytes(new Uint8Array(sig))}`;
}

export async function verifyJwt(token: string, key: string, secretEncoding?: SecretEncoding): Promise<boolean> {
  const d = decodeJwt(token);
  if (!isJwtAlg(d.alg)) throw new JwtError(d.alg === "none" ? 'alg "none" tokens are unsigned and cannot be verified.' : `Unsupported algorithm "${d.alg ?? "missing"}".`);
  const cryptoKey = await importKey(d.alg, key, "verify", secretEncoding);
  const sig = base64ToBytes(d.signature);
  return globalThis.crypto.subtle.verify(algParams(d.alg).signAlg, cryptoKey, sig as BufferSource, new TextEncoder().encode(d.signingInput));
}

/** Parses JSON and reports the line/column of syntax errors when the engine provides a position. */
export function parseJsonObject(text: string, what: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    const pos = /position (\d+)/.exec(msg);
    if (pos) {
      const idx = Number(pos[1]);
      const before = text.slice(0, idx);
      const line = before.split("\n").length;
      const col = idx - before.lastIndexOf("\n");
      throw new JwtError(`${what} is not valid JSON (line ${line}, column ${col}).`);
    }
    throw new JwtError(`${what} is not valid JSON: ${msg}`);
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new JwtError(`${what} must be a JSON object.`);
  return v as Record<string, unknown>;
}
