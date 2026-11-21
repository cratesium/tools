import { describe, expect, it } from "vitest";
import { dateFormats, detectUnit, epochIn, isoInZone, isoWeek, parseDateInput, parseTimestamp, relativeTime, rfc2822, tzOffsetMinutes, zonedToEpoch, dayOfYear, isValidTimeZone } from "@/lib/processors/developer/timestamp";

describe("timestamps", () => {
  it("detects units by magnitude", () => {
    expect(detectUnit(1763683200)).toBe("s");
    expect(detectUnit(1763683200000)).toBe("ms");
    expect(detectUnit(1763683200000000)).toBe("us");
    expect(detectUnit(1763683200000000000)).toBe("ns");
    expect(detectUnit(-1000)).toBe("s");
  });
  it("parses timestamps in any unit", () => {
    expect(parseTimestamp("1763683200").ms).toBe(1763683200000);
    expect(parseTimestamp("1,763,683,200,000")).toEqual({ ms: 1763683200000, unit: "ms" });
    expect(parseTimestamp("1763683200.5").ms).toBe(1763683200500);
    expect(parseTimestamp("1763683200", "ms").ms).toBe(1763683200);
    expect(parseTimestamp("1763683200123456").ms).toBeCloseTo(1763683200123.456);
    expect(() => parseTimestamp("abc")).toThrow();
    expect(() => parseTimestamp("1e30", "s")).toThrow();
  });
  it("formats in time zones", () => {
    const ms = Date.UTC(2026, 10, 21, 5, 0, 0); // 2026-11-21T05:00:00Z
    expect(isoInZone(ms, "UTC")).toBe("2026-11-21T05:00:00.000Z");
    expect(isoInZone(ms, "Asia/Kolkata")).toBe("2026-11-21T10:30:00.000+05:30");
    expect(isoInZone(ms, "America/New_York", false)).toBe("2026-11-21T00:00:00-05:00");
    expect(isoInZone(ms, "Asia/Kathmandu")).toBe("2026-11-21T10:45:00.000+05:45");
    expect(rfc2822(ms, "UTC")).toBe("Sat, 21 Nov 2026 05:00:00 +0000");
    expect(rfc2822(ms, "America/Los_Angeles")).toBe("Fri, 20 Nov 2026 21:00:00 -0800");
    expect(tzOffsetMinutes(Date.UTC(2026, 6, 1), "America/New_York")).toBe(-240);
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 1), "America/New_York")).toBe(-300);
  });
  it("converts wall-clock time in a zone to epoch, across DST", () => {
    expect(zonedToEpoch(2026, 11, 21, 10, 30, 0, 0, "Asia/Kolkata")).toBe(Date.UTC(2026, 10, 21, 5, 0, 0));
    expect(zonedToEpoch(2026, 7, 1, 12, 0, 0, 0, "Europe/London")).toBe(Date.UTC(2026, 6, 1, 11, 0, 0));
    // US spring-forward gap: 2026-03-08 02:30 does not exist in New York → resolves to 03:30 EDT (07:30Z)
    expect(zonedToEpoch(2026, 3, 8, 2, 30, 0, 0, "America/New_York")).toBe(Date.UTC(2026, 2, 8, 7, 30));
    // Fall-back ambiguity: 2026-11-01 01:30 occurs twice → earlier (EDT, 05:30Z)
    expect(zonedToEpoch(2026, 11, 1, 1, 30, 0, 0, "America/New_York")).toBe(Date.UTC(2026, 10, 1, 5, 30));
  });
  it("parses date inputs", () => {
    expect(parseDateInput("2026-11-21 10:30", "Asia/Kolkata")).toBe(Date.UTC(2026, 10, 21, 5, 0));
    expect(parseDateInput("2026-11-21T05:00:00Z", "Asia/Tokyo")).toBe(Date.UTC(2026, 10, 21, 5, 0));
    expect(parseDateInput("2026-11-21", "UTC")).toBe(Date.UTC(2026, 10, 21));
    expect(parseDateInput("Sat, 21 Nov 2026 05:00:00 +0000", "UTC")).toBe(Date.UTC(2026, 10, 21, 5));
    expect(parseDateInput("2026-11-21 10:30:15.250", "UTC")).toBe(Date.UTC(2026, 10, 21, 10, 30, 15, 250));
    expect(() => parseDateInput("2026-02-30", "UTC")).toThrow(/does not exist/);
    expect(() => parseDateInput("2026-13-01", "UTC")).toThrow();
    expect(() => parseDateInput("garbage", "UTC")).toThrow();
  });
  it("computes ISO week, day of year, relative time and epoch strings", () => {
    expect(isoWeek(2026, 1, 1)).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(2021, 1, 3)).toEqual({ year: 2020, week: 53 });
    expect(dayOfYear(2024, 12, 31)).toBe(366);
    expect(relativeTime(0, 3 * 86400000)).toBe("3 days ago");
    expect(relativeTime(2 * 3600000, 0)).toBe("in 2 hours");
    expect(epochIn(1763683200123, "s")).toBe("1763683200");
    expect(epochIn(1763683200123, "ns")).toBe("1763683200123000000");
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
  it("lists many formats", () => {
    const rows = dateFormats(Date.UTC(2026, 10, 21, 5), "UTC", Date.UTC(2026, 10, 21, 5));
    const get = (l: string) => rows.find((r) => r.label === l)!.value;
    expect(get("ISO 8601 (UTC)")).toBe("2026-11-21T05:00:00.000Z");
    expect(get("Unix seconds")).toBe("1795237200");
    expect(get("ISO week")).toBe("2026-W47-6");
    expect(get("Relative")).toBe("now");
  });
});
