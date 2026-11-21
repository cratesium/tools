import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { buildVcard, buildWifi } from "@/lib/processors/qr/payload";
import { computeLogoBox, MAX_LOGO_AREA } from "@/lib/processors/qr/logo";

/** Rasterises a QR matrix to RGBA pixels (black on white) without a canvas. */
function rasterise(text: string, ecc: "L" | "M" | "Q" | "H", minVersion = 1, scale = 8, margin = 4) {
  const fit = QRCode.create(text, { errorCorrectionLevel: ecc }).version;
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc, version: Math.max(fit, minVersion) });
  const n = qr.modules.size;
  const size = (n + 2 * margin) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + margin) * scale + y) * size + (c + margin) * scale + x) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }
  return { px, size, n, margin };
}

describe("QR round trip (qrcode → jsQR)", () => {
  it("decodes generated Wi-Fi and vCard payloads exactly", () => {
    for (const r of [
      buildWifi({ ssid: 'Net;"5G"', password: "p:ss,word\\1", encryption: "WPA" }),
      buildVcard({ firstName: "Zoë", lastName: "Ng", organization: "A, B; C", phone: "+1 555 0100" }),
    ]) {
      if (!r.ok) throw new Error(r.error);
      const { px, size } = rasterise(r.payload, "M");
      expect(jsQR(px, size, size)?.data).toBe(r.payload);
    }
  });

  it("caps the logo area at 22% of the symbol", () => {
    const b = computeLogoBox(400, 37, 4, 0.5, 100, 100);
    const symbolSide = (400 / 45) * 37;
    expect((b.pad.size * b.pad.size) / (symbolSide * symbolSide)).toBeCloseTo(MAX_LOGO_AREA, 5);
  });

  it.each(["hi", "https://example.com", "https://utilityhub.app/tools/qr-code-with-logo", "WIFI:T:WPA;S:Home;P:secret123;;"])(
    "decodes %s with ECC H, min version 5 and an opaque 18%% logo",
    (text) => {
      const { px, size, n, margin } = rasterise(text, "H", 5);
      const box = computeLogoBox(size, n, margin, 0.18, 100, 100);
      const x0 = Math.round(box.pad.x);
      const s = Math.round(box.pad.size);
      for (let y = x0; y < x0 + s; y++)
        for (let x = x0; x < x0 + s; x++) {
          const i = (y * size + x) * 4;
          px[i] = px[i + 1] = px[i + 2] = 255;
        }
      expect(jsQR(px, size, size)?.data).toBe(text);
    },
  );

  it("keeps the logo aspect ratio inside the pad", () => {
    const b = computeLogoBox(400, 25, 4, 0.1, 200, 100);
    expect(b.image.w / b.image.h).toBeCloseTo(2, 5);
    expect(b.image.w).toBeLessThanOrEqual(b.pad.size);
  });
});
