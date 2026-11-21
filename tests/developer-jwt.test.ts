import { describe, expect, it } from "vitest";
import { decodeJwt, describeClaims, signJwt, timeStatus, verifyJwt, JwtError, parseJsonObject, humanDuration, type JwtAlg } from "@/lib/processors/developer/jwt";
import { bytesToBase64 } from "@/lib/processors/developer/base64";

const JWT_IO =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function pem(der: ArrayBuffer, label: string) {
  const b64 = bytesToBase64(new Uint8Array(der), { lineLength: 64 }).replace(/\r\n/g, "\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`;
}

describe("jwt", () => {
  it("decodes the jwt.io example", () => {
    const d = decodeJwt(`Bearer ${JWT_IO}`);
    expect(d.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(d.payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(d.alg).toBe("HS256");
  });
  it("signs HS256 matching the jwt.io vector", async () => {
    const t = await signJwt({ alg: "HS256", header: { alg: "HS256", typ: "JWT" }, payload: { sub: "1234567890", name: "John Doe", iat: 1516239022 }, key: "your-256-bit-secret" });
    expect(t).toBe(JWT_IO);
    expect(await verifyJwt(JWT_IO, "your-256-bit-secret")).toBe(true);
    expect(await verifyJwt(JWT_IO, "wrong")).toBe(false);
  });
  it("signs and verifies HS384/HS512 and base64 secrets", async () => {
    for (const alg of ["HS384", "HS512"] as JwtAlg[]) {
      const t = await signJwt({ alg, header: { typ: "JWT" }, payload: { a: 1 }, key: "secret" });
      expect(decodeJwt(t).header.alg).toBe(alg);
      expect(await verifyJwt(t, "secret")).toBe(true);
    }
    const t = await signJwt({ alg: "HS256", header: {}, payload: { a: 1 }, key: "c2VjcmV0", secretEncoding: "base64" });
    expect(await verifyJwt(t, "secret")).toBe(true);
  });
  it("signs RS256, PS256 and ES256 with PEM keys and verifies with SPKI", async () => {
    const cases: [JwtAlg, RsaHashedKeyGenParams | EcKeyGenParams][] = [
      ["RS256", { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }],
      ["PS256", { name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }],
      ["ES256", { name: "ECDSA", namedCurve: "P-256" }],
    ];
    for (const [alg, params] of cases) {
      const kp = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
      const priv = pem(await crypto.subtle.exportKey("pkcs8", kp.privateKey), "PRIVATE KEY");
      const pub = pem(await crypto.subtle.exportKey("spki", kp.publicKey), "PUBLIC KEY");
      const t = await signJwt({ alg, header: { typ: "JWT" }, payload: { sub: "x" }, key: priv });
      expect(await verifyJwt(t, pub)).toBe(true);
      const tampered = t.replace(/\.[^.]+\./, "." + Buffer.from('{"sub":"y"}').toString("base64url") + ".");
      expect(await verifyJwt(tampered, pub)).toBe(false);
      if (alg === "ES256") expect(Buffer.from(t.split(".")[2], "base64url")).toHaveLength(64);
      const jwk = JSON.stringify(await crypto.subtle.exportKey("jwk", kp.publicKey));
      expect(await verifyJwt(t, jwk)).toBe(true);
    }
  });
  it("rejects malformed tokens and PKCS#1 keys with helpful errors", async () => {
    expect(() => decodeJwt("a.b")).toThrow(/3 dot-separated/);
    expect(() => decodeJwt("a.b.c.d.e")).toThrow(/JWE/);
    expect(() => decodeJwt("e30.e30.***")).toThrow(JwtError);
    await expect(signJwt({ alg: "RS256", header: {}, payload: {}, key: "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----" })).rejects.toThrow(/PKCS#8/);
    const none = "eyJhbGciOiJub25lIn0.e30.";
    await expect(verifyJwt(none, "x")).rejects.toThrow(/none/);
  });
  it("describes claims and time status", () => {
    const now = 1_700_000_000;
    const c = describeClaims({ exp: now - 3600, iat: now - 7200, sub: "u" }, now);
    expect(c.find((x) => x.claim === "exp")!.note).toBe("Expired 1h ago");
    expect(c.find((x) => x.claim === "exp")!.date).toBe(new Date((now - 3600) * 1000).toISOString());
    expect(timeStatus({ exp: now + 10 }, now)).toBe("valid");
    expect(timeStatus({ exp: now - 10 }, now)).toBe("expired");
    expect(timeStatus({ nbf: now + 10 }, now)).toBe("not-yet-valid");
    expect(timeStatus({}, now)).toBe("no-exp");
    expect(humanDuration(90061)).toBe("1d 1h");
  });
  it("reports JSON errors with line and column", () => {
    expect(() => parseJsonObject('{\n  "a": 1,\n  b: 2\n}', "Payload")).toThrow(/line 3, column 3/);
    expect(() => parseJsonObject("[1]", "Header")).toThrow(/object/);
  });
});
