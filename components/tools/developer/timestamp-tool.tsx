"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Field, Input, Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ActionBar, CopyButton, ErrorMessage, KeyValueTable, Panel } from "@/components/tools/shared";
import { COMMON_TIME_ZONES, UNIT_LABEL, allTimeZones, dateFormats, epochIn, parseDateInput, parseTimestamp, type TsUnit } from "@/lib/processors/developer/timestamp";
import { errorMessage } from "@/lib/utils/hooks";

type Mode = "converter" | "to-date" | "to-timestamp";

function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function ZoneSelect({ value, onChange, label = "Time zone" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const zones = useMemo(() => {
    const all = allTimeZones();
    const common = COMMON_TIME_ZONES.filter((z) => all.includes(z) || z === "UTC");
    return { common, rest: all.filter((z) => !common.includes(z)) };
  }, []);
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <optgroup label="Common">
            {[...new Set([value, ...zones.common])].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </optgroup>
          <optgroup label="All time zones">
            {zones.rest.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </optgroup>
        </Select>
      )}
    </Field>
  );
}

function TimestampToDate({ tz, setTz, initial }: { tz: string; setTz: (z: string) => void; initial: string }) {
  const [input, setInput] = useState(initial);
  const [unit, setUnit] = useState<TsUnit | "auto">("auto");
  const r = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const p = parseTimestamp(input, unit);
      return { ok: true as const, ...p, rows: dateFormats(p.ms, tz) };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  }, [input, unit, tz]);
  return (
    <Panel title="Timestamp → date">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_220px]">
        <Field label="Unix timestamp">
          {(id) => <Input id={id} value={input} onChange={(e) => setInput(e.target.value)} placeholder="1763700000" inputMode="numeric" className="font-mono" data-testid="input" />}
        </Field>
        <Field label="Unit">
          {(id) => (
            <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value as TsUnit | "auto")}>
              <option value="auto">Auto-detect</option>
              {(Object.keys(UNIT_LABEL) as TsUnit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ZoneSelect value={tz} onChange={setTz} />
      </div>
      <div className="mt-4">
        {r && !r.ok ? <ErrorMessage error={r.error} /> : null}
        {r?.ok ? (
          <>
            {unit === "auto" ? <p className="mb-2 text-xs text-fg-subtle">Detected as {UNIT_LABEL[r.unit]}.</p> : null}
            <KeyValueTable rows={r.rows.map((x) => [x.label, x.value])} />
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function DateToTimestamp({ tz, setTz }: { tz: string; setTz: (z: string) => void }) {
  const [input, setInput] = useState("");
  const r = useMemo(() => {
    if (!input.trim()) return null;
    try {
      const ms = parseDateInput(input, tz);
      return { ok: true as const, ms };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
  }, [input, tz]);
  return (
    <Panel title="Date → timestamp">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_220px] sm:items-end">
        <Field label="Date and time" hint="ISO 8601, RFC 2822 or “now”">
          {(id) => <Input id={id} value={input} onChange={(e) => setInput(e.target.value)} placeholder="2026-11-21 14:30:00" className="font-mono" data-testid="input" />}
        </Field>
        <Input
          type="datetime-local"
          step={1}
          aria-label="Pick a date"
          onChange={(e) => e.target.value && setInput(e.target.value.replace("T", " "))}
          className="w-auto"
        />
        <ZoneSelect value={tz} onChange={setTz} label="Interpret in" />
      </div>
      <div className="mt-4">
        {r && !r.ok ? <ErrorMessage error={r.error} /> : null}
        {r?.ok ? (
          <KeyValueTable
            rows={[
              ...(["s", "ms", "us", "ns"] as TsUnit[]).map((u) => [`Unix ${UNIT_LABEL[u]}`, <span key={u} className="flex items-center justify-between gap-2">{epochIn(r.ms, u)} <CopyButton text={epochIn(r.ms, u)} /></span>] as [string, ReactNode]),
              ["ISO 8601 (UTC)", new Date(r.ms).toISOString()],
            ]}
          />
        ) : null}
      </div>
    </Panel>
  );
}

/** Unix Timestamp Converter (both directions + live clock), Timestamp to Date, Date to Timestamp. */
export default function TimestampTool({ tool }: ToolComponentProps) {
  const mode = (tool.processorOptions?.mode as Mode) ?? "converter";
  // Tool UIs mount client-side only (see ToolRunner), so reading the clock here is safe.
  const [tz, setTz] = useState(localZone);
  const [now, setNow] = useState<number | null>(() => Date.now());
  const [key, setKey] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const nowSec = now ? Math.floor(now / 1000) : null;

  return (
    <div className="space-y-4" key={key}>
      {mode !== "to-timestamp" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Current Unix time (seconds)" value={nowSec ?? "…"} />
          <Stat label="Milliseconds" value={now ?? "…"} />
        </div>
      ) : null}
      {mode !== "to-timestamp" ? <TimestampToDate tz={tz} setTz={setTz} initial="" /> : null}
      {mode !== "to-date" ? <DateToTimestamp tz={tz} setTz={setTz} /> : null}
      <ActionBar onReset={() => setKey((k) => k + 1)}>
        {nowSec ? (
          <Button variant="secondary" size="lg" onClick={() => navigator.clipboard?.writeText(String(nowSec))}>
            Copy current timestamp
          </Button>
        ) : null}
      </ActionBar>
    </div>
  );
}
