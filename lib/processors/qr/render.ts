/**
 * Browser-side QR rendering and decoding helpers. Libraries are imported lazily
 * so category bundles stay light.
 */

export type EccLevel = "L" | "M" | "Q" | "H";

export interface QrRenderOptions {
  size: number;
  margin: number;
  ecc: EccLevel;
  foreground: string;
  background: string;
  /** Force at least this QR version (1–40). Used by the logo tool so small payloads get enough modules. */
  minVersion?: number;
}

/** Resolves the version to render: the smallest that fits, raised to minVersion. */
async function resolveVersion(text: string, o: QrRenderOptions): Promise<number | undefined> {
  if (!o.minVersion) return undefined;
  const QRCode = await import("qrcode");
  const fit = QRCode.create(text, { errorCorrectionLevel: o.ecc }).version;
  return Math.min(40, Math.max(fit, o.minVersion));
}

function friendlyQrError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/too big|amount of data/i.test(msg))
    return new Error("Too much data for a QR code at this error-correction level. Shorten the content or choose a lower level (L holds the most).");
  return e instanceof Error ? e : new Error(msg);
}

/** Renders a QR code onto the given canvas and returns its module count. */
export async function renderQrToCanvas(canvas: HTMLCanvasElement, text: string, o: QrRenderOptions): Promise<number> {
  const QRCode = await import("qrcode");
  try {
    const version = await resolveVersion(text, o);
    const qr = QRCode.create(text, { errorCorrectionLevel: o.ecc, version });
    await QRCode.toCanvas(canvas, text, {
      errorCorrectionLevel: o.ecc,
      version,
      margin: o.margin,
      width: o.size,
      color: { dark: o.foreground, light: o.background },
    });
    return qr.modules.size;
  } catch (e) {
    throw friendlyQrError(e);
  }
}

export async function renderQrSvg(text: string, o: QrRenderOptions): Promise<string> {
  const QRCode = await import("qrcode");
  try {
    const version = await resolveVersion(text, o);
    return await QRCode.toString(text, {
      type: "svg",
      errorCorrectionLevel: o.ecc,
      version,
      margin: o.margin,
      width: o.size,
      color: { dark: o.foreground, light: o.background },
    });
  } catch (e) {
    throw friendlyQrError(e);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), type, quality),
  );
}

/** Decodes a QR code from pixels with jsQR. */
export async function decodeQrImageData(data: ImageData, invert: boolean = true): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const r = jsQR(data.data, data.width, data.height, { inversionAttempts: invert ? "attemptBoth" : "dontInvert" });
  return r ? r.data : null;
}

/** Loads an image file into an ImageBitmap-like drawable. */
export async function loadImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall back to <img> (e.g. SVG in some browsers) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth || 512, height: img.naturalHeight || 512, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This image could not be read. Try a PNG or JPG.");
  }
}

/** Draws an image scaled so its longest side is at most `maxSide`, on a white backdrop. */
export function drawScaled(source: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c;
}

/** Tries several scales: QR detection in jsQR works best at moderate resolutions. */
export async function decodeQrFromFile(file: Blob): Promise<string | null> {
  const img = await loadImage(file);
  try {
    for (const side of [1200, 800, 2000, 400]) {
      if (side > Math.max(img.width, img.height) * 1.5 && side !== 1200) continue;
      const c = drawScaled(img.source, img.width, img.height, side);
      const ctx = c.getContext("2d")!;
      const found = await decodeQrImageData(ctx.getImageData(0, 0, c.width, c.height));
      if (found != null) return found;
    }
    return null;
  } finally {
    img.close();
  }
}
