/**
 * India GST math. Rates are percentages of the taxable value.
 *
 * GST 2.0 (effective 22 September 2025) consolidated most goods and services into two
 * main slabs, 5% (merit) and 18% (standard), plus a 40% special rate for sin/luxury
 * goods. 0%, 0.25% (rough diamonds/precious stones) and 3% (gold, silver, jewellery)
 * continue. 12% and 28% were the main pre-reform slabs and are kept for older invoices.
 */

export const GST_RATES_CURRENT = [0, 0.25, 3, 5, 18, 40] as const;
export const GST_RATES_LEGACY = [12, 28] as const;

export type GstMode = "add" | "remove";
export type SupplyType = "intra" | "inter";

export interface GstResult {
  /** Taxable value (excluding GST). */
  net: number;
  gst: number;
  /** Amount including GST. */
  gross: number;
  cgst: number;
  sgst: number;
  igst: number;
  rate: number;
}

/**
 * add: amount is the taxable value; GST is added on top.
 * remove: amount already includes GST; the taxable value is extracted (amount × 100 / (100 + rate)).
 * intra-state supplies split GST equally into CGST + SGST/UTGST; inter-state supplies attract IGST.
 */
export function calculateGst(amount: number, rate: number, mode: GstMode, supply: SupplyType = "intra"): GstResult | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount < 0 || rate < 0 || rate > 100) return null;
  let net: number, gst: number, gross: number;
  if (mode === "add") {
    net = amount;
    gst = (amount * rate) / 100;
    gross = net + gst;
  } else {
    gross = amount;
    net = (amount * 100) / (100 + rate);
    gst = gross - net;
  }
  const half = gst / 2;
  return {
    net,
    gst,
    gross,
    cgst: supply === "intra" ? half : 0,
    sgst: supply === "intra" ? half : 0,
    igst: supply === "inter" ? gst : 0,
    rate,
  };
}

/** Round to paise (2 decimals) using half-up on the absolute value. */
export function roundPaise(n: number): number {
  if (!Number.isFinite(n)) return n;
  const r = Number(`${Math.round(Number(`${Math.abs(n)}e2`))}e-2`);
  return n < 0 ? -r : r;
}
