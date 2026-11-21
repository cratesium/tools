/**
 * Percentage, percentage-change and discount math. Pure functions; NaN signals invalid input.
 */

const ok = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

/** X% of Y. */
export function percentOf(x: number, y: number): number {
  return ok(x, y) ? (x / 100) * y : NaN;
}

/** X is what percent of Y. */
export function whatPercent(x: number, y: number): number {
  if (!ok(x, y) || y === 0) return NaN;
  return (x / y) * 100;
}

/** Percentage change from A to B, relative to |A|. */
export function percentChange(from: number, to: number): number {
  if (!ok(from, to) || from === 0) return NaN;
  return ((to - from) / Math.abs(from)) * 100;
}

/** Y increased (positive pct) or decreased (negative pct) by pct%. */
export function applyPercent(value: number, pct: number): number {
  return ok(value, pct) ? value * (1 + pct / 100) : NaN;
}

/** X is pct% of what number. */
export function wholeFromPart(part: number, pct: number): number {
  if (!ok(part, pct) || pct === 0) return NaN;
  return (part * 100) / pct;
}

/** Percentage-point difference vs. symmetric percent difference (relative to the mean). */
export function percentDifference(a: number, b: number): number {
  const mean = (Math.abs(a) + Math.abs(b)) / 2;
  if (!ok(a, b) || mean === 0) return NaN;
  return (Math.abs(a - b) / mean) * 100;
}

export interface ChangeResult {
  change: number;
  absolute: number;
  direction: "increase" | "decrease" | "none";
  multiplier: number;
  /** Change needed from B to get back to A. */
  reverse: number;
}

export function changeDetails(from: number, to: number): ChangeResult {
  const change = percentChange(from, to);
  return {
    change,
    absolute: to - from,
    direction: !Number.isFinite(change) || to === from ? "none" : to > from ? "increase" : "decrease",
    multiplier: from === 0 ? NaN : to / from,
    reverse: percentChange(to, from),
  };
}

export type DiscountMode = "stacked" | "combined";

export interface DiscountInput {
  price: number;
  /** Discounts in percent, applied in order. */
  discounts: number[];
  mode: DiscountMode;
  /** Flat amount off, applied after percentage discounts. */
  flatOff?: number;
  /** Sales tax / VAT / GST percent applied to the discounted price. */
  taxPercent?: number;
  quantity?: number;
}

export interface DiscountResult {
  unitPrice: number;
  steps: { label: string; amount: number; priceAfter: number }[];
  discountedUnit: number;
  savingsUnit: number;
  effectiveDiscount: number;
  taxUnit: number;
  finalUnit: number;
  quantity: number;
  subtotal: number;
  tax: number;
  total: number;
  savings: number;
}

/**
 * Stacked: each discount applies to the already-discounted price (20% + 10% = 28% off).
 * Combined: discounts are added first (20% + 10% = 30% off), capped at 100%.
 */
export function calculateDiscount(input: DiscountInput): DiscountResult | null {
  const { price, mode } = input;
  const qty = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const discounts = input.discounts.filter((d) => Number.isFinite(d) && d !== 0);
  if (!Number.isFinite(price) || price < 0) return null;
  if (discounts.some((d) => d < 0 || d > 100)) return null;
  const steps: DiscountResult["steps"] = [];
  let p = price;
  if (mode === "stacked") {
    for (const d of discounts) {
      const amt = p * (d / 100);
      p -= amt;
      steps.push({ label: `${d}% off`, amount: amt, priceAfter: p });
    }
  } else if (discounts.length) {
    const total = Math.min(100, discounts.reduce((s, d) => s + d, 0));
    const amt = p * (total / 100);
    p -= amt;
    steps.push({ label: `${total}% off (combined)`, amount: amt, priceAfter: p });
  }
  const flat = input.flatOff && input.flatOff > 0 ? Math.min(input.flatOff, p) : 0;
  if (flat) {
    p -= flat;
    steps.push({ label: "Flat amount off", amount: flat, priceAfter: p });
  }
  const tax = Number.isFinite(input.taxPercent) && (input.taxPercent ?? 0) > 0 ? p * ((input.taxPercent as number) / 100) : 0;
  const savingsUnit = price - p;
  return {
    unitPrice: price,
    steps,
    discountedUnit: p,
    savingsUnit,
    effectiveDiscount: price > 0 ? (savingsUnit / price) * 100 : 0,
    taxUnit: tax,
    finalUnit: p + tax,
    quantity: qty,
    subtotal: p * qty,
    tax: tax * qty,
    total: (p + tax) * qty,
    savings: savingsUnit * qty,
  };
}
