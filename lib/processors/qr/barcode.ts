/**
 * Barcode format rules and GS1 check digits, mirroring what JsBarcode accepts so
 * the UI can explain problems (and auto-complete check digits) before rendering.
 */

export type BarcodeFormat = "CODE128" | "EAN13" | "EAN8" | "UPC" | "CODE39" | "ITF14" | "MSI" | "pharmacode" | "codabar";

export const barcodeFormats: { value: BarcodeFormat; label: string; hint: string; example: string }[] = [
  { value: "CODE128", label: "Code 128", hint: "Any ASCII text: letters, digits, symbols.", example: "UtilityHub-2026" },
  { value: "EAN13", label: "EAN-13", hint: "12 digits (check digit added) or 13 digits.", example: "590123412345" },
  { value: "EAN8", label: "EAN-8", hint: "7 digits (check digit added) or 8 digits.", example: "9638507" },
  { value: "UPC", label: "UPC-A", hint: "11 digits (check digit added) or 12 digits.", example: "03600029145" },
  { value: "CODE39", label: "Code 39", hint: "A–Z, 0–9, space and - . $ / + %.", example: "CODE 39" },
  { value: "ITF14", label: "ITF-14", hint: "13 digits (check digit added) or 14 digits.", example: "1540014128876" },
  { value: "MSI", label: "MSI Plessey", hint: "Digits only.", example: "1234567" },
  { value: "pharmacode", label: "Pharmacode", hint: "Whole number from 3 to 131070.", example: "1234" },
  { value: "codabar", label: "Codabar", hint: "0–9 and - $ : / . +, optional A–D start/stop.", example: "A40156B" },
];

/** GS1 mod-10 check digit for the data digits (without check digit). */
export function gs1CheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new Error("GS1 check digits need numeric input");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGs1(code: string): boolean {
  if (!/^\d{2,}$/.test(code)) return false;
  return gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

export type BarcodeValidation = { ok: true; value: string; note?: string } | { ok: false; error: string };

const GS1_LENGTHS: Partial<Record<BarcodeFormat, [number, string]>> = {
  EAN13: [13, "EAN-13"],
  EAN8: [8, "EAN-8"],
  UPC: [12, "UPC-A"],
  ITF14: [14, "ITF-14"],
};

export function validateBarcode(format: BarcodeFormat, raw: string): BarcodeValidation {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter a value to encode." };
  const gs1 = GS1_LENGTHS[format];
  if (gs1) {
    const [len, name] = gs1;
    const v = input.replace(/[\s-]/g, "");
    if (!/^\d+$/.test(v)) return { ok: false, error: `${name} accepts digits only.` };
    if (v.length === len - 1) {
      const full = v + gs1CheckDigit(v);
      return { ok: true, value: full, note: `Check digit ${full[len - 1]} added automatically.` };
    }
    if (v.length !== len) return { ok: false, error: `${name} needs ${len - 1} digits (check digit computed) or ${len} digits.` };
    if (!isValidGs1(v)) {
      const expected = gs1CheckDigit(v.slice(0, -1));
      return { ok: false, error: `Invalid check digit: the last digit should be ${expected}, not ${v[len - 1]}.` };
    }
    return { ok: true, value: v };
  }
  switch (format) {
    case "CODE128":
      if (!/^[\x00-\x7F]+$/.test(input)) return { ok: false, error: "Code 128 supports ASCII characters only (no accents or emoji)." };
      if (input.length > 80) return { ok: false, error: "Keep Code 128 values under 80 characters so the barcode stays scannable." };
      return { ok: true, value: input };
    case "CODE39": {
      const v = input.toUpperCase();
      if (!/^[0-9A-Z\-. $/+%]+$/.test(v)) return { ok: false, error: "Code 39 supports A–Z, 0–9, space and - . $ / + % only." };
      return { ok: true, value: v, note: v !== input ? "Converted to upper case (Code 39 has no lower case)." : undefined };
    }
    case "MSI":
      if (!/^\d+$/.test(input)) return { ok: false, error: "MSI accepts digits only." };
      return { ok: true, value: input };
    case "pharmacode": {
      if (!/^\d+$/.test(input)) return { ok: false, error: "Pharmacode accepts a whole number only." };
      const n = Number(input);
      if (n < 3 || n > 131070) return { ok: false, error: "Pharmacode values range from 3 to 131070." };
      return { ok: true, value: String(n) };
    }
    case "codabar": {
      const v = input.toUpperCase();
      if (/^[0-9\-$:./+]+$/.test(v)) return { ok: true, value: v, note: "Start/stop character A added on both ends." };
      if (!/^[A-D][0-9\-$:./+]+[A-D]$/.test(v))
        return { ok: false, error: "Codabar uses 0–9 and - $ : / . +, optionally wrapped in start/stop letters A–D." };
      return { ok: true, value: v };
    }
    default:
      return { ok: false, error: "Unsupported format." };
  }
}
