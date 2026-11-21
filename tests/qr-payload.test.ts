import { describe, expect, it } from "vitest";
import {
  buildEmail,
  buildGeo,
  buildMecard,
  buildPhone,
  buildSms,
  buildText,
  buildUrl,
  buildVcard,
  buildWifi,
  escapeMecard,
  escapeVcard,
  escapeWifi,
  normalizePhone,
  normalizeUrl,
  parseLatLng,
} from "@/lib/processors/qr/payload";
import { contrastRatio, scanContrastWarning } from "@/lib/processors/qr/color";

const payload = (r: { ok: boolean; payload?: string; error?: string }) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.payload;
};

describe("Wi-Fi payload", () => {
  it("escapes \\ ; , : and \"", () => {
    expect(escapeWifi('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
    expect(escapeWifi("plain")).toBe("plain");
  });
  it("builds WPA networks", () => {
    expect(payload(buildWifi({ ssid: "Home", password: "secret123", encryption: "WPA" }))).toBe("WIFI:T:WPA;S:Home;P:secret123;;");
  });
  it("escapes special characters in SSID and password", () => {
    expect(payload(buildWifi({ ssid: 'My;Net,"5G"', password: "p:a\\ss;word", encryption: "WPA", hidden: true }))).toBe(
      'WIFI:T:WPA;S:My\\;Net\\,\\"5G\\";P:p\\:a\\\\ss\\;word;H:true;;',
    );
  });
  it("omits the password for open networks", () => {
    expect(payload(buildWifi({ ssid: "Cafe", password: "ignored", encryption: "nopass" }))).toBe("WIFI:T:nopass;S:Cafe;;");
  });
  it("builds WEP networks and validates", () => {
    expect(payload(buildWifi({ ssid: "Old", password: "abcde", encryption: "WEP" }))).toBe("WIFI:T:WEP;S:Old;P:abcde;;");
    expect(buildWifi({ ssid: "", encryption: "nopass" }).ok).toBe(false);
    expect(buildWifi({ ssid: "x", password: "short", encryption: "WPA" }).ok).toBe(false);
    expect(buildWifi({ ssid: "x", password: "", encryption: "WPA" }).ok).toBe(false);
  });
});

describe("contact payloads", () => {
  it("escapes vCard text values", () => {
    expect(escapeVcard("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
  it("builds vCard 3.0 with CRLF", () => {
    const v = payload(
      buildVcard({
        firstName: "Asha",
        lastName: "Rao",
        organization: "Acme, Inc.",
        phone: "+91 98765-43210",
        email: "asha@example.com",
        website: "example.com",
        city: "Pune",
        country: "India",
        note: "Line1\nLine2",
      }),
    )!;
    const lines = v.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCARD");
    expect(lines[1]).toBe("VERSION:3.0");
    expect(lines).toContain("N:Rao;Asha;;;");
    expect(lines).toContain("FN:Asha Rao");
    expect(lines).toContain("ORG:Acme\\, Inc.");
    expect(lines).toContain("TEL;TYPE=CELL:+919876543210");
    expect(lines).toContain("EMAIL;TYPE=INTERNET:asha@example.com");
    expect(lines).toContain("URL:https://example.com");
    expect(lines).toContain("ADR;TYPE=WORK:;;;Pune;;;India");
    expect(lines).toContain("NOTE:Line1\\nLine2");
    expect(lines[lines.length - 1]).toBe("END:VCARD");
  });
  it("rejects contacts without a name and bad emails", () => {
    expect(buildVcard({ phone: "123" }).ok).toBe(false);
    expect(buildVcard({ firstName: "A", email: "nope" }).ok).toBe(false);
    expect(buildMecard({}).ok).toBe(false);
  });
  it("builds MECARD with escaping", () => {
    expect(escapeMecard("a;b:c,d\\e")).toBe("a\\;b\\:c\\,d\\\\e");
    expect(payload(buildMecard({ firstName: "Asha", lastName: "Rao", phone: "0123 456", email: "a@b.co", note: "x;y" }))).toBe(
      "MECARD:N:Rao,Asha;TEL:0123456;EMAIL:a@b.co;NOTE:x\\;y;;",
    );
  });
});

describe("email, sms, phone, geo, url, text", () => {
  it("builds mailto with encoded subject/body", () => {
    expect(payload(buildEmail({ to: "a@b.com", subject: "Hello there", body: "Line 1\nLine 2 & more" }))).toBe(
      "mailto:a@b.com?subject=Hello%20there&body=Line%201%0D%0ALine%202%20%26%20more",
    );
    expect(payload(buildEmail({ to: "a@b.com, c@d.org" }))).toBe("mailto:a@b.com,c@d.org");
    expect(buildEmail({ to: "bad" }).ok).toBe(false);
    expect(buildEmail({ to: "" }).ok).toBe(false);
  });
  it("builds SMS in both formats", () => {
    expect(payload(buildSms({ number: "+1 (555) 010-9999", message: "Hi: there" }))).toBe("SMSTO:+15550109999:Hi: there");
    expect(payload(buildSms({ number: "5550109999", message: "Hi there?", format: "sms" }))).toBe("sms:5550109999?body=Hi%20there%3F");
    expect(payload(buildSms({ number: "5550109999", format: "sms" }))).toBe("sms:5550109999");
    expect(buildSms({ number: "12" }).ok).toBe(false);
  });
  it("builds tel: URIs", () => {
    expect(normalizePhone(" +44 20 7946 0958 ")).toBe("+442079460958");
    expect(payload(buildPhone("+44 20 7946 0958"))).toBe("tel:+442079460958");
    expect(buildPhone("abc").ok).toBe(false);
    expect(buildPhone("1234567890123456").ok).toBe(false);
  });
  it("builds geo: URIs and validates ranges", () => {
    expect(payload(buildGeo({ latitude: "28.6139", longitude: "77.2090" }))).toBe("geo:28.6139,77.209");
    expect(payload(buildGeo({ latitude: -33.8688, longitude: 151.2093, altitude: 58 }))).toBe("geo:-33.8688,151.2093,58");
    expect(buildGeo({ latitude: 91, longitude: 0 }).ok).toBe(false);
    expect(buildGeo({ latitude: 0, longitude: -181 }).ok).toBe(false);
    expect(buildGeo({ latitude: "abc", longitude: "1" }).ok).toBe(false);
    expect(parseLatLng("28.6139, 77.2090")).toEqual({ lat: 28.6139, lng: 77.209 });
    expect(parseLatLng("100, 1")).toBeNull();
  });
  it("normalises URLs", () => {
    expect(normalizeUrl("example.com/path?q=1")).toBe("https://example.com/path?q=1");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("foo")).toBeNull();
    expect(payload(buildUrl("utilityhub.app"))).toBe("https://utilityhub.app");
    expect(buildUrl("").ok).toBe(false);
    expect(payload(buildText("hello\nworld"))).toBe("hello\nworld");
    expect(buildText("").ok).toBe(false);
  });
});

describe("contrast", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
  });
  it("warns on low contrast and inverted colours", () => {
    expect(scanContrastWarning("#000000", "#ffffff")).toBeNull();
    expect(scanContrastWarning("#ffffff", "#000000")).toMatch(/lighter/);
    expect(scanContrastWarning("#999999", "#bbbbbb")).toMatch(/Contrast is low/);
    expect(scanContrastWarning("zzz", "#fff")).toMatch(/hex/);
  });
});
