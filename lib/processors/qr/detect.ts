/**
 * Barcode detection engines for the Barcode Scanner: the native BarcodeDetector API
 * (Chrome/Edge on Android, macOS, ChromeOS) when present, otherwise @zxing/library.
 * Browser-only; libraries are loaded lazily.
 */

export interface DetectedCode {
  text: string;
  /** Human-readable format name, e.g. "EAN-13". */
  format: string;
}

interface NativeDetected {
  rawValue: string;
  format: string;
}
interface NativeDetector {
  detect(source: CanvasImageSource | ImageBitmap | ImageData): Promise<NativeDetected[]>;
}
interface NativeDetectorCtor {
  new (opts?: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const NATIVE_NAMES: Record<string, string> = {
  aztec: "Aztec",
  code_128: "Code 128",
  code_39: "Code 39",
  code_93: "Code 93",
  codabar: "Codabar",
  data_matrix: "Data Matrix",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  itf: "ITF",
  pdf417: "PDF417",
  qr_code: "QR Code",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
};

const ZXING_NAMES: Record<string, string> = {
  AZTEC: "Aztec",
  CODABAR: "Codabar",
  CODE_39: "Code 39",
  CODE_93: "Code 93",
  CODE_128: "Code 128",
  DATA_MATRIX: "Data Matrix",
  EAN_8: "EAN-8",
  EAN_13: "EAN-13",
  ITF: "ITF",
  PDF_417: "PDF417",
  QR_CODE: "QR Code",
  RSS_14: "GS1 DataBar",
  RSS_EXPANDED: "GS1 DataBar Expanded",
  UPC_A: "UPC-A",
  UPC_E: "UPC-E",
};

export type Engine = { name: "native" | "zxing"; detect: (canvas: HTMLCanvasElement) => Promise<DetectedCode | null> };

function nativeCtor(): NativeDetectorCtor | null {
  const w = globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

async function createNative(): Promise<Engine | null> {
  const Ctor = nativeCtor();
  if (!Ctor) return null;
  try {
    const formats = await Ctor.getSupportedFormats();
    if (!formats.length) return null;
    const detector = new Ctor({ formats });
    return {
      name: "native",
      detect: async (canvas) => {
        const found = await detector.detect(canvas);
        if (!found.length) return null;
        return { text: found[0].rawValue, format: NATIVE_NAMES[found[0].format] ?? found[0].format };
      },
    };
  } catch {
    return null;
  }
}

export async function createZxing(): Promise<Engine> {
  const Z = await import("@zxing/library");
  const hints = new Map<number, unknown>();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
    Z.BarcodeFormat.EAN_13,
    Z.BarcodeFormat.EAN_8,
    Z.BarcodeFormat.UPC_A,
    Z.BarcodeFormat.UPC_E,
    Z.BarcodeFormat.CODE_128,
    Z.BarcodeFormat.CODE_39,
    Z.BarcodeFormat.CODE_93,
    Z.BarcodeFormat.CODABAR,
    Z.BarcodeFormat.ITF,
    Z.BarcodeFormat.RSS_14,
    Z.BarcodeFormat.RSS_EXPANDED,
    Z.BarcodeFormat.QR_CODE,
    Z.BarcodeFormat.DATA_MATRIX,
    Z.BarcodeFormat.AZTEC,
    Z.BarcodeFormat.PDF_417,
  ]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints as Map<never, unknown>);
  return {
    name: "zxing",
    detect: async (canvas) => {
      try {
        const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
        const result = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(source)));
        const key = Z.BarcodeFormat[result.getBarcodeFormat()];
        return { text: result.getText(), format: ZXING_NAMES[key] ?? key };
      } catch (e) {
        if (e instanceof Z.NotFoundException || e instanceof Z.ChecksumException || e instanceof Z.FormatException) return null;
        throw e;
      }
    },
  };
}

/** Prefers the native detector; falls back to ZXing. */
export async function createEngine(): Promise<Engine> {
  return (await createNative()) ?? (await createZxing());
}
