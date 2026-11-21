"use client";

import { useState } from "react";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, Panel } from "@/components/tools/shared";
import { changeDetails, percentDifference } from "@/lib/processors/calculators/percent";
import { NumField, fmt, num } from "./common";

export default function PercentageChangeCalculator() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const a = num(from);
  const b = num(to);
  const valid = Number.isFinite(a) && Number.isFinite(b);
  const c = changeDetails(a, b);
  const sign = (n: number) => (n > 0 ? "+" : "");
  const zeroBase = valid && a === 0;

  return (
    <div className="space-y-4">
      <Panel title="Values">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Old value (from)" value={from} onChange={setFrom} testId="input" />
          <NumField label="New value (to)" value={to} onChange={setTo} />
        </div>
        {zeroBase ? <p className="mt-3 text-sm text-warning">Percentage change from 0 is undefined: any increase from zero is infinite in relative terms.</p> : null}
      </Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="Percentage change" value={valid && Number.isFinite(c.change) ? `${sign(c.change)}${fmt(c.change, 4)}%` : "—"} sub={valid && !zeroBase ? c.direction : undefined} />
        <Stat label="Absolute change" value={valid ? `${sign(c.absolute)}${fmt(c.absolute, 6)}` : "—"} />
        <Stat label="Multiplier" value={valid && Number.isFinite(c.multiplier) ? `×${fmt(c.multiplier, 6)}` : "—"} />
        <Stat label="Change to reverse" value={valid && Number.isFinite(c.reverse) ? `${sign(c.reverse)}${fmt(c.reverse, 4)}%` : "—"} sub="from new back to old" />
      </div>
      <Panel title="Related measures">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-fg-muted">Percent difference (relative to the mean)</dt>
          <dd className="text-right font-mono">{valid ? `${fmt(percentDifference(a, b), 4)}%` : "—"}</dd>
          <dt className="text-fg-muted">New value as % of old</dt>
          <dd className="text-right font-mono">{valid && a !== 0 ? `${fmt((b / a) * 100, 4)}%` : "—"}</dd>
        </dl>
        <p className="mt-3 text-xs text-fg-subtle">
          Percentage change = (new − old) ÷ |old| × 100. A 50% fall needs a 100% rise to recover, which is why the reverse change differs.
        </p>
      </Panel>
      <ActionBar
        onReset={() => {
          setFrom("");
          setTo("");
        }}
      />
    </div>
  );
}
