import { describe, expect, it } from "vitest";
import {
  buildOrientationApp1,
  jpegSegments,
  pngChunks,
  readJpegOrientation,
  readTiffOrientation,
  stripJpeg,
  stripLossless,
  stripPng,
  stripWebp,
  webpChunks,
  webpMetadataAsJpeg,
} from "@/lib/processors/image/metadata";

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: (number[] | Uint8Array)[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));
const seg = (marker: number, payload: Uint8Array | number[]) => {
  const len = payload.length + 2;
  return cat([0xff, marker, len >> 8, len & 0xff], payload);
};

/** Little-endian TIFF with Orientation=6 and a Make tag, wrapped as EXIF APP1. */
function exifApp1(): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x02, 0x00,
    0x0f, 0x01, 0x02, 0x00, 0x04, 0x00, 0x00, 0x00, 0x41, 0x43, 0x4d, 0x00, // Make "ACM"
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // Orientation 6
    0x00, 0x00, 0x00, 0x00,
  ];
  return seg(0xe1, cat(enc("Exif\0\0"), tiff));
}

function sampleJpeg(): Uint8Array {
  return cat(
    [0xff, 0xd8],
    seg(0xe0, cat(enc("JFIF\0"), [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    exifApp1(),
    seg(0xe1, cat(enc("http://ns.adobe.com/xap/1.0/\0"), enc("<x:xmpmeta/>"))),
    seg(0xe2, cat(enc("ICC_PROFILE\0"), [1, 1, 9, 9, 9, 9])),
    seg(0xed, cat(enc("Photoshop 3.0\0"), [1, 2, 3])),
    seg(0xfe, enc("secret comment")),
    seg(0xdb, new Array(65).fill(1)), // DQT
    seg(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]), // SOF0
    seg(0xda, [1, 1, 0, 0, 0x3f, 0]), // SOS header
    [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56], // entropy data with stuffing + RST0
    seg(0xc4, [0, 1, 2]), // DHT between scans (progressive style)
    seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
    [0x78, 0x9a],
    [0xff, 0xd9],
    enc("TRAILING-SECONDARY-IMAGE"),
  );
}

describe("JPEG metadata", () => {
  it("lists header segments up to SOS", () => {
    const { segments } = jpegSegments(sampleJpeg());
    expect(segments.map((s) => s.marker.toString(16))).toEqual(["e0", "e1", "e1", "e2", "ed", "fe", "db", "c0"]);
  });

  it("reads orientation from EXIF", () => {
    expect(readJpegOrientation(sampleJpeg())).toBe(6);
    expect(readTiffOrientation(Uint8Array.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 0]))).toBeNull();
  });

  it("strips EXIF/XMP/IPTC/COM and trailing data losslessly, keeping ICC and orientation", () => {
    const src = sampleJpeg();
    const r = stripJpeg(src, { keepIcc: true, keepOrientation: true });
    const out = r.bytes;
    const text = new TextDecoder("latin1").decode(out);
    expect(text).not.toContain("ACM");
    expect(text).not.toContain("xmpmeta");
    expect(text).not.toContain("secret comment");
    expect(text).not.toContain("Photoshop");
    expect(text).not.toContain("TRAILING");
    expect(text).toContain("ICC_PROFILE");
    expect(text).toContain("JFIF");
    expect(readJpegOrientation(out)).toBe(6);
    // Scan data copied byte-for-byte and the file ends with EOI.
    const scanStart = src.indexOf(0xda) - 1;
    const tail = src.subarray(scanStart, src.length - 24);
    expect(Array.from(out.subarray(out.length - tail.length))).toEqual(Array.from(tail));
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9);
    const labels = r.removed.map((x) => x.label).join(" | ");
    expect(labels).toMatch(/EXIF/);
    expect(labels).toMatch(/XMP/);
    expect(labels).toMatch(/IPTC/);
    expect(labels).toMatch(/Comment/);
    expect(labels).toMatch(/Trailing/);
    // The minimal orientation block sits right after JFIF.
    const segs = jpegSegments(out).segments.map((s) => s.marker);
    expect(segs.slice(0, 3)).toEqual([0xe0, 0xe1, 0xe2]);
  });

  it("can also drop ICC and orientation", () => {
    const r = stripJpeg(sampleJpeg(), { keepIcc: false, keepOrientation: false });
    const text = new TextDecoder("latin1").decode(r.bytes);
    expect(text).not.toContain("ICC_PROFILE");
    expect(readJpegOrientation(r.bytes)).toBeNull();
  });

  it("builds an orientation block that exifr can read", async () => {
    const exifr = (await import("exifr")).default;
    const jpeg = cat([0xff, 0xd8], buildOrientationApp1(8), [0xff, 0xd9]);
    const out = await exifr.parse(jpeg, { tiff: true, translateValues: false });
    expect(out?.Orientation).toBe(8);
  });

  it("rejects non-JPEG input", () => {
    expect(() => stripJpeg(enc("nope"), { keepIcc: true, keepOrientation: true })).toThrow(/Not a JPEG/);
  });
});

/* ---------------------------------------------------------------- */

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array | number[]): Uint8Array {
  const d = Uint8Array.from(data);
  const td = cat(enc(type), d);
  const crc = crc32(td);
  return cat([d.length >>> 24, (d.length >> 16) & 255, (d.length >> 8) & 255, d.length & 255], td, [crc >>> 24, (crc >> 16) & 255, (crc >> 8) & 255, crc & 255]);
}
function samplePng(): Uint8Array {
  return cat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    chunk("iCCP", cat(enc("sRGB\0\0"), [1, 2, 3])),
    chunk("tEXt", enc("Author\0Jane Doe")),
    chunk("iTXt", enc("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>")),
    chunk("eXIf", [0x4d, 0x4d, 0, 0x2a]),
    chunk("tIME", [7, 0xea, 1, 1, 0, 0, 0]),
    chunk("pHYs", [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]),
    chunk("IDAT", [0x78, 0x9c, 1, 2, 3]),
    chunk("IEND", []),
  );
}

describe("PNG metadata", () => {
  it("removes text, XMP, EXIF and time chunks and keeps image chunks", () => {
    const r = stripPng(samplePng(), { keepIcc: true, keepOrientation: true });
    expect(pngChunks(r.bytes).map((c) => c.type)).toEqual(["IHDR", "iCCP", "pHYs", "IDAT", "IEND"]);
    expect(new TextDecoder("latin1").decode(r.bytes)).not.toContain("Jane Doe");
    expect(r.removed).toHaveLength(4);
    const noIcc = stripPng(samplePng(), { keepIcc: false, keepOrientation: true });
    expect(pngChunks(noIcc.bytes).map((c) => c.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  });

  it("copies kept chunks byte-for-byte (CRCs stay valid)", () => {
    const r = stripPng(samplePng(), { keepIcc: true, keepOrientation: true });
    for (const c of pngChunks(r.bytes)) {
      const body = r.bytes.subarray(c.start + 4, c.end - 4);
      const crc = new DataView(r.bytes.buffer, r.bytes.byteOffset + c.end - 4, 4).getUint32(0);
      expect(crc32(body)).toBe(crc);
    }
  });
});

/* ---------------------------------------------------------------- */

function riffChunk(fourcc: string, data: number[] | Uint8Array): Uint8Array {
  const d = Uint8Array.from(data);
  const pad = d.length & 1 ? [0] : [];
  return cat(enc(fourcc), [d.length & 255, (d.length >> 8) & 255, (d.length >> 16) & 255, d.length >>> 24], d, pad);
}
function sampleWebp(): Uint8Array {
  const exifTiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const body = cat(
    enc("WEBP"),
    riffChunk("VP8X", [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // ICC|EXIF|XMP flags
    riffChunk("ICCP", [1, 2, 3]),
    riffChunk("VP8 ", [9, 9, 9, 9]),
    riffChunk("EXIF", exifTiff),
    riffChunk("XMP ", enc("<x:xmpmeta/>")),
  );
  const n = body.length;
  return cat(enc("RIFF"), [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24], body);
}

describe("WebP metadata", () => {
  it("removes EXIF/XMP chunks, clears VP8X flags and fixes the RIFF size", () => {
    const r = stripWebp(sampleWebp(), { keepIcc: true, keepOrientation: true });
    const chunks = webpChunks(r.bytes);
    expect(chunks.map((c) => c.fourcc)).toEqual(["VP8X", "ICCP", "VP8 "]);
    expect(r.bytes[20]).toBe(0x20); // only the ICC flag remains
    const riff = new DataView(r.bytes.buffer).getUint32(4, true);
    expect(riff).toBe(r.bytes.length - 8);
    const noIcc = stripWebp(sampleWebp(), { keepIcc: false, keepOrientation: true });
    expect(webpChunks(noIcc.bytes).map((c) => c.fourcc)).toEqual(["VP8X", "VP8 "]);
    expect(noIcc.bytes[20]).toBe(0);
  });

  it("wraps WebP EXIF so exifr can parse it", async () => {
    const jpeg = webpMetadataAsJpeg(sampleWebp());
    expect(jpeg).not.toBeNull();
    const exifr = (await import("exifr")).default;
    const out = await exifr.parse(jpeg!, { tiff: true, translateValues: false });
    expect(out?.Orientation).toBe(3);
  });
});

describe("dispatch", () => {
  it("picks the lossless method by signature", () => {
    expect(stripLossless(sampleJpeg(), { keepIcc: true, keepOrientation: false })?.kind).toBe("jpeg");
    expect(stripLossless(samplePng(), { keepIcc: true, keepOrientation: false })?.kind).toBe("png");
    expect(stripLossless(sampleWebp(), { keepIcc: true, keepOrientation: false })?.kind).toBe("webp");
    expect(stripLossless(enc("GIF89a...."), { keepIcc: true, keepOrientation: false })).toBeNull();
  });
});
