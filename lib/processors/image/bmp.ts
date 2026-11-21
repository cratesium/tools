/**
 * Minimal BMP encoder (canvas can't export BMP). Writes 24-bit BI_RGB for opaque images and
 * 32-bit BI_BITFIELDS with a BITMAPV4HEADER (alpha mask) when any pixel is transparent.
 */

import type { Pixels } from "./pixels";

export function encodeBmp(px: Pixels): Uint8Array {
  const { width: w, height: h, data } = px;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] !== 255) {
      hasAlpha = true;
      break;
    }
  const bpp = hasAlpha ? 32 : 24;
  const rowSize = Math.ceil((w * bpp) / 32) * 4;
  const dibSize = hasAlpha ? 108 : 40;
  const offset = 14 + dibSize;
  const size = offset + rowSize * h;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42;
  buf[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, offset, true);
  dv.setUint32(14, dibSize, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true); // positive = bottom-up
  dv.setUint16(26, 1, true);
  dv.setUint16(28, bpp, true);
  dv.setUint32(30, hasAlpha ? 3 : 0, true); // BI_BITFIELDS : BI_RGB
  dv.setUint32(34, rowSize * h, true);
  dv.setInt32(38, 2835, true); // 72 DPI
  dv.setInt32(42, 2835, true);
  if (hasAlpha) {
    dv.setUint32(54, 0x00ff0000, true); // R mask
    dv.setUint32(58, 0x0000ff00, true); // G
    dv.setUint32(62, 0x000000ff, true); // B
    dv.setUint32(66, 0xff000000, true); // A
    dv.setUint32(70, 0x73524742, true); // 'sRGB'
  }
  for (let y = 0; y < h; y++) {
    const row = offset + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = row + x * (bpp / 8);
      buf[o] = data[i + 2];
      buf[o + 1] = data[i + 1];
      buf[o + 2] = data[i];
      if (hasAlpha) buf[o + 3] = data[i + 3];
    }
  }
  return buf;
}
