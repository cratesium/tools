"use client";

import { useState } from "react";
import { ActionBar, Panel } from "@/components/tools/shared";
import { applyPercent, percentChange, percentOf, whatPercent, wholeFromPart } from "@/lib/processors/calculators/percent";
import { NumField, ResultLine, fmt, num } from "./common";

const initial = { a1: "", b1: "", a2: "", b2: "", a3: "", b3: "", a4: "", b4: "", a5: "", b5: "" };

export default function PercentageCalculator() {
  const [v, setV] = useState(initial);
  const set = (k: keyof typeof initial) => (s: string) => setV((p) => ({ ...p, [k]: s }));
  const pct = (n: number) => (Number.isFinite(n) ? `${fmt(n, 4)}%` : "—");

  return (
    <div className="space-y-4">
      <Panel title="What is X% of Y?">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Percentage (X)" value={v.a1} onChange={set("a1")} suffix="%" testId="input" />
          <NumField label="Of value (Y)" value={v.b1} onChange={set("b1")} />
        </div>
        <div className="mt-3">
          <ResultLine value={fmt(percentOf(num(v.a1), num(v.b1)), 6)} testId="output">
            {v.a1 || "X"}% of {v.b1 || "Y"} is
          </ResultLine>
        </div>
      </Panel>
      <Panel title="X is what percent of Y?">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Value (X)" value={v.a2} onChange={set("a2")} />
          <NumField label="Total (Y)" value={v.b2} onChange={set("b2")} />
        </div>
        <div className="mt-3">
          <ResultLine value={pct(whatPercent(num(v.a2), num(v.b2)))}>
            {v.a2 || "X"} is this share of {v.b2 || "Y"}
          </ResultLine>
        </div>
      </Panel>
      <Panel title="Percentage change from X to Y">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="From (X)" value={v.a3} onChange={set("a3")} />
          <NumField label="To (Y)" value={v.b3} onChange={set("b3")} />
        </div>
        <div className="mt-3">
          {(() => {
            const c = percentChange(num(v.a3), num(v.b3));
            return <ResultLine value={Number.isFinite(c) ? `${c > 0 ? "+" : ""}${fmt(c, 4)}%` : "—"}>{Number.isFinite(c) ? (c >= 0 ? "Increase" : "Decrease") : "Change"}</ResultLine>;
          })()}
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Increase or decrease Y by X%">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField label="Value (Y)" value={v.a4} onChange={set("a4")} />
            <NumField label="Change (X)" value={v.b4} onChange={set("b4")} suffix="%" hint="negative = decrease" />
          </div>
          <div className="mt-3">
            <ResultLine value={fmt(applyPercent(num(v.a4), num(v.b4)), 6)}>Result</ResultLine>
          </div>
        </Panel>
        <Panel title="X is P% of what?">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField label="Part (X)" value={v.a5} onChange={set("a5")} />
            <NumField label="Percent (P)" value={v.b5} onChange={set("b5")} suffix="%" />
          </div>
          <div className="mt-3">
            <ResultLine value={fmt(wholeFromPart(num(v.a5), num(v.b5)), 6)}>Whole</ResultLine>
          </div>
        </Panel>
      </div>
      <ActionBar onReset={() => setV(initial)} />
    </div>
  );
}
