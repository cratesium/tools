"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert, Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, Panel } from "@/components/tools/shared";
import { formatOffset, listTimeZones, offsetMinutes, wallTimeIn, zonedToUtc, zoneAbbreviation } from "@/lib/processors/calculators/time";

const DEFAULT_TARGETS = ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"];

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function nowParts(tz: string): { date: string; time: string } {
  const w = wallTimeIn(Date.now(), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${w.year}-${p(w.month)}-${p(w.day)}`, time: `${p(w.hour)}:${p(w.minute)}` };
}

function initialState(zones: string[]) {
  const tz = localZone();
  const source = zones.includes(tz) ? tz : "UTC";
  const n = nowParts(source);
  return { source, date: n.date, time: n.time, targets: DEFAULT_TARGETS.filter((t) => t !== source) };
}

function ZoneSelect({ value, onChange, zones, label }: { value: string; onChange: (v: string) => void; zones: string[]; label: string }) {
  return (
    <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}

export default function TimeZoneConverter() {
  const zones = useMemo(() => listTimeZones(), []);
  // ToolRunner mounts tools only in the browser, so local zone and current time are safe initial values.
  const [init] = useState(() => initialState(zones));
  const [source, setSource] = useState(init.source);
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [targets, setTargets] = useState<string[]>(init.targets);

  const initialise = () => {
    const s = initialState(zones);
    setSource(s.source);
    setDate(s.date);
    setTime(s.time);
    setTargets(s.targets);
  };

  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  const conv =
    dm && tm
      ? zonedToUtc({ year: +dm[1], month: +dm[2], day: +dm[3], hour: +tm[1], minute: +tm[2], second: tm[3] ? +tm[3] : 0 }, source)
      : null;
  const utc = conv?.utc;

  const fmt = (ms: number, tz: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

  const dayShift = (tz: string) => {
    if (utc == null || !dm) return 0;
    const w = wallTimeIn(utc, tz);
    return Math.round((Date.UTC(w.year, w.month - 1, w.day) - Date.UTC(+dm[1], +dm[2] - 1, +dm[3])) / 86400000);
  };

  return (
    <div className="space-y-4">
      <Panel title="Source time">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="font-mono" data-testid="input" />}</Field>
          <Field label="Time">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="font-mono" />}</Field>
          <Field label="Time zone">{() => <ZoneSelect label="Source time zone" value={source} onChange={setSource} zones={zones} />}</Field>
        </div>
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const n = nowParts(source);
              setDate(n.date);
              setTime(n.time);
            }}
          >
            Use current time
          </Button>
        </div>
      </Panel>

      {conv?.adjusted ? (
        <Alert tone="warning" title="This local time does not exist">
          Clocks in {source} skip this time because of a daylight-saving change. It has been moved forward to the next valid time.
        </Alert>
      ) : null}

      {utc != null ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Source" value={fmt(utc, source).replace(",", "")} sub={`${zoneAbbreviation(utc, source)} · ${formatOffset(offsetMinutes(utc, source))}`} />
          <Stat label="UTC" value={new Date(utc).toISOString().slice(0, 16).replace("T", " ")} />
          <Stat label="Unix timestamp" value={Math.floor(utc / 1000)} />
        </div>
      ) : null}

      <Panel title="Converted times">
        <ul className="divide-y divide-border" data-testid="output">
          {targets.map((tz, i) => {
            const shift = dayShift(tz);
            return (
              <li key={`${tz}-${i}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="w-full sm:w-64">
                  <ZoneSelect label={`Target time zone ${i + 1}`} value={tz} onChange={(v) => setTargets((p) => p.map((x, j) => (j === i ? v : x)))} zones={zones} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-base font-semibold text-fg">{utc != null ? fmt(utc, tz) : "—"}</div>
                  {utc != null ? (
                    <div className="text-xs text-fg-muted">
                      {zoneAbbreviation(utc, tz)} · {formatOffset(offsetMinutes(utc, tz))}
                      {shift ? ` · ${shift > 0 ? "next day" : "previous day"}` : ""}
                    </div>
                  ) : null}
                </div>
                <Button variant="ghost" size="icon" aria-label={`Remove ${tz}`} onClick={() => setTargets((p) => p.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
        <Button variant="secondary" size="sm" className="mt-3" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setTargets((p) => [...p, "UTC"])}>
          Add time zone
        </Button>
      </Panel>
      <p className="text-xs text-fg-subtle">
        Conversions use your browser&apos;s IANA time-zone database ({zones.length} zones), so daylight-saving rules are applied for the chosen date. Ambiguous times during a fall-back change use the first occurrence.
      </p>
      <ActionBar onReset={initialise} />
    </div>
  );
}
