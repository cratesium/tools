/**
 * Loans, EMI, compound and simple interest. Pure functions.
 */

/** Equated periodic instalment for principal P, periodic rate r (fraction), n periods. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (!(principal > 0) || !(months > 0) || !Number.isFinite(annualRatePct) || annualRatePct < 0) return NaN;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export interface ScheduleRow {
  period: number;
  /** ISO yyyy-mm (when a start month is given). */
  date?: string;
  payment: number;
  principal: number;
  interest: number;
  extra: number;
  balance: number;
}

export interface LoanResult {
  payment: number;
  months: number;
  /** Actual number of payments (fewer when extra payments are made). */
  paymentsMade: number;
  totalInterest: number;
  totalPaid: number;
  schedule: ScheduleRow[];
  yearly: { year: number; principal: number; interest: number; balance: number }[];
  /** Interest saved compared with no extra payments. */
  interestSaved: number;
}

function addMonthsIso(start: string, k: number): string {
  const [y, m] = start.split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/**
 * Monthly amortization. `extraMonthly` is an additional principal prepayment every month.
 * The final payment is trimmed so the balance ends exactly at zero.
 */
export function amortize(principal: number, annualRatePct: number, months: number, opts: { extraMonthly?: number; startMonth?: string } = {}): LoanResult | null {
  const pay = emi(principal, annualRatePct, months);
  if (!Number.isFinite(pay)) return null;
  const r = annualRatePct / 12 / 100;
  const extra = opts.extraMonthly && opts.extraMonthly > 0 ? opts.extraMonthly : 0;
  const validStart = opts.startMonth && /^\d{4}-\d{2}$/.test(opts.startMonth) ? opts.startMonth : undefined;
  const schedule: ScheduleRow[] = [];
  let bal = principal;
  let totalInterest = 0;
  for (let k = 1; k <= months && bal > 1e-9; k++) {
    const interest = bal * r;
    let princ = Math.min(pay - interest, bal);
    let ex = Math.min(extra, bal - princ);
    if (k === months) {
      princ = bal;
      ex = 0;
    }
    bal = Math.max(0, bal - princ - ex);
    if (bal < 1e-7) bal = 0;
    totalInterest += interest;
    schedule.push({
      period: k,
      date: validStart ? addMonthsIso(validStart, k - 1) : undefined,
      payment: princ + interest,
      principal: princ,
      interest,
      extra: ex,
      balance: bal,
    });
  }
  const yearly: LoanResult["yearly"] = [];
  for (const row of schedule) {
    const y = Math.ceil(row.period / 12);
    let e = yearly[y - 1];
    if (!e) e = yearly[y - 1] = { year: y, principal: 0, interest: 0, balance: 0 };
    e.principal += row.principal + row.extra;
    e.interest += row.interest;
    e.balance = row.balance;
  }
  const baseInterest = pay * months - principal;
  return {
    payment: pay,
    months,
    paymentsMade: schedule.length,
    totalInterest,
    totalPaid: principal + totalInterest,
    schedule,
    yearly,
    interestSaved: extra ? Math.max(0, baseInterest - totalInterest) : 0,
  };
}

export function scheduleToCsv(rows: ScheduleRow[]): string {
  const hasDate = rows.some((r) => r.date);
  const hasExtra = rows.some((r) => r.extra > 0);
  const head = ["Payment #", ...(hasDate ? ["Month"] : []), "Payment", "Principal", "Interest", ...(hasExtra ? ["Extra principal"] : []), "Balance"];
  const f = (n: number) => n.toFixed(2);
  const lines = rows.map((r) =>
    [String(r.period), ...(hasDate ? [r.date ?? ""] : []), f(r.payment + r.extra), f(r.principal), f(r.interest), ...(hasExtra ? [f(r.extra)] : []), f(r.balance)].join(","),
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

export const COMPOUND_FREQUENCIES = {
  annually: 1,
  semiannually: 2,
  quarterly: 4,
  monthly: 12,
  daily: 365,
} as const;
export type CompoundFrequency = keyof typeof COMPOUND_FREQUENCIES;

export interface CompoundInput {
  principal: number;
  annualRatePct: number;
  years: number;
  frequency: CompoundFrequency;
  monthlyContribution?: number;
  /** Contributions at the start of each month (annuity due) instead of the end. */
  contributeAtStart?: boolean;
}

export interface CompoundResult {
  finalBalance: number;
  totalContributions: number;
  totalInterest: number;
  /** Effective annual rate (APY), percent. */
  effectiveAnnualRate: number;
  yearly: { year: number; contributions: number; interest: number; balance: number }[];
}

/**
 * Simulates month by month with the monthly rate equivalent to the chosen compounding
 * frequency: (1 + r/n)^(n/12) − 1. With no contributions this equals P(1 + r/n)^(nt)
 * exactly for whole months.
 */
export function compoundInterest(input: CompoundInput): CompoundResult | null {
  const { principal, annualRatePct, years, frequency } = input;
  const c = input.monthlyContribution && input.monthlyContribution > 0 ? input.monthlyContribution : 0;
  if (!Number.isFinite(principal) || principal < 0 || !Number.isFinite(annualRatePct) || !(years > 0) || years > 200) return null;
  const n = COMPOUND_FREQUENCIES[frequency];
  const r = annualRatePct / 100;
  const monthly = Math.pow(1 + r / n, n / 12) - 1;
  const months = Math.round(years * 12);
  let bal = principal;
  let contributed = principal;
  const yearly: CompoundResult["yearly"] = [];
  let yContrib = 0;
  let yStart = bal;
  for (let m = 1; m <= months; m++) {
    if (input.contributeAtStart) bal += c;
    bal *= 1 + monthly;
    if (!input.contributeAtStart) bal += c;
    contributed += c;
    yContrib += c;
    if (m % 12 === 0 || m === months) {
      yearly.push({ year: Math.ceil(m / 12), contributions: yContrib, interest: bal - yStart - yContrib, balance: bal });
      yContrib = 0;
      yStart = bal;
    }
  }
  return {
    finalBalance: bal,
    totalContributions: contributed,
    totalInterest: bal - contributed,
    effectiveAnnualRate: (Math.pow(1 + r / n, n) - 1) * 100,
    yearly,
  };
}

export type TimeUnit = "years" | "months" | "days";

/** Simple interest I = P × R × T. Days are converted with a 365-day year. */
export function simpleInterest(principal: number, annualRatePct: number, time: number, unit: TimeUnit = "years") {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRatePct) || !Number.isFinite(time) || principal < 0 || time < 0) return null;
  const years = unit === "years" ? time : unit === "months" ? time / 12 : time / 365;
  const interest = (principal * annualRatePct * years) / 100;
  return { interest, total: principal + interest, years, perYear: (principal * annualRatePct) / 100 };
}

/** Indian digit grouping (12,34,567.89) or international (1,234,567.89). */
export function formatMoney(n: number, opts: { indian?: boolean; decimals?: number; symbol?: string } = {}): string {
  if (!Number.isFinite(n)) return "—";
  const d = opts.decimals ?? 2;
  const s = n.toLocaleString(opts.indian ? "en-IN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return (opts.symbol ?? "") + s;
}

/** Words for Indian magnitudes: 12.5 lakh, 1.2 crore. */
export function indianWords(n: number): string {
  if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (a >= 1e7) return `${fmt(n / 1e7)} crore`;
  if (a >= 1e5) return `${fmt(n / 1e5)} lakh`;
  if (a >= 1e3) return `${fmt(n / 1e3)} thousand`;
  return fmt(n);
}
