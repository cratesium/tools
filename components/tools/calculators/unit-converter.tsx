"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, CopyButton, Panel } from "@/components/tools/shared";
import { belowAbsoluteZero, convert, formatUnitValue, getUnitCategory, UNIT_CATEGORIES } from "@/lib/processors/calculators/units";
import { cn } from "@/lib/utils/cn";
import { num } from "./common";

/**
 * processorOptions.category locks the converter to one category (length, weight, …);
 * without it (Unit Converter) every category is selectable.
 */
export default function UnitConverter({ tool }: ToolComponentProps) {
  const locked = typeof tool.processorOptions?.category === "string" ? (tool.processorOptions.category as string) : null;
  const firstCat = getUnitCategory(locked ?? "length") ?? UNIT_CATEGORIES[0];
  const [catId, setCatId] = useState(firstCat.id);
  const cat = getUnitCategory(catId) ?? firstCat;
  const [from, setFrom] = useState(firstCat.defaultFrom);
  const [to, setTo] = useState(firstCat.defaultTo);
  const [value, setValue] = useState("1");

  const switchCategory = (id: string) => {
    const c = getUnitCategory(id);
    if (!c) return;
    setCatId(id);
    setFrom(c.defaultFrom);
    setTo(c.defaultTo);
  };

  const v = num(value);
  const result = convert(v, cat.id, from, to);
  const fromU = cat.units.find((u) => u.id === from);
  const toU = cat.units.find((u) => u.id === to);
  const cold = cat.id === "temperature" && Number.isFinite(v) && belowAbsoluteZero(v, from);
  const negativeOk = cat.id === "temperature";
  const negative = !negativeOk && Number.isFinite(v) && v < 0;
  const resultText = Number.isFinite(result) ? formatUnitValue(result) : "—";

  const unitSelect = (label: string, val: string, set: (s: string) => void) => (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={val} onChange={(e) => set(e.target.value)}>
          {cat.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label} ({u.symbol})
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <div className="space-y-4">
      {!locked ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Unit category">
          {UNIT_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === cat.id}
              onClick={() => switchCategory(c.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                c.id === cat.id ? "border-fg bg-fg text-bg" : "border-border bg-card text-fg-muted hover:text-fg",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      <Panel title={`${cat.label} conversion`}>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_1fr]">
          <Field label="Value">
            {(id) => <Input id={id} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" data-testid="input" />}
          </Field>
          {unitSelect("From", from, setFrom)}
          <Button
            variant="secondary"
            size="icon"
            aria-label="Swap units"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          {unitSelect("To", to, setTo)}
        </div>
        {cold ? <p className="mt-2 text-xs text-danger">That temperature is below absolute zero (0 K), which is physically impossible.</p> : null}
        {negative ? <p className="mt-2 text-xs text-warning">Negative {cat.label.toLowerCase()} values are converted mathematically but have no physical meaning here.</p> : null}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div data-testid="output">
          <Stat
            label="Result"
            value={`${resultText} ${toU && Number.isFinite(result) ? toU.symbol : ""}`}
            sub={Number.isFinite(result) && fromU && toU ? `${formatUnitValue(v)} ${fromU.symbol} = ${resultText} ${toU.symbol}` : undefined}
          />
        </div>
        <CopyButton text={Number.isFinite(result) ? String(Number(result.toPrecision(12))) : ""} label="Copy result" size="md" />
      </div>

      {Number.isFinite(v) ? (
        <Panel title={`${formatUnitValue(v)} ${fromU?.symbol ?? ""} in every ${cat.label.toLowerCase()} unit`}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-border">
                {cat.units.map((u) => (
                  <tr key={u.id} className={u.id === to ? "bg-bg-muted" : undefined}>
                    <td className="px-3 py-1.5 text-fg-muted">{u.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-fg">
                      {formatUnitValue(convert(v, cat.id, from, u.id))} <span className="text-fg-subtle">{u.symbol}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <ActionBar
        onReset={() => {
          setValue("1");
          switchCategory(firstCat.id);
        }}
      />
    </div>
  );
}
