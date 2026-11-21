import { describe, expect, it } from "vitest";
import { addBusinessDays, addDays, addMonths, addYears, age, businessDaysBetween, calendarDiff, daysBetween, formatDate, parseDate, weekdayName, type YMD } from "@/lib/processors/calculators/dates";
import { addToClock, clockDifference, formatDhms, formatHms, offsetMinutes, parseClock, parseDuration, sumDurations, wallTimeIn, zonedToUtc, formatOffset } from "@/lib/processors/calculators/time";
import { belowAbsoluteZero, convert, formatUnitValue, UNIT_CATEGORIES } from "@/lib/processors/calculators/units";
import { asianCategory, bmi, bmrMifflin, calorieNeeds, healthyWeightRange, imperialToMetric, whoCategory } from "@/lib/processors/calculators/health";

const d = (s: string) => parseDate(s) as YMD;

describe("dates", () => {
  it("parses and validates", () => {
    expect(parseDate("2024-02-29")).toEqual({ y: 2024, m: 2, d: 29 });
    expect(parseDate("2025-02-29")).toBeNull();
    expect(parseDate("2025-13-01")).toBeNull();
    expect(parseDate("nope")).toBeNull();
  });
  it("adds months with month-end clamping", () => {
    expect(formatDate(addMonths(d("2025-01-31"), 1))).toBe("2025-02-28");
    expect(formatDate(addMonths(d("2024-01-31"), 1))).toBe("2024-02-29");
    expect(formatDate(addMonths(d("2025-03-31"), -1))).toBe("2025-02-28");
    expect(formatDate(addMonths(d("2025-11-15"), 3))).toBe("2026-02-15");
    expect(formatDate(addYears(d("2024-02-29"), 1))).toBe("2025-02-28");
    expect(formatDate(addDays(d("2025-12-31"), 1))).toBe("2026-01-01");
    expect(formatDate(addDays(d("2025-03-01"), -1))).toBe("2025-02-28");
  });
  it("computes calendar differences", () => {
    expect(calendarDiff(d("2020-01-15"), d("2025-03-10"))).toEqual({ years: 5, months: 1, days: 23, negative: false });
    expect(calendarDiff(d("2025-01-31"), d("2025-03-01"))).toEqual({ years: 0, months: 1, days: 1, negative: false });
    expect(calendarDiff(d("2025-03-10"), d("2020-01-15")).negative).toBe(true);
    expect(daysBetween(d("2024-01-01"), d("2025-01-01"))).toBe(366);
    expect(daysBetween(d("2025-03-29"), d("2025-03-31"))).toBe(2); // across EU DST change
  });
  it("counts business days", () => {
    // Mon 2026-11-02 → Mon 2026-11-09: 5 working days (end excluded)
    expect(businessDaysBetween(d("2026-11-02"), d("2026-11-09"))).toBe(5);
    expect(businessDaysBetween(d("2026-11-02"), d("2026-11-09"), true)).toBe(6);
    expect(businessDaysBetween(d("2026-11-07"), d("2026-11-09"))).toBe(0); // Sat → Mon
    expect(businessDaysBetween(d("2026-11-01"), d("2026-11-30"), true)).toBe(21);
    expect(businessDaysBetween(d("2026-11-01"), d("2026-11-30"), true, { holidays: ["2026-11-26", "2026-11-28"] })).toBe(20);
    expect(businessDaysBetween(d("2026-11-09"), d("2026-11-02"))).toBe(-5);
    expect(businessDaysBetween(d("2026-11-02"), d("2026-11-09"), false, { weekend: [5, 6] })).toBe(5);
  });
  it("adds business days", () => {
    expect(formatDate(addBusinessDays(d("2026-11-20"), 1))).toBe("2026-11-23"); // Fri + 1 → Mon
    expect(formatDate(addBusinessDays(d("2026-11-23"), -1))).toBe("2026-11-20");
    expect(formatDate(addBusinessDays(d("2026-11-02"), 10))).toBe("2026-11-16");
    expect(formatDate(addBusinessDays(d("2026-11-20"), 1, { holidays: ["2026-11-23"] }))).toBe("2026-11-24");
  });
  it("computes age and next birthday", () => {
    const a = age(d("1990-05-15"), d("2026-11-21"))!;
    expect([a.years, a.months, a.days]).toEqual([36, 6, 6]);
    expect(formatDate(a.nextBirthday)).toBe("2027-05-15");
    expect(a.daysToNextBirthday).toBe(175);
    expect(a.nextAge).toBe(37);
    expect(a.totalDays).toBe(daysBetween(d("1990-05-15"), d("2026-11-21")));
    expect(weekdayName(d("1990-05-15"))).toBe("Tuesday");
    const leap = age(d("2000-02-29"), d("2025-01-10"))!;
    expect(formatDate(leap.nextBirthday)).toBe("2025-02-28");
    const today = age(d("2000-11-21"), d("2026-11-21"))!;
    expect(today.daysToNextBirthday).toBe(0);
    expect(today.years).toBe(26);
    expect(age(d("2030-01-01"), d("2026-01-01"))).toBeNull();
  });
});

describe("durations and clocks", () => {
  it("parses many duration formats", () => {
    expect(parseDuration("1:30")).toBe(5400);
    expect(parseDuration("1:30:15")).toBe(5415);
    expect(parseDuration("-0:45")).toBe(-2700);
    expect(parseDuration("90")).toBe(5400);
    expect(parseDuration("90", "seconds")).toBe(90);
    expect(parseDuration("2h 15m 10s")).toBe(8110);
    expect(parseDuration("1.5h")).toBe(5400);
    expect(parseDuration("1d 02:00:00")).toBe(93600);
    expect(parseDuration("1:75")).toBeNaN();
    expect(parseDuration("abc")).toBeNaN();
    expect(parseDuration("2h banana")).toBeNaN();
  });
  it("formats and sums", () => {
    expect(formatHms(93784)).toBe("26:03:04");
    expect(formatDhms(93784)).toBe("1d 02:03:04");
    expect(formatHms(-61)).toBe("-00:01:01");
    expect(sumDurations([{ sign: 1, value: "1:45:30" }, { sign: 1, value: "2:30:45" }, { sign: -1, value: "0:16:15" }])).toBe(4 * 3600);
    expect(sumDurations([{ sign: 1, value: "x" }])).toBeNaN();
  });
  it("handles clock times across midnight", () => {
    expect(parseClock("09:30")).toBe(34200);
    expect(parseClock("9:30 pm")).toBe(77400);
    expect(parseClock("12:00 am")).toBe(0);
    expect(parseClock("25:00")).toBeNaN();
    expect(clockDifference(parseClock("22:00"), parseClock("06:30"))).toBe(8.5 * 3600);
    expect(addToClock(parseClock("23:00"), 7200)).toEqual({ time: 3600, dayOffset: 1 });
  });
});

describe("time zones (Intl, DST-aware)", () => {
  it("knows offsets including DST", () => {
    expect(offsetMinutes(Date.UTC(2026, 0, 15, 12), "America/New_York")).toBe(-300);
    expect(offsetMinutes(Date.UTC(2026, 6, 15, 12), "America/New_York")).toBe(-240);
    expect(offsetMinutes(Date.UTC(2026, 6, 15, 12), "Asia/Kolkata")).toBe(330);
    expect(offsetMinutes(Date.UTC(2026, 6, 15, 12), "Asia/Kathmandu")).toBe(345);
    expect(formatOffset(330)).toBe("UTC+05:30");
    expect(formatOffset(-240)).toBe("UTC-04:00");
  });
  it("converts wall time in a zone to UTC", () => {
    expect(zonedToUtc({ year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0 }, "America/New_York").utc).toBe(Date.UTC(2026, 6, 1, 16));
    expect(zonedToUtc({ year: 2026, month: 1, day: 15, hour: 12, minute: 0, second: 0 }, "America/New_York").utc).toBe(Date.UTC(2026, 0, 15, 17));
    expect(zonedToUtc({ year: 2026, month: 11, day: 21, hour: 9, minute: 0, second: 0 }, "Asia/Kolkata").utc).toBe(Date.UTC(2026, 10, 21, 3, 30));
    const w = wallTimeIn(Date.UTC(2026, 10, 21, 3, 30), "Europe/London");
    expect([w.hour, w.minute]).toEqual([3, 30]);
  });
  it("handles DST gaps and overlaps", () => {
    // 2026-03-08 02:30 does not exist in New York (clocks jump 02:00 → 03:00)
    const gap = zonedToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, "America/New_York");
    expect(gap.adjusted).toBe(true);
    // 2026-11-01 01:30 happens twice; we return the earlier (EDT, UTC−4)
    const overlap = zonedToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, "America/New_York");
    expect(overlap.utc).toBe(Date.UTC(2026, 10, 1, 5, 30));
    expect(overlap.adjusted).toBe(false);
  });
});

describe("unit conversion", () => {
  it("uses exact length and weight factors", () => {
    expect(convert(1, "length", "in", "cm")).toBeCloseTo(2.54, 12);
    expect(convert(1, "length", "mi", "km")).toBeCloseTo(1.609344, 12);
    expect(convert(1, "length", "ft", "in")).toBeCloseTo(12, 12);
    expect(convert(1, "length", "nmi", "m")).toBe(1852);
    expect(convert(1, "weight", "lb", "kg")).toBeCloseTo(0.45359237, 12);
    expect(convert(1, "weight", "lb", "oz")).toBeCloseTo(16, 12);
    expect(convert(1, "weight", "st", "lb")).toBeCloseTo(14, 12);
    expect(convert(1, "weight", "kg", "lb")).toBeCloseTo(2.2046226218, 9);
  });
  it("converts temperature (affine)", () => {
    expect(convert(100, "temperature", "C", "F")).toBeCloseTo(212, 10);
    expect(convert(-40, "temperature", "F", "C")).toBeCloseTo(-40, 10);
    expect(convert(0, "temperature", "K", "C")).toBeCloseTo(-273.15, 10);
    expect(convert(491.67, "temperature", "R", "C")).toBeCloseTo(0, 10);
    expect(convert(0, "temperature", "C", "R")).toBeCloseTo(491.67, 10);
    expect(belowAbsoluteZero(-300, "C")).toBe(true);
    expect(belowAbsoluteZero(-459.67, "F")).toBe(false);
  });
  it("converts area, volume and speed", () => {
    expect(convert(1, "area", "acre", "ft2")).toBeCloseTo(43560, 6);
    expect(convert(1, "area", "ha", "acre")).toBeCloseTo(2.4710538147, 9);
    expect(convert(1, "area", "mi2", "acre")).toBeCloseTo(640, 8);
    expect(convert(1, "volume", "usgal", "l")).toBeCloseTo(3.785411784, 12);
    expect(convert(1, "volume", "usgal", "in3")).toBeCloseTo(231, 9);
    expect(convert(1, "volume", "usgal", "usfloz")).toBeCloseTo(128, 9);
    expect(convert(1, "volume", "impgal", "l")).toBeCloseTo(4.54609, 12);
    expect(convert(1, "volume", "tbsp", "tsp")).toBeCloseTo(3, 12);
    expect(convert(100, "speed", "kmh", "mps")).toBeCloseTo(27.7777777778, 9);
    expect(convert(60, "speed", "mph", "kmh")).toBeCloseTo(96.56064, 9);
    expect(convert(1, "speed", "kn", "kmh")).toBeCloseTo(1.852, 12);
  });
  it("converts other categories", () => {
    expect(convert(1, "data", "GiB", "MB")).toBeCloseTo(1073.741824, 9);
    expect(convert(1, "pressure", "atm", "psi")).toBeCloseTo(14.6959488, 6);
    expect(convert(1, "pressure", "bar", "kPa")).toBe(100);
    expect(convert(1, "energy", "kWh", "MJ")).toBeCloseTo(3.6, 12);
    expect(convert(1, "energy", "kcal", "kJ")).toBeCloseTo(4.184, 12);
    expect(convert(1, "power", "hp", "W")).toBeCloseTo(745.69987158, 6);
    expect(convert(180, "angle", "deg", "rad")).toBeCloseTo(Math.PI, 12);
    expect(convert(1, "time", "d", "h")).toBe(24);
    expect(convert(1, "length", "m", "bogus")).toBeNaN();
  });
  it("has unique unit ids and round-trips every unit", () => {
    for (const c of UNIT_CATEGORIES) {
      const ids = c.units.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(c.defaultFrom);
      expect(ids).toContain(c.defaultTo);
      for (const x of c.units) {
        expect(convert(convert(42, c.id, x.id, c.base), c.id, c.base, x.id)).toBeCloseTo(42, 9);
      }
    }
  });
  it("formats values", () => {
    expect(formatUnitValue(1234.5678)).toBe("1,234.5678");
    expect(formatUnitValue(0.1 + 0.2)).toBe("0.3");
    expect(formatUnitValue(1e-9)).toBe("1e-9");
    expect(formatUnitValue(NaN)).toBe("—");
  });
});

describe("BMI and calories", () => {
  it("computes BMI and categories", () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3);
    expect(whoCategory(22.9)!.label).toBe("Normal weight");
    expect(whoCategory(18.49)!.label).toContain("Underweight");
    expect(whoCategory(25)!.label).toContain("Overweight");
    expect(whoCategory(30)!.label).toBe("Obesity class I");
    expect(whoCategory(42)!.label).toBe("Obesity class III");
    expect(asianCategory(23.5)!.label).toContain("Overweight");
    expect(asianCategory(26)!.label).toContain("Obese");
    expect(bmi(0, 170)).toBeNaN();
  });
  it("converts imperial and gives a healthy range", () => {
    const m = imperialToMetric(5, 9, 154);
    expect(m.heightCm).toBeCloseTo(175.26, 2);
    expect(m.weightKg).toBeCloseTo(69.853, 3);
    const [lo, hi] = healthyWeightRange(180);
    expect(lo).toBeCloseTo(59.94, 2);
    expect(hi).toBeCloseTo(80.676, 2);
  });
  it("uses Mifflin-St Jeor", () => {
    expect(bmrMifflin("male", 80, 180, 30)).toBe(1780);
    expect(bmrMifflin("female", 60, 165, 25)).toBeCloseTo(1345.25);
    const c = calorieNeeds("female", 60, 165, 25, 1.55);
    expect(c.tdee).toBeCloseTo(2085.1375);
    const lose1 = c.goals.find((g) => g.id === "lose1")!;
    expect(lose1.kcal).toBeCloseTo(1085.1375);
    expect(lose1.belowMinimum).toBe(true);
    expect(c.goals.find((g) => g.id === "maintain")!.belowMinimum).toBe(false);
  });
});
