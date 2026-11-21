"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, DataTable, DownloadButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { amortize, indianWords, scheduleToCsv } from "@/lib/processors/calculators/finance";
import { NumField, SplitBar, num } from "./common";

/**
 * Shared by the EMI Calculator (processorOptions.variant = "emi": Indian formatting by
 * default) and the Loan Calculator (variant = "loan": start month and extra payments).
 */
export default function LoanCalculator({ tool }: ToolComponentProps) {
  const isEmi = tool.processorOptions?.variant === "emi";
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [term, setTerm] = useState("");
  const [termUnit, setTermUnit] = useState<"years" | "months">("years");
  const [extra, setExtra] = useState("");
  const [start, setStart] = useState("");
  const [indian, setIndian] = useState(isEmi);
  const [view, setView] = useState<"yearly" | "monthly">("yearly");

  const P = num(principal);
  const R = num(rate);
  const T = num(term);
  const months = Number.isFinite(T) ? Math.round(termUnit === "years" ? T * 12 : T) : NaN;
  let error: string | null = null;
  if (principal && !(P > 0)) error = "Loan amount must be greater than zero.";
  else if (rate && !(R >= 0 && R <= 100)) error = "Interest rate must be between 0 and 100% per year.";
  else if (term && !(months >= 1 && months <= 1200)) error = "Tenure must be between 1 month and 100 years.";
  const r = !error && P > 0 && R >= 0 && months >= 1 ? amortize(P, R, months, { extraMonthly: num(extra), startMonth: start || undefined }) : null;

  const sym = isEmi || indian ? "₹" : "";
  const money = (n: number, d = 2) =>
    Number.isFinite(n) ? sym + n.toLocaleString(indian ? "en-IN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
  const hasExtra = !!r && r.schedule.some((x) => x.extra > 0);
  const hasDate = !!r && r.schedule.some((x) => x.date);

  return (
    <div className="space-y-4">
      <Panel title={isEmi ? "Loan details" : "Loan terms"}>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField
            label="Loan amount"
            value={principal}
            onChange={setPrincipal}
            prefix={sym || undefined}
            testId="input"
            hint={indian && P > 0 ? indianWords(P) : undefined}
          />
          <NumField label="Interest rate (annual)" value={rate} onChange={setRate} suffix="% p.a." />
          <div>
            <NumField label="Tenure" value={term} onChange={setTerm} suffix={termUnit} />
            <Segmented
              className="mt-2"
              label="Tenure unit"
              value={termUnit}
              onChange={setTermUnit}
              options={[
                { value: "years", label: "Years" },
                { value: "months", label: "Months" },
              ]}
            />
          </div>
        </div>
        {!isEmi ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <NumField label="Extra payment every month" value={extra} onChange={setExtra} hint="optional prepayment" />
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-fg">First payment month</span>
              <input
                type="month"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-card px-3 font-mono text-sm text-fg"
              />
            </label>
          </div>
        ) : null}
        <div className="mt-3">
          <Checkbox label="Indian number format (lakh / crore grouping, ₹)" checked={indian} onChange={setIndian} />
        </div>
      </Panel>
      <ErrorMessage error={error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label={isEmi ? "Monthly EMI" : "Monthly payment"} value={r ? money(r.payment) : "—"} sub={hasExtra && r ? `+ ${money(num(extra))} extra` : undefined} />
        <Stat label="Total interest" value={r ? money(r.totalInterest) : "—"} />
        <Stat label="Total amount payable" value={r ? money(r.totalPaid) : "—"} />
        <Stat
          label={hasExtra ? "Paid off in" : "Number of payments"}
          value={r ? `${r.paymentsMade}` : "—"}
          sub={r ? (hasExtra ? `saves ${money(r.interestSaved, 0)} interest` : `${Math.floor(r.paymentsMade / 12)}y ${r.paymentsMade % 12}m`) : undefined}
        />
      </div>

      {r ? (
        <>
          <Panel title="Principal vs interest">
            <SplitBar
              parts={[
                { label: "Principal", value: P, tone: "strong" },
                { label: "Interest", value: r.totalInterest, tone: "muted" },
              ]}
            />
          </Panel>
          <Panel
            title="Amortization schedule"
            actions={
              <>
                <Segmented
                  label="Schedule view"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "yearly", label: "Yearly" },
                    { value: "monthly", label: "Monthly" },
                  ]}
                />
                <DownloadButton text={scheduleToCsv(r.schedule)} filename={isEmi ? "emi-schedule.csv" : "loan-amortization.csv"} mime="text/csv;charset=utf-8" label="CSV" size="sm" variant="secondary" />
              </>
            }
          >
            {view === "yearly" ? (
              <DataTable
                headers={["Year", "Principal paid", "Interest paid", "Balance"]}
                rows={r.yearly.map((y) => [y.year, money(y.principal), money(y.interest), money(y.balance)])}
              />
            ) : (
              <DataTable
                max={1200}
                headers={["#", ...(hasDate ? ["Month"] : []), "Payment", "Principal", "Interest", ...(hasExtra ? ["Extra"] : []), "Balance"]}
                rows={r.schedule.map((x) => [
                  x.period,
                  ...(hasDate ? [x.date ?? ""] : []),
                  money(x.payment + x.extra),
                  money(x.principal),
                  money(x.interest),
                  ...(hasExtra ? [money(x.extra)] : []),
                  money(x.balance),
                ])}
              />
            )}
          </Panel>
          <p className="text-xs text-fg-subtle">
            EMI = P × r × (1 + r)ⁿ ÷ ((1 + r)ⁿ − 1), with r the monthly rate (annual ÷ 12) and n the number of months. Figures assume a fixed rate with interest on the reducing balance; lenders may round each instalment and add processing fees or insurance.
          </p>
        </>
      ) : null}

      <ActionBar
        onReset={() => {
          setPrincipal("");
          setRate("");
          setTerm("");
          setTermUnit("years");
          setExtra("");
          setStart("");
          setIndian(isEmi);
          setView("yearly");
        }}
      />
    </div>
  );
}
