"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Segmented } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, Panel } from "@/components/tools/shared";
import { calculateDiscount, type DiscountMode } from "@/lib/processors/calculators/percent";
import { NumField, fmt, money, num } from "./common";

export default function DiscountCalculator() {
  const [price, setPrice] = useState("");
  const [discounts, setDiscounts] = useState<string[]>([""]);
  const [mode, setMode] = useState<DiscountMode>("stacked");
  const [flat, setFlat] = useState("");
  const [tax, setTax] = useState("");
  const [qty, setQty] = useState("1");

  const ds = discounts.map(num);
  const invalidDiscount = ds.some((d) => Number.isFinite(d) && (d < 0 || d > 100));
  const r = Number.isFinite(num(price))
    ? calculateDiscount({ price: num(price), discounts: ds.filter(Number.isFinite), mode, flatOff: num(flat), taxPercent: num(tax), quantity: num(qty) })
    : null;
  const hasTax = Number.isFinite(num(tax)) && num(tax) > 0;

  return (
    <div className="space-y-4">
      <Panel title="Price and discounts">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField label="Original price" value={price} onChange={setPrice} testId="input" />
          <NumField label="Quantity" value={qty} onChange={setQty} />
          <NumField label="Flat amount off" value={flat} onChange={setFlat} hint="optional, after % discounts" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-fg">Percentage discounts</span>
            <Segmented
              label="How multiple discounts combine"
              value={mode}
              onChange={setMode}
              options={[
                { value: "stacked", label: "Stacked (one after another)" },
                { value: "combined", label: "Added together" },
              ]}
            />
          </div>
          {discounts.map((d, i) => (
            <div key={i} className="flex items-end gap-2">
              <NumField
                className="flex-1"
                label={`Discount ${i + 1}`}
                value={d}
                suffix="%"
                onChange={(s) => setDiscounts((p) => p.map((x, j) => (j === i ? s : x)))}
              />
              {discounts.length > 1 ? (
                <Button variant="ghost" size="icon" aria-label={`Remove discount ${i + 1}`} onClick={() => setDiscounts((p) => p.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          {discounts.length < 6 ? (
            <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDiscounts((p) => [...p, ""])}>
              Add another discount
            </Button>
          ) : null}
          {invalidDiscount ? <p className="text-xs text-danger">Discounts must be between 0 and 100%.</p> : null}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <NumField label="Sales tax / VAT / GST" value={tax} onChange={setTax} suffix="%" hint="applied after discount" />
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label={hasTax ? "Final price (incl. tax)" : "Final price"} value={r ? money(r.total) : "—"} sub={r && r.quantity > 1 ? `${money(r.finalUnit)} each` : undefined} />
        <Stat label="You save" value={r ? money(r.savings) : "—"} />
        <Stat label="Effective discount" value={r ? `${fmt(r.effectiveDiscount, 2)}%` : "—"} />
        <Stat label="Tax" value={r ? money(r.tax) : "—"} />
      </div>

      {r && r.steps.length ? (
        <Panel title="Breakdown (per item)">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-1.5 text-fg-muted">Original price</td>
                <td className="py-1.5 text-right font-mono">{money(r.unitPrice)}</td>
              </tr>
              {r.steps.map((s, i) => (
                <tr key={i}>
                  <td className="py-1.5 text-fg-muted">
                    {s.label} <span className="text-fg-subtle">(−{money(s.amount)})</span>
                  </td>
                  <td className="py-1.5 text-right font-mono">{money(s.priceAfter)}</td>
                </tr>
              ))}
              {hasTax ? (
                <tr>
                  <td className="py-1.5 text-fg-muted">Tax at {num(tax)}%</td>
                  <td className="py-1.5 text-right font-mono">+{money(r.taxUnit)}</td>
                </tr>
              ) : null}
              <tr className="font-medium">
                <td className="py-1.5">Price per item</td>
                <td className="py-1.5 text-right font-mono">{money(r.finalUnit)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      ) : null}

      <ActionBar
        onReset={() => {
          setPrice("");
          setDiscounts([""]);
          setMode("stacked");
          setFlat("");
          setTax("");
          setQty("1");
        }}
      />
    </div>
  );
}
