"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, Input, Segmented, Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, Panel } from "@/components/tools/shared";
import { addToClock, clockDifference, formatDhms, formatHms, parseClock, parseDuration, sumDurations } from "@/lib/processors/calculators/time";
import { fmt } from "./common";

type Row = { sign: 1 | -1; value: string };
const initialRows: Row[] = [
  { sign: 1, value: "" },
  { sign: 1, value: "" },
];

export default function TimeCalculator() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [bare, setBare] = useState<"minutes" | "hours" | "seconds">("minutes");
  const [clockStart, setClockStart] = useState("");
  const [clockEnd, setClockEnd] = useState("");
  const [clockBase, setClockBase] = useState("");
  const [clockAdd, setClockAdd] = useState("");

  const total = sumDurations(rows, bare);
  const invalid = rows.map((r) => r.value.trim() !== "" && !Number.isFinite(parseDuration(r.value, bare)));
  const anyValue = rows.some((r) => r.value.trim());

  const cs = parseClock(clockStart);
  const ce = parseClock(clockEnd);
  const elapsed = Number.isFinite(cs) && Number.isFinite(ce) ? clockDifference(cs, ce) : NaN;
  const cb = parseClock(clockBase);
  const ca = parseDuration(clockAdd, bare);
  const added = Number.isFinite(cb) && Number.isFinite(ca) ? addToClock(cb, ca) : null;

  return (
    <div className="space-y-4">
      <Panel
        title="Add and subtract durations"
        actions={
          <Segmented
            label="Plain numbers mean"
            value={bare}
            onChange={setBare}
            options={[
              { value: "seconds", label: "sec" },
              { value: "minutes", label: "min" },
              { value: "hours", label: "hr" },
            ]}
          />
        }
      >
        <p className="mb-3 text-xs text-fg-subtle">Formats: 1:30 (h:mm), 01:30:15, 2h 15m 10s, 1.5h, 1d 02:00:00, or a plain number in {bare}.</p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                aria-label={`Operation for row ${i + 1}`}
                value={r.sign === 1 ? "+" : "-"}
                onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, sign: e.target.value === "+" ? 1 : -1 } : x)))}
                className="w-16 font-mono"
                disabled={i === 0}
              >
                <option value="+">+</option>
                <option value="-">−</option>
              </Select>
              <Input
                aria-label={`Duration ${i + 1}`}
                value={r.value}
                placeholder="hh:mm:ss"
                data-testid={i === 0 ? "input" : undefined}
                aria-invalid={invalid[i] || undefined}
                onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                className={invalid[i] ? "border-danger font-mono" : "font-mono"}
              />
              {rows.length > 1 ? (
                <Button variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRows((p) => [...p, { sign: 1, value: "" }])}>
            Add row
          </Button>
          <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRows((p) => [...p, { sign: -1, value: "" }])}>
            Subtract row
          </Button>
        </div>
        {invalid.some(Boolean) ? <p className="mt-2 text-xs text-danger">Highlighted entries could not be read. Minutes and seconds must be below 60 in colon formats.</p> : null}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="Total (HH:MM:SS)" value={anyValue && Number.isFinite(total) ? formatHms(total) : "—"} />
        <Stat label="Days + time" value={anyValue && Number.isFinite(total) ? formatDhms(total) : "—"} />
        <Stat label="Decimal hours" value={anyValue && Number.isFinite(total) ? fmt(total / 3600, 4) : "—"} />
        <Stat label="Total minutes / seconds" value={anyValue && Number.isFinite(total) ? fmt(total / 60, 2) : "—"} sub={anyValue && Number.isFinite(total) ? `${fmt(total, 3)} s` : undefined} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Time between two clock times">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">{(id) => <Input id={id} value={clockStart} onChange={(e) => setClockStart(e.target.value)} placeholder="09:15 or 9:15 am" className="font-mono" />}</Field>
            <Field label="End">{(id) => <Input id={id} value={clockEnd} onChange={(e) => setClockEnd(e.target.value)} placeholder="17:45" className="font-mono" />}</Field>
          </div>
          <p className="mt-3 text-sm">
            Elapsed: <span className="font-mono font-semibold">{Number.isFinite(elapsed) ? formatHms(elapsed) : "—"}</span>
            {Number.isFinite(elapsed) ? <span className="text-fg-muted"> ({fmt(elapsed / 3600, 4)} h)</span> : null}
          </p>
          {Number.isFinite(elapsed) && ce < cs ? <p className="mt-1 text-xs text-fg-subtle">End is earlier than start, so it is treated as the next day.</p> : null}
        </Panel>
        <Panel title="Clock time plus duration">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Time">{(id) => <Input id={id} value={clockBase} onChange={(e) => setClockBase(e.target.value)} placeholder="22:30" className="font-mono" />}</Field>
            <Field label="± Duration">{(id) => <Input id={id} value={clockAdd} onChange={(e) => setClockAdd(e.target.value)} placeholder="3:45 or -1:15" className="font-mono" />}</Field>
          </div>
          <p className="mt-3 text-sm">
            Result: <span className="font-mono font-semibold">{added ? formatHms(added.time) : "—"}</span>
            {added && added.dayOffset ? (
              <span className="text-fg-muted">
                {" "}
                ({added.dayOffset > 0 ? "+" : ""}
                {added.dayOffset} day{Math.abs(added.dayOffset) === 1 ? "" : "s"})
              </span>
            ) : null}
          </p>
        </Panel>
      </div>

      <ActionBar
        onReset={() => {
          setRows(initialRows);
          setBare("minutes");
          setClockStart("");
          setClockEnd("");
          setClockBase("");
          setClockAdd("");
        }}
      />
    </div>
  );
}
