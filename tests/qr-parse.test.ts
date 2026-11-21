import { describe, expect, it } from "vitest";
import { parseQrPayload, splitEscaped } from "@/lib/processors/qr/parse";
import { buildMecard, buildVcard, buildWifi } from "@/lib/processors/qr/payload";

describe("parseQrPayload", () => {
  it("splits on unescaped separators", () => {
    expect(splitEscaped("a\\;b;c", ";")).toEqual(["a\\;b", "c"]);
  });
  it("detects http(s) URLs and www.", () => {
    expect(parseQrPayload("https://example.com/a?b=1")).toEqual({ kind: "url", url: "https://example.com/a?b=1", safe: true });
    expect(parseQrPayload("www.example.com")).toMatchObject({ kind: "url", url: "https://www.example.com" });
  });
  it("never treats javascript: as a link", () => {
    expect(parseQrPayload("javascript:alert(1)").kind).toBe("text");
  });
  it("parses Wi-Fi with escapes, any field order, round-trip", () => {
    expect(parseQrPayload("WIFI:S:My\\;Net;T:WPA;P:pa\\:ss\\\\;H:true;;")).toEqual({
      kind: "wifi",
      ssid: "My;Net",
      password: "pa:ss\\",
      encryption: "WPA",
      hidden: true,
    });
    const built = buildWifi({ ssid: 'a,b;"c"', password: "x:y;z\\12345", encryption: "WPA" });
    if (!built.ok) throw new Error(built.error);
    expect(parseQrPayload(built.payload)).toMatchObject({ ssid: 'a,b;"c"', password: "x:y;z\\12345" });
    expect(parseQrPayload("WIFI:T:nopass;S:Open;;")).toMatchObject({ encryption: "nopass", password: "", hidden: false });
  });
  it("parses vCard round-trip", () => {
    const b = buildVcard({ firstName: "Asha", lastName: "Rao", organization: "Acme, Inc.", phone: "123456", note: "a\nb" });
    if (!b.ok) throw new Error(b.error);
    const p = parseQrPayload(b.payload);
    expect(p.kind).toBe("vcard");
    if (p.kind !== "vcard") return;
    expect(p.fields).toContainEqual(["Name", "Asha Rao"]);
    expect(p.fields).toContainEqual(["Organisation", "Acme, Inc."]);
    expect(p.fields).toContainEqual(["Phone", "123456"]);
    expect(p.fields).toContainEqual(["Note", "a\nb"]);
  });
  it("parses MECARD round-trip", () => {
    const b = buildMecard({ firstName: "Asha", lastName: "Rao", phone: "123456", note: "x;y" });
    if (!b.ok) throw new Error(b.error);
    const p = parseQrPayload(b.payload);
    expect(p).toEqual({ kind: "mecard", fields: [["Name", "Asha Rao"], ["Phone", "123456"], ["Note", "x;y"]] });
  });
  it("parses mailto and MATMSG", () => {
    expect(parseQrPayload("mailto:a@b.com?subject=Hi%20there&body=Line%0D%0A2")).toEqual({
      kind: "email",
      to: "a@b.com",
      subject: "Hi there",
      body: "Line\r\n2",
    });
    expect(parseQrPayload("MATMSG:TO:a@b.com;SUB:Hi;BODY:Yo;;")).toEqual({ kind: "email", to: "a@b.com", subject: "Hi", body: "Yo" });
  });
  it("parses SMS, tel and geo", () => {
    expect(parseQrPayload("SMSTO:+15550109999:Hi: there")).toEqual({ kind: "sms", number: "+15550109999", body: "Hi: there" });
    expect(parseQrPayload("sms:123456?body=Hello%20you")).toEqual({ kind: "sms", number: "123456", body: "Hello you" });
    expect(parseQrPayload("tel:+442079460958")).toEqual({ kind: "phone", number: "+442079460958" });
    expect(parseQrPayload("geo:28.6139,77.209")).toEqual({ kind: "geo", latitude: 28.6139, longitude: 77.209, altitude: undefined, query: undefined });
    expect(parseQrPayload("geo:1,2,30?q=Cafe")).toMatchObject({ altitude: 30, query: "Cafe" });
    expect(parseQrPayload("geo:95,2").kind).toBe("text");
  });
  it("falls back to text", () => {
    expect(parseQrPayload("hello world")).toEqual({ kind: "text", text: "hello world" });
  });
});
