import { describe, expect, it } from "vitest";
import { VANCOUVER_TZ, isWeekend, localDayIndex, localHourMinute, minutesSinceMidnight } from "./local-time";

// 2024-01-06 was a Saturday; Vancouver is PST (UTC-8) in January, PDT (UTC-7) in July.

describe("localHourMinute", () => {
  it("converts UTC to Vancouver wall clock in winter (PST, UTC-8)", () => {
    expect(localHourMinute(new Date("2024-01-06T20:00:00Z"), VANCOUVER_TZ)).toEqual({ hour: 12, minute: 0 });
  });

  it("converts UTC to Vancouver wall clock in summer (PDT, UTC-7)", () => {
    expect(localHourMinute(new Date("2024-07-06T20:30:00Z"), VANCOUVER_TZ)).toEqual({ hour: 13, minute: 30 });
  });

  it("wraps midnight to hour 0, not 24", () => {
    expect(localHourMinute(new Date("2024-01-06T08:00:00Z"), VANCOUVER_TZ)).toEqual({ hour: 0, minute: 0 });
  });
});

describe("localDayIndex", () => {
  it("returns the local weekday, not the UTC one, across the midnight boundary", () => {
    // 07:59 UTC Sunday is still 23:59 Saturday in Vancouver.
    expect(localDayIndex(new Date("2024-01-07T07:59:00Z"), VANCOUVER_TZ)).toBe(6);
    // Two minutes later it's Sunday locally too.
    expect(localDayIndex(new Date("2024-01-07T08:01:00Z"), VANCOUVER_TZ)).toBe(0);
  });
});

describe("minutesSinceMidnight", () => {
  it("counts minutes from local midnight", () => {
    expect(minutesSinceMidnight(new Date("2024-01-06T20:15:00Z"), VANCOUVER_TZ)).toBe(12 * 60 + 15);
  });
});

describe("isWeekend", () => {
  it("uses the local calendar day", () => {
    expect(isWeekend(new Date("2024-01-06T20:00:00Z"), VANCOUVER_TZ)).toBe(true); // Saturday
    expect(isWeekend(new Date("2024-01-08T20:00:00Z"), VANCOUVER_TZ)).toBe(false); // Monday
    // Sunday 23:00 Vancouver = Monday 07:00 UTC — still a weekend locally.
    expect(isWeekend(new Date("2024-01-08T07:00:00Z"), VANCOUVER_TZ)).toBe(true);
  });
});
