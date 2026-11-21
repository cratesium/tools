import { describe, expect, it } from "vitest";
import { formatUuid, generateUuids, inspectUuid, uuidV4, uuidV7, NIL_UUID, MAX_UUID } from "@/lib/processors/developer/uuid";

const v4re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const v7re = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid", () => {
  it("generates valid v4", () => {
    const ids = generateUuids("v4", 500);
    expect(ids.every((u) => v4re.test(u))).toBe(true);
    expect(new Set(ids).size).toBe(500);
    expect(uuidV4(new Uint8Array(16).fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
  it("generates v7 with the embedded timestamp (RFC 9562 example layout)", () => {
    // RFC 9562 Appendix A.6: 2022-02-22 19:22:22 UTC = 0x017F22E279B0
    const u = uuidV7(0x017f22e279b0, new Uint8Array(16));
    expect(u.startsWith("017f22e2-79b0-7")).toBe(true);
    expect(v7re.test(u)).toBe(true);
    expect(inspectUuid(u).timestamp!.toISOString()).toBe("2022-02-22T19:22:22.000Z");
  });
  it("keeps v7 batches sorted within the same millisecond", () => {
    const ids = generateUuids("v7", 2000, () => 1_700_000_000_000);
    expect(ids.every((u) => v7re.test(u))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(2000);
  });
  it("formats", () => {
    const u = "123e4567-e89b-42d3-a456-426614174000";
    expect(formatUuid(u, { uppercase: true, hyphens: false })).toBe("123E4567E89B42D3A456426614174000");
    expect(formatUuid(u, { braces: true })).toBe("{123e4567-e89b-42d3-a456-426614174000}");
    expect(formatUuid(u, { urn: true })).toBe("urn:uuid:123e4567-e89b-42d3-a456-426614174000");
    expect(generateUuids("nil", 2)).toEqual([NIL_UUID, NIL_UUID]);
    expect(generateUuids("max", 1)).toEqual([MAX_UUID]);
  });
  it("inspects versions, variants and v1 timestamps", () => {
    expect(inspectUuid("{123E4567-E89B-42D3-A456-426614174000}")).toMatchObject({ valid: true, version: 4, variant: "RFC 9562 / RFC 4122" });
    // v1 example from RFC 9562 Appendix A.1: C232AB00-9414-11EC-B3C8-9F6BDECED846 → 2022-02-22T19:22:22Z
    expect(inspectUuid("C232AB00-9414-11EC-B3C8-9F6BDECED846").timestamp!.toISOString()).toBe("2022-02-22T19:22:22.000Z");
    expect(inspectUuid("nope").valid).toBe(false);
    expect(inspectUuid(NIL_UUID).note).toMatch(/Nil/);
  });
});
