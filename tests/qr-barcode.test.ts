import { describe, expect, it } from "vitest";
import { gs1CheckDigit, isValidGs1, validateBarcode } from "@/lib/processors/qr/barcode";

describe("GS1 check digits", () => {
  it("computes known check digits", () => {
    expect(gs1CheckDigit("590123412345")).toBe(7); // EAN-13 5901234123457
    expect(gs1CheckDigit("400638133393")).toBe(1); // 4006381333931
    expect(gs1CheckDigit("9638507")).toBe(4); // EAN-8 96385074
    expect(gs1CheckDigit("03600029145")).toBe(2); // UPC-A 036000291452
    expect(gs1CheckDigit("1540014128876")).toBe(3); // ITF-14 15400141288763
    expect(gs1CheckDigit("000000000000")).toBe(0);
  });
  it("validates full codes", () => {
    expect(isValidGs1("5901234123457")).toBe(true);
    expect(isValidGs1("5901234123458")).toBe(false);
    expect(isValidGs1("96385074")).toBe(true);
    expect(isValidGs1("036000291452")).toBe(true);
    expect(isValidGs1("abc")).toBe(false);
  });
});

describe("validateBarcode", () => {
  it("adds missing check digits", () => {
    expect(validateBarcode("EAN13", "590123412345")).toEqual({ ok: true, value: "5901234123457", note: "Check digit 7 added automatically." });
    expect(validateBarcode("EAN8", "9638507")).toMatchObject({ ok: true, value: "96385074" });
    expect(validateBarcode("UPC", "03600029145")).toMatchObject({ ok: true, value: "036000291452" });
    expect(validateBarcode("ITF14", "1540014128876")).toMatchObject({ ok: true, value: "15400141288763" });
  });
  it("rejects wrong check digits with the expected digit", () => {
    const r = validateBarcode("EAN13", "5901234123458");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("should be 7");
  });
  it("rejects wrong lengths and non-digits", () => {
    expect(validateBarcode("EAN13", "12345").ok).toBe(false);
    expect(validateBarcode("EAN8", "12a4567").ok).toBe(false);
    expect(validateBarcode("UPC", "").ok).toBe(false);
    expect(validateBarcode("EAN13", "590-1234-12345")).toMatchObject({ ok: true, value: "5901234123457" });
  });
  it("validates other formats", () => {
    expect(validateBarcode("CODE128", "Hello-123")).toEqual({ ok: true, value: "Hello-123" });
    expect(validateBarcode("CODE128", "héllo").ok).toBe(false);
    expect(validateBarcode("CODE39", "abc-1")).toMatchObject({ ok: true, value: "ABC-1" });
    expect(validateBarcode("CODE39", "a@b").ok).toBe(false);
    expect(validateBarcode("MSI", "1234").ok).toBe(true);
    expect(validateBarcode("MSI", "12a").ok).toBe(false);
    expect(validateBarcode("pharmacode", "2").ok).toBe(false);
    expect(validateBarcode("pharmacode", "131070").ok).toBe(true);
    expect(validateBarcode("pharmacode", "131071").ok).toBe(false);
    expect(validateBarcode("codabar", "40156")).toMatchObject({ ok: true, value: "40156" });
    expect(validateBarcode("codabar", "a40156b")).toMatchObject({ ok: true, value: "A40156B" });
    expect(validateBarcode("codabar", "A40X56B").ok).toBe(false);
  });
});
