"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, KeyValueTable, Panel } from "@/components/tools/shared";
import { calculateGst, GST_RATES_CURRENT, GST_RATES_LEGACY, type GstMode, type SupplyType } from "@/lib/processors/calculators/gst";
import { NumField, inr, num } from "./common";
import { cn } from "@/lib/utils/cn";

const RATE_NOTES: Record<string, string> = {
  "0": "Exempt / nil-rated",
  "0.25": "Rough precious stones",
  "3": "Gold, silver, jewellery",
  "5": "Merit rate (GST 2.0)",
  "18": "Standard rate (GST 2.0)",
  "40": "Sin / luxury goods",
  "12": "Pre-22 Sep 2025 slab",
  "28": "Pre-22 Sep 2025 slab",
};

export default function GstCalculator() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("18");
  const [custom, setCustom] = useState("");
  const [mode, setMode] = useState<GstMode>("add");
  const [supply, setSupply] = useState<SupplyType>("intra");

  const effectiveRate = rate === "custom" ? num(custom) : Number(rate);
  const a = num(amount);
  const r = Number.isFinite(a) && Number.isFinite(effectiveRate) ? calculateGst(a, effectiveRate, mode, supply) : null;
  const rateError = rate === "custom" && custom !== "" && (!Number.isFinite(effectiveRate) || effectiveRate < 0 || effectiveRate > 100) ? "Enter a rate between 0 and 100." : null;

  const rateButton = (v: string, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setRate(v)}
      aria-pressed={rate === v}
      title={RATE_NOTES[v]}
      className={cn(
        "rounded-lg border px-3 py-1.5 font-mono text-[13px] transition-colors",
        rate === v ? "border-fg bg-fg text-bg" : "border-border bg-card text-fg hover:bg-bg-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <Panel title="Amount and rate">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Segmented
              label="Calculation"
              value={mode}
              onChange={setMode}
              options={[
                { value: "add", label: "Add GST (exclusive)" },
                { value: "remove", label: "Remove GST (inclusive)" },
              ]}
            />
            <Segmented
              label="Supply type"
              value={supply}
              onChange={setSupply}
              options={[
                { value: "intra", label: "Intra-state (CGST + SGST)" },
                { value: "inter", label: "Inter-state (IGST)" },
              ]}
            />
          </div>
          <NumField
            label={mode === "add" ? "Taxable value (before GST)" : "Amount including GST"}
            value={amount}
            onChange={setAmount}
            prefix="₹"
            testId="input"
          />
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg">GST rate</p>
            <div className="flex flex-wrap gap-2">
              {GST_RATES_CURRENT.map((x) => (
                rateButton(String(x), `${x}%`)
              ))}
              <span className="mx-1 self-center text-xs text-fg-subtle">Legacy:</span>
              {GST_RATES_LEGACY.map((x) => (
                rateButton(String(x), `${x}%`)
              ))}
              {rateButton("custom", "Custom")}
            </div>
            {rate !== "custom" ? <p className="mt-1.5 text-xs text-fg-subtle">{RATE_NOTES[rate]}</p> : null}
          </div>
          {rate === "custom" ? <NumField label="Custom rate" value={custom} onChange={setCustom} suffix="%" error={rateError} className="max-w-xs" /> : null}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="output">
        <Stat label="Taxable value" value={r ? inr(r.net, 2) : "—"} />
        <Stat label={`GST @ ${Number.isFinite(effectiveRate) ? effectiveRate : "—"}%`} value={r ? inr(r.gst, 2) : "—"} />
        <Stat label="Total (incl. GST)" value={r ? inr(r.gross, 2) : "—"} />
      </div>

      {r ? (
        <Panel title="Tax split">
          <KeyValueTable
            rows={
              supply === "intra"
                ? [
                    [`CGST @ ${effectiveRate / 2}%`, inr(r.cgst, 2)],
                    [`SGST / UTGST @ ${effectiveRate / 2}%`, inr(r.sgst, 2)],
                    ["Total GST", inr(r.gst, 2)],
                  ]
                : [
                    [`IGST @ ${effectiveRate}%`, inr(r.igst, 2)],
                    ["Total GST", inr(r.gst, 2)],
                  ]
            }
          />
          <p className="mt-3 text-xs text-fg-subtle">
            {mode === "remove"
              ? `Taxable value = amount × 100 ÷ (100 + ${effectiveRate}).`
              : `GST = taxable value × ${effectiveRate} ÷ 100.`}{" "}
            Amounts are shown to the paisa; invoices usually round each tax line to the nearest paisa or rupee.
          </p>
        </Panel>
      ) : null}

      <ActionBar
        onReset={() => {
          setAmount("");
          setRate("18");
          setCustom("");
          setMode("add");
          setSupply("intra");
        }}
      />
    </div>
  );
}
