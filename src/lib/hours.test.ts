import { describe, expect, it } from "vitest";
import { formatMinutes, hoursInfo, nextOpeningLabel, operatingMinutes } from "./hours";

// Upstream encodes daily open/close as RFC 2822 strings anchored to 1970-01-01
// GMT. 16:00 GMT on that date is 8:00 a.m. PST.
const OPEN_8AM = "Thu, 01 Jan 1970 16:00:00 GMT";
const CLOSE_10PM = "Fri, 02 Jan 1970 06:00:00 GMT"; // 22:00 PST
const CLOSE_2AM = "Thu, 01 Jan 1970 10:00:00 GMT"; // 02:00 PST

/** operating_hours payload with the same open/close for all 7 days. */
function weeklyHours(open: string, close: string): { days: { open: string | null; close: string | null }[] } {
  return { days: Array.from({ length: 7 }, () => ({ open, close })) };
}

// A Saturday: 2024-01-06. Local Vancouver times constructed via UTC+8h offset (PST).
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2024, 0, 6, hour + 8, minute));

describe("operatingMinutes", () => {
  it("recovers wall-clock minutes from the 1970-anchored RFC 2822 string", () => {
    expect(operatingMinutes(OPEN_8AM)).toBe(8 * 60);
    expect(operatingMinutes(CLOSE_10PM)).toBe(22 * 60);
  });

  it("returns null for missing or malformed values", () => {
    expect(operatingMinutes(null)).toBeNull();
    expect(operatingMinutes(undefined)).toBeNull();
    expect(operatingMinutes("not a date")).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("formats 12-hour wall-clock labels", () => {
    expect(formatMinutes(8 * 60)).toBe("8:00 a.m.");
    expect(formatMinutes(22 * 60)).toBe("10:00 p.m.");
    expect(formatMinutes(0)).toBe("12:00 a.m.");
    expect(formatMinutes(12 * 60)).toBe("12:00 p.m.");
    expect(formatMinutes(9 * 60 + 5)).toBe("9:05 a.m.");
  });
});

describe("hoursInfo", () => {
  it("treats open247 as always open", () => {
    expect(hoursInfo({ open247: true, operating_hours: null, wait_time_minutes: null })).toEqual({
      label: "Open 24 / 7",
      open: true,
    });
  });

  it("falls back to reading presence when hours are unknown", () => {
    expect(hoursInfo({ open247: null, operating_hours: null, wait_time_minutes: 30 }).open).toBe(true);
    expect(hoursInfo({ open247: null, operating_hours: null, wait_time_minutes: null }).open).toBe(false);
  });

  it("is open inside the daily window and closed outside it", () => {
    const row = { open247: null, operating_hours: weeklyHours(OPEN_8AM, CLOSE_10PM), wait_time_minutes: null };
    expect(hoursInfo(row, at(12)).open).toBe(true);
    expect(hoursInfo(row, at(7, 59)).open).toBe(false);
    expect(hoursInfo(row, at(22, 1)).open).toBe(false);
    expect(hoursInfo(row, at(12)).label).toBe("8:00 a.m. - 10:00 p.m.");
  });

  it("handles overnight closes (close time earlier than open)", () => {
    const row = { open247: null, operating_hours: weeklyHours(OPEN_8AM, CLOSE_2AM), wait_time_minutes: null };
    expect(hoursInfo(row, at(23)).open).toBe(true); // 11 p.m. — before the 2 a.m. close
    expect(hoursInfo(row, at(1)).open).toBe(true); // 1 a.m. — still the overnight window
    expect(hoursInfo(row, at(3)).open).toBe(false); // 3 a.m. — closed
  });

  it("closes on days with missing open/close entries", () => {
    const days = weeklyHours(OPEN_8AM, CLOSE_10PM);
    days.days[6] = { open: null, close: null }; // Saturday
    const row = { open247: null, operating_hours: days, wait_time_minutes: 15 };
    expect(hoursInfo(row, at(12))).toEqual({ label: "Hours vary", open: false });
  });
});

describe("nextOpeningLabel", () => {
  const daily = (open = OPEN_8AM, close = CLOSE_10PM) =>
    ({ open247: null, operating_hours: weeklyHours(open, close), wait_time_minutes: null });

  it("returns null for 24/7 or unknown hours", () => {
    expect(nextOpeningLabel({ open247: true, operating_hours: null, wait_time_minutes: null })).toBeNull();
    expect(nextOpeningLabel({ open247: null, operating_hours: null, wait_time_minutes: null })).toBeNull();
  });

  it("labels later-today openings with the time only", () => {
    // 6 a.m. Saturday, opens 8 a.m. today
    expect(nextOpeningLabel(daily(), at(6))).toBe("8:00 a.m.");
  });

  it("labels next-day openings as tomorrow", () => {
    // 11 p.m. Saturday, next opening Sunday 8 a.m.
    expect(nextOpeningLabel(daily(), at(23))).toBe("8:00 a.m. tomorrow");
  });

  it("skips days without hours and names the weekday", () => {
    const days = weeklyHours(OPEN_8AM, CLOSE_10PM);
    days.days[0] = { open: null, close: null }; // Sunday closed all day
    const row = { open247: null, operating_hours: days, wait_time_minutes: null };
    // 11 p.m. Saturday → Sunday closed → Monday 8 a.m.
    expect(nextOpeningLabel(row, at(23))).toBe("8:00 a.m. Mon");
  });
});
