"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, DataTable, DownloadButton, ErrorMessage, Panel } from "@/components/tools/shared";
import { compoundInterest, simpleInterest, type CompoundFrequency, type TimeUnit } from "@/lib/processors/calculators/finance";
import { NumField, SelectField, SplitBar, money, num } from "./common";

/** Compound (processorOptions.kind = "compound") and simple interest (kind = "simple"). */
export default function InterestCalculator({ tool }: ToolComponentProps) {
  return tool.processorOptions?.kind === "simple" ? <Simple /> : <Compound />;
}

function useIndian() {
  return useState(false);
}

function Compound() {
  const [p, setP] = useState("");
  const [rate, setRate] = useState("");
  const [years, setYears] = useState("");
  const [freq, setFreq] = useState<CompoundFrequency>("monthly");
  const [contrib, setContrib] = useState("");
  const [atStart, setAtStart] = useState(false);
  const [indian, setIndian] = useIndian();

  const P = num(p);
  const R = num(rate);
  const Y = num(years);
  let error: string | null = null;
  if (p && !(P >= 0)) error = "Initial amount cannot be negative.";
  else if (years && !(Y > 0 && Y <= 200)) error = "Enter a period between 0 and 200 years.";
  else if (rate && !Number.isFinite(R)) error = "Enter a valid interest rate.";
  const r =
    !error && Number.isFinite(R) && Y > 0 && (P >= 0 || num(contrib) > 0)
      ? compoundInterest({ principal: P >= 0 ? P : 0, annualRatePct: R, years: Y, frequency: freq, monthlyContribution: num(contrib), contributeAtStart: atStart })
      : null;
  const m = (n: number) => money(n, indian);
  const csv = r
    ? ["Year,Contributions,Interest,Balance", ...r.yearly.map((y) => [y.year, y.contributions.toFixed(2), y.interest.toFixed(2), y.balance.toFixed(2)].join(","))].join("\r\n") + "\r\n"
    : "";

  return (
    <div className="space-y-4">
      <Panel title="Investment">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Initial amount" value={p} onChange={setP} testId="input" />
          <NumField label="Annual interest rate" value={rate} onChange={setRate} suffix="%" />
          <NumField label="Period" value={years} onChange={setYears} suffix="years" />
          <SelectField
            label="Compounding"
            value={freq}
            onChange={setFreq}
            options={[
              { value: "annually", label: "Annually (1×/year)" },
              { value: "semiannually", label: "Semi-annually (2×/year)" },
              { value: "quarterly", label: "Quarterly (4×/year)" },
              { value: "monthly", label: "Monthly (12×/year)" },
              { value: "daily", label: "Daily (365×/year)" },
            ]}
          />
          <NumField label="Monthly contribution" value={contrib} onChange={setContrib} hint="optional" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox label="Contribute at the start of each month" checked={atStart} onChange={setAtStart} />
          <Checkbox label="Indian number format" checked={indian} onChange={setIndian} />
        </div>
      </Panel>
      <ErrorMessage error={error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="Final balance" value={r ? m(r.finalBalance) : "—"} />
        <Stat label="Total interest earned" value={r ? m(r.totalInterest) : "—"} />
        <Stat label="Total contributed" value={r ? m(r.totalContributions) : "—"} sub="initial + monthly" />
        <Stat label="Effective annual rate" value={r ? `${r.effectiveAnnualRate.toFixed(3)}%` : "—"} sub="APY" />
      </div>
      {r ? (
        <>
          <Panel title="Composition of final balance">
            <SplitBar
              parts={[
                { label: "Contributions", value: r.totalContributions, tone: "strong" },
                { label: "Interest", value: r.totalInterest, tone: "muted" },
              ]}
            />
          </Panel>
          <Panel title="Year-by-year growth" actions={<DownloadButton text={csv} filename="compound-interest.csv" mime="text/csv;charset=utf-8" label="CSV" size="sm" variant="secondary" />}>
            <DataTable headers={["Year", "Contributions", "Interest", "Balance"]} rows={r.yearly.map((y) => [y.year, m(y.contributions), m(y.interest), m(y.balance)])} />
          </Panel>
          <p className="text-xs text-fg-subtle">
            A = P(1 + r/n)<sup>nt</sup>. Monthly contributions grow at the monthly rate equivalent to the chosen compounding frequency; banks that credit interest only at period ends may show slightly different figures. Taxes and inflation are not included.
          </p>
        </>
      ) : null}
      <ActionBar
        onReset={() => {
          setP("");
          setRate("");
          setYears("");
          setFreq("monthly");
          setContrib("");
          setAtStart(false);
          setIndian(false);
        }}
      />
    </div>
  );
}

function Simple() {
  const [p, setP] = useState("");
  const [rate, setRate] = useState("");
  const [time, setTime] = useState("");
  const [unit, setUnit] = useState<TimeUnit>("years");
  const [indian, setIndian] = useIndian();
  const r = simpleInterest(num(p), num(rate), num(time), unit);
  const m = (n: number) => money(n, indian);
  return (
    <div className="space-y-4">
      <Panel title="Loan or deposit">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Principal" value={p} onChange={setP} testId="input" />
          <NumField label="Annual interest rate" value={rate} onChange={setRate} suffix="%" />
          <div>
            <NumField label="Time" value={time} onChange={setTime} suffix={unit} />
            <Segmented
              className="mt-2"
              label="Time unit"
              value={unit}
              onChange={setUnit}
              options={[
                { value: "years", label: "Years" },
                { value: "months", label: "Months" },
                { value: "days", label: "Days" },
              ]}
            />
          </div>
        </div>
        <div className="mt-3">
          <Checkbox label="Indian number format" checked={indian} onChange={setIndian} />
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="Simple interest" value={r ? m(r.interest) : "—"} />
        <Stat label="Total amount" value={r ? m(r.total) : "—"} sub="principal + interest" />
        <Stat label="Interest per year" value={r ? m(r.perYear) : "—"} />
        <Stat label="Time in years" value={r ? r.years.toFixed(4).replace(/\.?0+$/, "") : "—"} />
      </div>
      <p className="text-xs text-fg-subtle">SI = P × R × T ÷ 100. Days are converted using a 365-day year; months as twelfths of a year.</p>
      <ActionBar
        onReset={() => {
          setP("");
          setRate("");
          setTime("");
          setUnit("years");
          setIndian(false);
        }}
      />
    </div>
  );
}
