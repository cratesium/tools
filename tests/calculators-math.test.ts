import { describe, expect, it } from "vitest";
import { applyPercent, calculateDiscount, changeDetails, percentChange, percentDifference, percentOf, whatPercent, wholeFromPart } from "@/lib/processors/calculators/percent";
import { calculateGst, roundPaise, GST_RATES_CURRENT } from "@/lib/processors/calculators/gst";
import { compareRegimes, computeTax, oldRegimeSlabs, slabTax, NEW_REGIME_SLABS, type TaxInput } from "@/lib/processors/calculators/income-tax";
import { amortize, compoundInterest, emi, formatMoney, indianWords, scheduleToCsv, simpleInterest } from "@/lib/processors/calculators/finance";

describe("percentages", () => {
  it("computes the three classic forms", () => {
    expect(percentOf(15, 200)).toBe(30);
    expect(whatPercent(30, 200)).toBe(15);
    expect(percentChange(80, 100)).toBe(25);
    expect(percentChange(100, 80)).toBe(-20);
    expect(percentChange(-50, -25)).toBe(50);
    expect(whatPercent(1, 0)).toBeNaN();
    expect(percentChange(0, 5)).toBeNaN();
  });
  it("handles increase/decrease, reverse and difference", () => {
    expect(applyPercent(200, 10)).toBeCloseTo(220);
    expect(applyPercent(200, -10)).toBeCloseTo(180);
    expect(wholeFromPart(30, 15)).toBe(200);
    expect(percentDifference(90, 110)).toBeCloseTo(20);
    const c = changeDetails(100, 125);
    expect(c.direction).toBe("increase");
    expect(c.absolute).toBe(25);
    expect(c.multiplier).toBe(1.25);
    expect(c.reverse).toBeCloseTo(-20);
    expect(changeDetails(5, 5).direction).toBe("none");
  });
});

describe("discounts", () => {
  it("stacks discounts sequentially", () => {
    const r = calculateDiscount({ price: 1000, discounts: [20, 10], mode: "stacked" })!;
    expect(r.discountedUnit).toBeCloseTo(720);
    expect(r.effectiveDiscount).toBeCloseTo(28);
    expect(r.steps).toHaveLength(2);
  });
  it("combines discounts additively and caps at 100%", () => {
    expect(calculateDiscount({ price: 1000, discounts: [20, 10], mode: "combined" })!.discountedUnit).toBeCloseTo(700);
    expect(calculateDiscount({ price: 1000, discounts: [60, 60], mode: "combined" })!.discountedUnit).toBe(0);
  });
  it("applies flat amount, tax and quantity", () => {
    const r = calculateDiscount({ price: 1000, discounts: [10], mode: "stacked", flatOff: 100, taxPercent: 18, quantity: 2 })!;
    expect(r.discountedUnit).toBeCloseTo(800);
    expect(r.taxUnit).toBeCloseTo(144);
    expect(r.finalUnit).toBeCloseTo(944);
    expect(r.total).toBeCloseTo(1888);
    expect(r.savings).toBeCloseTo(400);
  });
  it("rejects invalid input", () => {
    expect(calculateDiscount({ price: -1, discounts: [], mode: "stacked" })).toBeNull();
    expect(calculateDiscount({ price: 10, discounts: [120], mode: "stacked" })).toBeNull();
  });
});

describe("GST", () => {
  it("adds GST with CGST/SGST split", () => {
    const r = calculateGst(1000, 18, "add", "intra")!;
    expect(r.gst).toBeCloseTo(180);
    expect(r.gross).toBeCloseTo(1180);
    expect(r.cgst).toBeCloseTo(90);
    expect(r.sgst).toBeCloseTo(90);
    expect(r.igst).toBe(0);
  });
  it("removes GST (inclusive amount) with IGST", () => {
    const r = calculateGst(1180, 18, "remove", "inter")!;
    expect(r.net).toBeCloseTo(1000);
    expect(r.gst).toBeCloseTo(180);
    expect(r.igst).toBeCloseTo(180);
    expect(r.cgst).toBe(0);
  });
  it("supports GST 2.0 rates including 40% and 0.25%", () => {
    expect(GST_RATES_CURRENT).toEqual([0, 0.25, 3, 5, 18, 40]);
    expect(calculateGst(1000, 40, "add")!.gross).toBeCloseTo(1400);
    expect(calculateGst(1000, 0.25, "add")!.gst).toBeCloseTo(2.5);
    expect(calculateGst(105, 5, "remove")!.net).toBeCloseTo(100);
    expect(calculateGst(500, 0, "add")!.gst).toBe(0);
  });
  it("validates and rounds", () => {
    expect(calculateGst(-1, 18, "add")).toBeNull();
    expect(calculateGst(100, 101, "add")).toBeNull();
    expect(roundPaise(1.005)).toBe(1.01);
    expect(roundPaise(152.544)).toBe(152.54);
  });
});

const base: TaxInput = { salary: 0, otherIncome: 0, salaried: true, age: "below60" };

describe("income tax FY 2025-26: new regime", () => {
  it("computes slab tax", () => {
    expect(slabTax(2400000, NEW_REGIME_SLABS).total).toBe(300000);
    expect(slabTax(3000000, NEW_REGIME_SLABS).total).toBe(480000);
    expect(slabTax(400000, NEW_REGIME_SLABS).total).toBe(0);
  });
  it("salary 12,75,000 → zero tax (75k std deduction + 87A rebate)", () => {
    const r = computeTax({ ...base, salary: 1275000 }, "new");
    expect(r.taxableIncome).toBe(1200000);
    expect(r.slabTax).toBe(60000);
    expect(r.rebate).toBe(60000);
    expect(r.totalTax).toBe(0);
  });
  it("salary 13,00,000 → marginal relief caps tax at income above 12L", () => {
    const r = computeTax({ ...base, salary: 1300000 }, "new");
    expect(r.taxableIncome).toBe(1225000);
    expect(r.slabTax).toBe(63750);
    expect(r.rebateRelief).toBe(38750);
    expect(r.taxAfterRebate).toBe(25000);
    expect(r.cess).toBe(1000);
    expect(r.totalTax).toBe(26000);
  });
  it("marginal relief ends once slab tax is below the excess", () => {
    const r = computeTax({ ...base, salary: 0, otherIncome: 1300000, salaried: false }, "new");
    expect(r.taxableIncome).toBe(1300000);
    expect(r.slabTax).toBe(75000);
    expect(r.rebateRelief).toBe(0);
    expect(r.totalTax).toBe(78000);
  });
  it("non-salaried income gets no standard deduction", () => {
    expect(computeTax({ ...base, otherIncome: 1200000, salaried: false }, "new").totalTax).toBe(0);
    expect(computeTax({ ...base, salary: 1200000, salaried: false }, "new").standardDeduction).toBe(0);
  });
  it("applies surcharge with marginal relief just above ₹50L", () => {
    const r = computeTax({ ...base, otherIncome: 5100000, salaried: false }, "new");
    expect(r.slabTax).toBe(1110000);
    expect(r.surchargeRate).toBe(10);
    expect(r.surcharge).toBeCloseTo(70000); // capped: 10,80,000 + 1,00,000 − 11,10,000
    expect(r.surchargeRelief).toBeCloseTo(41000);
  });
  it("applies full surcharge well above the threshold and caps new regime at 25%", () => {
    const r = computeTax({ ...base, otherIncome: 8000000, salaried: false }, "new");
    expect(r.surcharge).toBeCloseTo(r.slabTax * 0.1);
    const big = computeTax({ ...base, otherIncome: 60000000, salaried: false }, "new");
    expect(big.surchargeRate).toBe(25);
    const bigOld = computeTax({ ...base, otherIncome: 60000000, salaried: false }, "old");
    expect(bigOld.surchargeRate).toBe(37);
  });
  it("employer NPS (80CCD(2)) reduces taxable income in the new regime", () => {
    expect(computeTax({ ...base, salary: 1400000, employerNps: 100000 }, "new").taxableIncome).toBe(1225000);
  });
});

describe("income tax FY 2025-26: old regime", () => {
  it("uses age-based exemption limits", () => {
    expect(oldRegimeSlabs("below60")[0].to).toBe(250000);
    expect(oldRegimeSlabs("60to79")[0].to).toBe(300000);
    expect(oldRegimeSlabs("80plus")).toHaveLength(3);
  });
  it("applies 87A rebate up to ₹5L taxable", () => {
    const r = computeTax({ ...base, salary: 550000 }, "old");
    expect(r.taxableIncome).toBe(500000);
    expect(r.slabTax).toBe(12500);
    expect(r.totalTax).toBe(0);
  });
  it("applies deductions with statutory caps", () => {
    const r = computeTax({ ...base, salary: 1000000, sec80C: 200000 }, "old");
    expect(r.deductions).toBe(150000);
    expect(r.taxableIncome).toBe(800000);
    expect(r.slabTax).toBe(72500);
    expect(r.totalTax).toBeCloseTo(75400);
  });
  it("ignores old-regime deductions in the new regime and compares regimes", () => {
    const input: TaxInput = { ...base, salary: 1500000, sec80C: 150000, sec80D: 25000, hraExemption: 200000, homeLoanInterest: 200000, sec80CCD1B: 50000 };
    const c = compareRegimes(input);
    expect(c.new.deductions).toBe(0);
    expect(c.old.taxableIncome).toBe(1500000 - 50000 - 200000 - 150000 - 25000 - 200000 - 50000);
    // new: taxable 14,25,000 → 60,000 + 33,750 = 93,750 + cess = 97,500
    expect(c.new.totalTax).toBeCloseTo(97500);
    // old: taxable 8,25,000 → 12,500 + 65,000 = 77,500 + cess = 80,600
    expect(c.old.totalTax).toBeCloseTo(80600);
    expect(c.better).toBe("old");
    expect(c.saving).toBe(16900);
  });
});

describe("loans and EMI", () => {
  it("matches the standard EMI formula", () => {
    // ₹10,00,000 at 10% for 20 years: ₹9,650.22
    expect(emi(1000000, 10, 240)).toBeCloseTo(9650.22, 2);
    expect(emi(120000, 0, 12)).toBe(10000);
    expect(emi(0, 10, 12)).toBeNaN();
  });
  it("amortizes to zero with consistent totals", () => {
    const r = amortize(500000, 9, 60, { startMonth: "2026-11" })!;
    expect(r.schedule).toHaveLength(60);
    expect(r.schedule[59].balance).toBe(0);
    const sumPrincipal = r.schedule.reduce((s, x) => s + x.principal, 0);
    expect(sumPrincipal).toBeCloseTo(500000, 6);
    expect(r.totalPaid).toBeCloseTo(r.payment * 60, 4);
    expect(r.schedule[0].date).toBe("2026-11");
    expect(r.schedule[2].date).toBe("2027-01");
    expect(r.yearly).toHaveLength(5);
    expect(r.yearly[4].balance).toBe(0);
  });
  it("shortens the loan with extra payments", () => {
    const base = amortize(500000, 9, 60)!;
    const r = amortize(500000, 9, 60, { extraMonthly: 2000 })!;
    expect(r.paymentsMade).toBeLessThan(60);
    expect(r.totalInterest).toBeLessThan(base.totalInterest);
    expect(r.interestSaved).toBeCloseTo(base.totalInterest - r.totalInterest, 4);
    expect(r.schedule[r.schedule.length - 1].balance).toBe(0);
  });
  it("exports a CSV schedule", () => {
    const csv = scheduleToCsv(amortize(12000, 0, 12)!.schedule);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Payment #,Payment,Principal,Interest,Balance");
    expect(lines).toHaveLength(13);
    expect(lines[12]).toBe("12,1000.00,1000.00,0.00,0.00");
  });
  it("formats Indian and international grouping", () => {
    expect(formatMoney(1234567.891, { indian: true })).toBe("12,34,567.89");
    expect(formatMoney(1234567.891)).toBe("1,234,567.89");
    expect(indianWords(1250000)).toBe("12.5 lakh");
    expect(indianWords(32000000)).toBe("3.2 crore");
  });
});

describe("compound and simple interest", () => {
  it("matches P(1 + r/n)^(nt) without contributions", () => {
    const r = compoundInterest({ principal: 10000, annualRatePct: 5, years: 10, frequency: "monthly" })!;
    expect(r.finalBalance).toBeCloseTo(10000 * Math.pow(1 + 0.05 / 12, 120), 6);
    const q = compoundInterest({ principal: 10000, annualRatePct: 8, years: 3, frequency: "quarterly" })!;
    expect(q.finalBalance).toBeCloseTo(10000 * Math.pow(1.02, 12), 6);
    const a = compoundInterest({ principal: 1000, annualRatePct: 10, years: 2, frequency: "annually" })!;
    expect(a.finalBalance).toBeCloseTo(1210, 8);
    expect(a.effectiveAnnualRate).toBeCloseTo(10);
    expect(r.effectiveAnnualRate).toBeCloseTo(5.116, 3);
  });
  it("adds monthly contributions (ordinary annuity and annuity due)", () => {
    const r = compoundInterest({ principal: 0, annualRatePct: 12, years: 1, frequency: "monthly", monthlyContribution: 1000 })!;
    // FV of ordinary annuity: 1000 × ((1.01^12 − 1) / 0.01)
    expect(r.finalBalance).toBeCloseTo(1000 * ((Math.pow(1.01, 12) - 1) / 0.01), 6);
    const due = compoundInterest({ principal: 0, annualRatePct: 12, years: 1, frequency: "monthly", monthlyContribution: 1000, contributeAtStart: true })!;
    expect(due.finalBalance).toBeCloseTo(r.finalBalance * 1.01, 6);
    expect(r.totalContributions).toBe(12000);
    expect(r.yearly).toHaveLength(1);
    expect(r.yearly[0].interest).toBeCloseTo(r.totalInterest, 8);
  });
  it("builds a yearly table that sums to the totals", () => {
    const r = compoundInterest({ principal: 5000, annualRatePct: 7, years: 5, frequency: "daily", monthlyContribution: 100 })!;
    expect(r.yearly).toHaveLength(5);
    const interest = r.yearly.reduce((s, y) => s + y.interest, 0);
    expect(interest).toBeCloseTo(r.totalInterest, 6);
    expect(r.yearly[4].balance).toBeCloseTo(r.finalBalance, 8);
  });
  it("computes simple interest across time units", () => {
    expect(simpleInterest(10000, 8, 3)!.interest).toBe(2400);
    expect(simpleInterest(10000, 12, 6, "months")!.interest).toBeCloseTo(600);
    expect(simpleInterest(36500, 10, 30, "days")!.interest).toBeCloseTo(300);
    expect(simpleInterest(-1, 8, 3)).toBeNull();
  });
});
