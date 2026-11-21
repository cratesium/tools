/**
 * India income tax estimate for FY 2025-26 (AY 2026-27), resident individuals,
 * income taxed at normal slab rates only (no special-rate capital gains, lottery etc.).
 *
 * New regime (Sec 115BAC, as amended by Finance Act 2025):
 *   0–4L nil, 4–8L 5%, 8–12L 10%, 12–16L 15%, 16–20L 20%, 20–24L 25%, >24L 30%.
 *   Standard deduction ₹75,000 for salary/pension. 87A rebate up to ₹60,000 when total
 *   income ≤ ₹12,00,000, with marginal relief just above ₹12L (tax cannot exceed the
 *   income above ₹12L). Surcharge capped at 25%. Most deductions not allowed; employer
 *   NPS contribution (80CCD(2)) is.
 * Old regime: 0–2.5L nil (3L for 60–79, 5L for 80+), 2.5–5L 5%, 5–10L 20%, >10L 30%.
 *   Standard deduction ₹50,000. 87A rebate up to ₹12,500 when total income ≤ ₹5L.
 * Both: surcharge 10% > ₹50L, 15% > ₹1Cr, 25% > ₹2Cr, 37% > ₹5Cr (old only) with
 *   marginal relief at each threshold; Health & Education Cess 4% on tax + surcharge.
 */

export type Regime = "new" | "old";
export type AgeGroup = "below60" | "60to79" | "80plus";

export interface Slab {
  from: number;
  to: number; // Infinity for the top slab
  rate: number; // percent
}

export const NEW_REGIME_SLABS: Slab[] = [
  { from: 0, to: 400000, rate: 0 },
  { from: 400000, to: 800000, rate: 5 },
  { from: 800000, to: 1200000, rate: 10 },
  { from: 1200000, to: 1600000, rate: 15 },
  { from: 1600000, to: 2000000, rate: 20 },
  { from: 2000000, to: 2400000, rate: 25 },
  { from: 2400000, to: Infinity, rate: 30 },
];

export function oldRegimeSlabs(age: AgeGroup = "below60"): Slab[] {
  const exempt = age === "80plus" ? 500000 : age === "60to79" ? 300000 : 250000;
  const slabs: Slab[] = [{ from: 0, to: exempt, rate: 0 }];
  if (exempt < 500000) slabs.push({ from: exempt, to: 500000, rate: 5 });
  slabs.push({ from: 500000, to: 1000000, rate: 20 }, { from: 1000000, to: Infinity, rate: 30 });
  return slabs;
}

export const STANDARD_DEDUCTION = { new: 75000, old: 50000 } as const;
export const REBATE_87A = {
  new: { limit: 1200000, max: 60000 },
  old: { limit: 500000, max: 12500 },
} as const;
export const CESS_RATE = 4;
export const CAPS = { sec80C: 150000, sec80D: 100000, sec80CCD1B: 50000, homeLoanInterest: 200000, professionalTax: 2500 };

export interface TaxInput {
  /** Gross salary or pension (before standard deduction). */
  salary: number;
  /** Other income at slab rates: interest, rent (net), business, etc. */
  otherIncome: number;
  /** Apply the salaried standard deduction (only to the salary amount). */
  salaried: boolean;
  age: AgeGroup;
  // Old-regime deductions/exemptions
  hraExemption?: number;
  professionalTax?: number;
  sec80C?: number;
  sec80D?: number;
  sec80CCD1B?: number;
  homeLoanInterest?: number;
  otherDeductions?: number;
  // Allowed in both regimes
  employerNps?: number;
}

export interface SlabLine extends Slab {
  taxable: number;
  tax: number;
}

export interface TaxResult {
  regime: Regime;
  grossIncome: number;
  standardDeduction: number;
  exemptions: number;
  deductions: number;
  taxableIncome: number;
  slabTax: number;
  slabs: SlabLine[];
  rebate: number;
  /** Marginal relief on the 87A rebate (new regime just above ₹12L). */
  rebateRelief: number;
  taxAfterRebate: number;
  surchargeRate: number;
  surcharge: number;
  /** Marginal relief granted on surcharge. */
  surchargeRelief: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
  monthly: number;
}

const pos = (n: number | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : 0);

export function slabTax(income: number, slabs: Slab[]): { total: number; lines: SlabLine[] } {
  let total = 0;
  const lines: SlabLine[] = slabs.map((s) => {
    const taxable = Math.max(0, Math.min(income, s.to) - s.from);
    const tax = (taxable * s.rate) / 100;
    total += tax;
    return { ...s, taxable, tax };
  });
  return { total, lines };
}

function surchargeTiers(regime: Regime): { threshold: number; rate: number }[] {
  const tiers = [
    { threshold: 5000000, rate: 10 },
    { threshold: 10000000, rate: 15 },
    { threshold: 20000000, rate: 25 },
  ];
  if (regime === "old") tiers.push({ threshold: 50000000, rate: 37 });
  return tiers;
}

/** Surcharge with marginal relief: tax + surcharge above a threshold may not exceed
 * (tax + surcharge at the threshold) + (income − threshold). */
export function surchargeFor(income: number, tax: number, regime: Regime, slabs: Slab[]): { rate: number; surcharge: number; relief: number } {
  const tiers = surchargeTiers(regime);
  let idx = -1;
  for (let i = 0; i < tiers.length; i++) if (income > tiers[i].threshold) idx = i;
  if (idx < 0 || tax <= 0) return { rate: 0, surcharge: 0, relief: 0 };
  const { threshold, rate } = tiers[idx];
  const raw = (tax * rate) / 100;
  const prevRate = idx > 0 ? tiers[idx - 1].rate : 0;
  const taxAtThreshold = slabTax(threshold, slabs).total;
  const cap = taxAtThreshold * (1 + prevRate / 100) + (income - threshold);
  const allowed = Math.max(0, Math.min(raw, cap - tax));
  return { rate, surcharge: allowed, relief: raw - allowed };
}

export function computeTax(input: TaxInput, regime: Regime): TaxResult {
  const salary = pos(input.salary);
  const other = pos(input.otherIncome);
  const gross = salary + other;
  const std = input.salaried ? Math.min(salary, STANDARD_DEDUCTION[regime]) : 0;

  let exemptions = 0;
  let deductions = pos(input.employerNps);
  if (regime === "old") {
    exemptions = Math.min(salary - std, pos(input.hraExemption)) + Math.min(CAPS.professionalTax, pos(input.professionalTax));
    deductions +=
      Math.min(CAPS.sec80C, pos(input.sec80C)) +
      Math.min(CAPS.sec80D, pos(input.sec80D)) +
      Math.min(CAPS.sec80CCD1B, pos(input.sec80CCD1B)) +
      Math.min(CAPS.homeLoanInterest, pos(input.homeLoanInterest)) +
      pos(input.otherDeductions);
  }
  exemptions = Math.max(0, exemptions);
  const taxable = Math.max(0, gross - std - exemptions - deductions);
  const slabs = regime === "new" ? NEW_REGIME_SLABS : oldRegimeSlabs(input.age);
  const { total: base, lines } = slabTax(taxable, slabs);

  let rebate = 0;
  let rebateRelief = 0;
  const r = REBATE_87A[regime];
  if (taxable <= r.limit) {
    rebate = Math.min(base, r.max);
  } else if (regime === "new") {
    const excess = taxable - r.limit;
    if (base > excess) rebateRelief = base - excess;
  }
  const afterRebate = Math.max(0, base - rebate - rebateRelief);
  const sc = surchargeFor(taxable, afterRebate, regime, slabs);
  const cess = ((afterRebate + sc.surcharge) * CESS_RATE) / 100;
  const total = afterRebate + sc.surcharge + cess;
  return {
    regime,
    grossIncome: gross,
    standardDeduction: std,
    exemptions,
    deductions,
    taxableIncome: taxable,
    slabTax: base,
    slabs: lines,
    rebate,
    rebateRelief,
    taxAfterRebate: afterRebate,
    surchargeRate: sc.rate,
    surcharge: sc.surcharge,
    surchargeRelief: sc.relief,
    cess,
    totalTax: total,
    effectiveRate: gross > 0 ? (total / gross) * 100 : 0,
    monthly: total / 12,
  };
}

export function compareRegimes(input: TaxInput): { new: TaxResult; old: TaxResult; better: Regime | "equal"; saving: number } {
  const n = computeTax(input, "new");
  const o = computeTax(input, "old");
  const diff = Math.round(o.totalTax) - Math.round(n.totalTax);
  return { new: n, old: o, better: diff === 0 ? "equal" : diff > 0 ? "new" : "old", saving: Math.abs(diff) };
}
