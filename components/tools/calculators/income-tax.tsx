"use client";

import { useState } from "react";
import { Checkbox, Segmented } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { CAPS, compareRegimes, type AgeGroup, type TaxResult } from "@/lib/processors/calculators/income-tax";
import { NumField, SelectField, inr, num } from "./common";

const empty = {
  salary: "",
  other: "",
  employerNps: "",
  hra: "",
  profTax: "",
  c80: "",
  d80: "",
  nps1b: "",
  homeLoan: "",
  otherDed: "",
};

const pct = (r: number) => (r % 1 ? r.toFixed(2) : String(r));

function Breakdown({ r, title }: { r: TaxResult; title: string }) {
  const rows: [string, string][] = [
    ["Gross income", inr(r.grossIncome)],
    ["Standard deduction", `− ${inr(r.standardDeduction)}`],
  ];
  if (r.regime === "old") rows.push(["Exemptions (HRA, professional tax)", `− ${inr(r.exemptions)}`]);
  rows.push(
    [r.regime === "old" ? "Deductions (Chapter VI-A, 24(b))" : "Deductions (80CCD(2))", `− ${inr(r.deductions)}`],
    ["Taxable income", inr(r.taxableIncome)],
    ["Tax on slabs", inr(r.slabTax)],
  );
  if (r.rebate) rows.push(["Rebate u/s 87A", `− ${inr(r.rebate)}`]);
  if (r.rebateRelief) rows.push(["Marginal relief (87A)", `− ${inr(r.rebateRelief)}`]);
  if (r.surchargeRate) {
    rows.push([`Surcharge @ ${r.surchargeRate}%`, inr(r.surcharge)]);
    if (r.surchargeRelief > 0.5) rows.push(["Marginal relief on surcharge", `(${inr(r.surchargeRelief)} waived)`]);
  }
  rows.push(["Health & education cess @ 4%", inr(r.cess)], ["Total tax payable", inr(r.totalTax)]);
  return (
    <Panel title={title}>
      <KeyValueTable rows={rows} />
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[13px]">
          <thead className="bg-bg-muted">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Slab</th>
              <th className="px-3 py-1.5 text-right font-medium">Rate</th>
              <th className="px-3 py-1.5 text-right font-medium">Tax</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.slabs.map((s) => (
              <tr key={s.from} className={s.taxable > 0 ? "text-fg" : "text-fg-subtle"}>
                <td className="px-3 py-1.5 font-mono">
                  {inr(s.from)} – {Number.isFinite(s.to) ? inr(s.to) : "above"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{pct(s.rate)}%</td>
                <td className="px-3 py-1.5 text-right font-mono">{inr(s.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function IncomeTaxCalculator() {
  const [v, setV] = useState(empty);
  const [salaried, setSalaried] = useState(true);
  const [age, setAge] = useState<AgeGroup>("below60");
  const [view, setView] = useState<"new" | "old">("new");
  const set = (k: keyof typeof empty) => (s: string) => setV((p) => ({ ...p, [k]: s }));
  const n = (s: string) => {
    const x = num(s);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };

  const hasIncome = n(v.salary) + n(v.other) > 0;
  const c = compareRegimes({
    salary: n(v.salary),
    otherIncome: n(v.other),
    salaried,
    age,
    employerNps: n(v.employerNps),
    hraExemption: n(v.hra),
    professionalTax: n(v.profTax),
    sec80C: n(v.c80),
    sec80D: n(v.d80),
    sec80CCD1B: n(v.nps1b),
    homeLoanInterest: n(v.homeLoan),
    otherDeductions: n(v.otherDed),
  });

  return (
    <div className="space-y-4">
      <Panel title="Income (FY 2025-26, annual)">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumField label="Gross salary / pension" value={v.salary} onChange={set("salary")} prefix="₹" testId="input" />
          <NumField label="Other income" value={v.other} onChange={set("other")} prefix="₹" hint="interest, rent, business" />
          <SelectField
            label="Age"
            value={age}
            onChange={setAge}
            options={[
              { value: "below60", label: "Below 60" },
              { value: "60to79", label: "60 to 79 (senior)" },
              { value: "80plus", label: "80 or above (super senior)" },
            ]}
          />
        </div>
        <div className="mt-3">
          <Checkbox label="Salaried or pensioner (apply standard deduction)" checked={salaried} onChange={setSalaried} description="₹75,000 in the new regime, ₹50,000 in the old regime" />
        </div>
      </Panel>

      <Panel title="Deductions and exemptions">
        <p className="mb-3 text-xs text-fg-subtle">Only employer NPS (80CCD(2)) applies to the new regime. The rest apply to the old regime; statutory caps are enforced.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumField label="Employer NPS, 80CCD(2)" value={v.employerNps} onChange={set("employerNps")} prefix="₹" hint="both regimes" />
          <NumField label="Section 80C" value={v.c80} onChange={set("c80")} prefix="₹" hint={`max ${inr(CAPS.sec80C)}`} />
          <NumField label="Section 80D (health insurance)" value={v.d80} onChange={set("d80")} prefix="₹" hint={`max ${inr(CAPS.sec80D)}`} />
          <NumField label="HRA exemption" value={v.hra} onChange={set("hra")} prefix="₹" hint="exempt portion" />
          <NumField label="Home loan interest, 24(b)" value={v.homeLoan} onChange={set("homeLoan")} prefix="₹" hint={`max ${inr(CAPS.homeLoanInterest)}`} />
          <NumField label="NPS, 80CCD(1B)" value={v.nps1b} onChange={set("nps1b")} prefix="₹" hint={`max ${inr(CAPS.sec80CCD1B)}`} />
          <NumField label="Professional tax" value={v.profTax} onChange={set("profTax")} prefix="₹" hint={`max ${inr(CAPS.professionalTax)}`} />
          <NumField label="Other deductions (80E, 80G, 80TTA…)" value={v.otherDed} onChange={set("otherDed")} prefix="₹" />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="New regime tax" value={hasIncome ? inr(c.new.totalTax) : "—"} sub={hasIncome ? `${c.new.effectiveRate.toFixed(2)}% effective` : undefined} />
        <Stat label="Old regime tax" value={hasIncome ? inr(c.old.totalTax) : "—"} sub={hasIncome ? `${c.old.effectiveRate.toFixed(2)}% effective` : undefined} />
        <Stat
          label="Better option"
          value={!hasIncome ? "—" : c.better === "equal" ? "Same" : c.better === "new" ? "New regime" : "Old regime"}
          sub={hasIncome && c.better !== "equal" ? `saves ${inr(c.saving)}` : undefined}
        />
        <Stat label="Monthly tax (better regime)" value={hasIncome ? inr(Math.min(c.new.totalTax, c.old.totalTax) / 12) : "—"} />
      </div>

      {hasIncome ? (
        <>
          <Segmented
            label="Breakdown"
            value={view}
            onChange={setView}
            options={[
              { value: "new", label: "New regime breakdown" },
              { value: "old", label: "Old regime breakdown" },
            ]}
          />
          {view === "new" ? <Breakdown r={c.new} title="New regime (Section 115BAC)" /> : <Breakdown r={c.old} title="Old regime" />}
        </>
      ) : null}

      <Alert tone="info" title="This is an estimate">
        Assumes a resident individual with all income taxed at normal slab rates for FY 2025-26 (AY 2026-27). It does not handle
        special-rate income (capital gains under 111A/112A, lottery), agricultural income, HUFs, non-residents, advance tax interest
        or TDS. The 87A rebate is not available on special-rate income. Verify with the Income Tax Department&apos;s calculator or a tax professional before filing.
      </Alert>

      <ActionBar
        onReset={() => {
          setV(empty);
          setSalaried(true);
          setAge("below60");
          setView("new");
        }}
      />
    </div>
  );
}
