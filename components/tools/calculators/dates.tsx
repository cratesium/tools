"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/types/tool";
import { Checkbox, Field, Segmented, Textarea } from "@/components/ui/field";
import { Stat } from "@/components/ui/feedback";
import { ActionBar, ErrorMessage, KeyValueTable, Panel } from "@/components/tools/shared";
import {
  addBusinessDays,
  addDays,
  addMonths,
  addYears,
  age,
  businessDaysBetween,
  calendarDiff,
  daysBetween,
  formatDate,
  parseDate,
  todayLocal,
  weekdayName,
  type YMD,
} from "@/lib/processors/calculators/dates";
import { DateField, NumField, fmt, num } from "./common";

const n0 = (n: number) => fmt(n, 0);
const plural = (n: number, w: string) => `${n0(n)} ${w}${Math.abs(n) === 1 ? "" : "s"}`;
const pretty = (d: YMD) => `${weekdayName(d)}, ${formatDate(d)}`;

function parseHolidays(s: string): { list: string[]; bad: string[] } {
  const tokens = s.split(/[\s,;]+/).filter(Boolean);
  const list: string[] = [];
  const bad: string[] = [];
  for (const t of tokens) (parseDate(t) ? list : bad).push(t);
  return { list, bad };
}

/** processorOptions.mode: "age" | "difference" | "add". */
export default function DateTools({ tool }: ToolComponentProps) {
  const mode = tool.processorOptions?.mode;
  if (mode === "age") return <AgeCalc />;
  if (mode === "add") return <DateAdd />;
  return <DateDiff />;
}

function AgeCalc() {
  const [birth, setBirth] = useState("");
  const [on, setOn] = useState(() => todayLocal());
  const b = parseDate(birth);
  const o = parseDate(on);
  const a = b && o ? age(b, o) : null;
  const error = b && o && !a ? "The date of birth is after the 'age on' date." : null;
  return (
    <div className="space-y-4">
      <Panel title="Dates">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField label="Date of birth" value={birth} onChange={setBirth} testId="input" />
          <DateField label="Age on" value={on} onChange={setOn} />
        </div>
      </Panel>
      <ErrorMessage error={error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="Age" value={a ? `${a.years} years` : "—"} sub={a ? `${plural(a.months, "month")}, ${plural(a.days, "day")}` : undefined} />
        <Stat
          label="Next birthday"
          value={a ? (a.daysToNextBirthday === 0 ? "Today!" : plural(a.daysToNextBirthday, "day")) : "—"}
          sub={a ? `${pretty(a.nextBirthday)} · turns ${a.nextAge}` : undefined}
        />
        <Stat label="Total days" value={a ? n0(a.totalDays) : "—"} />
        <Stat label="Born on a" value={a ? a.bornOn : "—"} />
      </div>
      {a ? (
        <Panel title="Age in other units">
          <KeyValueTable
            rows={[
              ["Months", n0(a.totalMonths)],
              ["Weeks", `${n0(a.totalWeeks)} weeks and ${plural(a.totalDays % 7, "day")}`],
              ["Days", n0(a.totalDays)],
              ["Hours (approx.)", n0(a.totalDays * 24)],
              ["Minutes (approx.)", n0(a.totalDays * 1440)],
            ]}
          />
          <p className="mt-3 text-xs text-fg-subtle">People born on 29 February are treated as having their birthday on 28 February in non-leap years.</p>
        </Panel>
      ) : null}
      <ActionBar
        onReset={() => {
          setBirth("");
          setOn(todayLocal());
        }}
      />
    </div>
  );
}

function DateDiff() {
  const [start, setStart] = useState(() => todayLocal());
  const [end, setEnd] = useState("");
  const [inclusive, setInclusive] = useState(false);
  const [holidays, setHolidays] = useState("");
  const a = parseDate(start);
  const b = parseDate(end);
  const hol = parseHolidays(holidays);
  const ok = a && b;
  const total = ok ? daysBetween(a, b) : 0;
  const shown = ok ? total + (inclusive ? Math.sign(total || 1) : 0) : 0;
  const diff = ok ? calendarDiff(a, b) : null;
  const biz = ok ? businessDaysBetween(a, b, inclusive, { holidays: hol.list }) : 0;
  const weekdays = ok ? businessDaysBetween(a, b, inclusive) : 0;
  return (
    <div className="space-y-4">
      <Panel title="Dates">
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField label="Start date" value={start} onChange={setStart} testId="input" />
          <DateField label="End date" value={end} onChange={setEnd} />
        </div>
        <div className="mt-3">
          <Checkbox label="Include the end date (count both days)" checked={inclusive} onChange={setInclusive} />
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="output">
        <Stat label="Total days" value={ok ? n0(shown) : "—"} sub={diff?.negative ? "end is before start" : undefined} />
        <Stat label="Years, months, days" value={diff ? `${diff.years}y ${diff.months}m ${diff.days}d` : "—"} />
        <Stat label="Business days" value={ok ? n0(biz) : "—"} sub="Mon–Fri, minus holidays" />
        <Stat label="Weeks" value={ok ? `${n0(Math.trunc(shown / 7))}w ${Math.abs(shown % 7)}d` : "—"} />
      </div>
      {ok ? (
        <Panel title="Details">
          <KeyValueTable
            rows={[
              ["From", pretty(a)],
              ["To", pretty(b)],
              ["Weekend days", n0(Math.abs(shown) - Math.abs(weekdays))],
              ["Holidays excluded (on weekdays)", n0(Math.abs(weekdays) - Math.abs(biz))],
              ["Hours", n0(shown * 24)],
              ["Months (approx.)", fmt(shown / 30.436875, 2)],
            ]}
          />
        </Panel>
      ) : null}
      <Panel title="Holidays to exclude (optional)">
        <Textarea
          value={holidays}
          onChange={(e) => setHolidays(e.target.value)}
          placeholder="2026-12-25, 2027-01-01 (one per line or comma-separated, yyyy-mm-dd)"
          className="min-h-[80px]"
          aria-label="Holidays"
        />
        {hol.bad.length ? <p className="mt-2 text-xs text-danger">Ignored invalid dates: {hol.bad.join(", ")}</p> : null}
      </Panel>
      <ActionBar
        onReset={() => {
          setStart(todayLocal());
          setEnd("");
          setInclusive(false);
          setHolidays("");
        }}
      />
    </div>
  );
}

type AddUnit = "days" | "weeks" | "months" | "years" | "business";

function DateAdd() {
  const [start, setStart] = useState(() => todayLocal());
  const [op, setOp] = useState<"add" | "subtract">("add");
  const [amounts, setAmounts] = useState({ years: "", months: "", weeks: "", days: "" });
  const [bizDays, setBizDays] = useState("");
  const [unitMode, setUnitMode] = useState<"calendar" | "business">("calendar");
  const s = parseDate(start);
  const sign = op === "add" ? 1 : -1;
  const int = (v: string) => {
    const x = num(v);
    return Number.isFinite(x) ? Math.trunc(x) : 0;
  };
  let result: YMD | null = null;
  if (s) {
    if (unitMode === "calendar") {
      // Larger units first, as most calendars do: years → months → weeks → days.
      let d = addYears(s, sign * int(amounts.years));
      d = addMonths(d, sign * int(amounts.months));
      d = addDays(d, sign * (int(amounts.weeks) * 7 + int(amounts.days)));
      result = d;
    } else {
      result = addBusinessDays(s, sign * int(bizDays));
    }
  }
  const tooBig = [amounts.years, amounts.months, amounts.weeks, amounts.days, bizDays].some((v) => Math.abs(int(v)) > 1_000_000);
  const set = (k: keyof typeof amounts) => (v: string) => setAmounts((p) => ({ ...p, [k]: v }));
  const unitLabel: Record<AddUnit, string> = { days: "Days", weeks: "Weeks", months: "Months", years: "Years", business: "Business days" };
  return (
    <div className="space-y-4">
      <Panel title="Start date and amount">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Start date" value={start} onChange={setStart} testId="input" />
            <Field label="Operation">
              {() => (
                <Segmented
                  label="Operation"
                  value={op}
                  onChange={setOp}
                  options={[
                    { value: "add", label: "Add (+)" },
                    { value: "subtract", label: "Subtract (−)" },
                  ]}
                />
              )}
            </Field>
          </div>
          <Segmented
            label="Unit type"
            value={unitMode}
            onChange={setUnitMode}
            options={[
              { value: "calendar", label: "Calendar units" },
              { value: "business", label: "Business days" },
            ]}
          />
          {unitMode === "calendar" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["years", "months", "weeks", "days"] as const).map((k) => (
                <NumField key={k} label={unitLabel[k]} value={amounts[k]} onChange={set(k)} placeholder="0" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              <NumField label={unitLabel.business} value={bizDays} onChange={setBizDays} placeholder="0" hint="Mon–Fri" />
            </div>
          )}
        </div>
      </Panel>
      <ErrorMessage error={tooBig ? "Amounts above 1,000,000 are not supported." : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="output">
        <Stat label="Result date" value={result && !tooBig ? formatDate(result) : "—"} sub={result && !tooBig ? weekdayName(result) : undefined} />
        <Stat label="Days from start" value={result && s && !tooBig ? n0(daysBetween(s, result)) : "—"} />
        <Stat label="Business days from start" value={result && s && !tooBig ? n0(businessDaysBetween(s, result)) : "—"} />
      </div>
      <p className="text-xs text-fg-subtle">
        Adding months keeps the day of month and clamps to the month&apos;s last day when needed (31 January + 1 month = 28 or 29 February). Business days skip Saturdays and Sundays; the start date itself is not counted.
      </p>
      <ActionBar
        onReset={() => {
          setStart(todayLocal());
          setOp("add");
          setAmounts({ years: "", months: "", weeks: "", days: "" });
          setBizDays("");
          setUnitMode("calendar");
        }}
      />
    </div>
  );
}
