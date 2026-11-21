import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { formatDigest, hashAll, hashText } from "@/lib/processors/developer/hash";

describe("hash generator", () => {
  it("computes known vectors for 'abc'", async () => {
    const rows = Object.fromEntries((await hashAll("abc")).map((r) => [r.id, r.hex]));
    expect(rows.md5).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(rows.sha1).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(rows.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(rows["sha3-256"]).toBe("3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532");
    expect(rows.keccak256).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    expect(rows.crc32).toBe("352441c2");
    expect(rows.ripemd160).toBe("8eb208f7e05d987a9b044a8e98c6b087f15a0bfc");
    expect(rows.blake3).toBe("6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85");
    for (const id of ["sha224", "sha384", "sha512"]) expect(rows[id]).toBe(createHash(id).update("abc").digest("hex"));
    expect(rows.blake2b).toBe(createHash("blake2b512").update("abc").digest("hex"));
    expect(rows["sha3-512"]).toBe(createHash("sha3-512").update("abc").digest("hex"));
    expect(rows.xxhash64).toMatch(/^[0-9a-f]{16}$/);
  });
  it("hashes UTF-8 text", async () => {
    expect(await hashText("sha256", new TextEncoder().encode("héllo 😀"))).toBe(createHash("sha256").update("héllo 😀", "utf8").digest("hex"));
  });
  it("computes HMAC and keyed modes", async () => {
    const rows = await hashAll("The quick brown fox jumps over the lazy dog", "key");
    const get = (id: string) => rows.find((r) => r.id === id)!;
    expect(get("sha256").hex).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
    expect(get("sha256").label).toBe("HMAC-SHA-256");
    expect(get("md5").hex).toBe("80070713463e7749b90c2dc24911e275");
    expect(get("sha512").hex).toBe(createHmac("sha512", "key").update("The quick brown fox jumps over the lazy dog").digest("hex"));
    expect(get("crc32").note).toMatch(/Not keyed/);
    expect(get("blake3").hex).toBeNull();
  });
  it("formats digests", () => {
    expect(formatDigest("00ff", "HEX")).toBe("00FF");
    expect(formatDigest("900150983cd24fb0d6963f7d28e17f72", "base64")).toBe("kAFQmDzST7DWlj99KOF/cg==");
  });
});
