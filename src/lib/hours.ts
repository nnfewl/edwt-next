import { VANCOUVER_TZ, localDayIndex, localHourMinute, minutesSinceMidnight } from "./local-time";

type HoursDay = {
  open?: string | null;
  close?: string | null;
};

type OperatingHours = {
  days?: HoursDay[];
};

export type HoursSource = {
  open247: boolean | null;
  operating_hours: unknown;
  wait_time_minutes: number | null;
};

function isOperatingHours(value: unknown): value is OperatingHours {
  return typeof value === "object" && value !== null && Array.isArray((value as OperatingHours).days);
}

// The source encodes each day's open/close as an RFC 2822 string anchored to
// 1970-01-01 GMT, where 16:00 GMT means "8 a.m. PST." Converting via the
// Vancouver timezone recovers the intended wall-clock minutes-of-day.
export function operatingMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const { hour, minute } = localHourMinute(date, VANCOUVER_TZ);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function formatMinutes(value: number): string {
  const hour24 = Math.floor(value / 60) % 24;
  const minute = value % 60;
  const suffix = hour24 >= 12 ? "p.m." : "a.m.";
  const hour12 = hour24 % 12 || 12;
  return hour12 + ":" + String(minute).padStart(2, "0") + " " + suffix;
}

const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Google-Maps-style reopen label for a facility that is closed right now:
 * "8:00 a.m." (later today), "8:00 a.m. tomorrow", or "8:00 a.m. Mon".
 * Null when hours are unknown or the site is 24/7 (never "closed").
 */
export function nextOpeningLabel(row: HoursSource, now: Date = new Date()): string | null {
  if (row.open247 || !isOperatingHours(row.operating_hours)) return null;
  const days = row.operating_hours.days ?? [];
  const todayIdx = localDayIndex(now, VANCOUVER_TZ);
  if (todayIdx < 0) return null;
  const nowMin = minutesSinceMidnight(now, VANCOUVER_TZ);

  for (let offset = 0; offset <= 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const openMin = operatingMinutes(days[idx]?.open);
    if (openMin == null || operatingMinutes(days[idx]?.close) == null) continue;
    // Today's opening already passed (we're inside or after hours) — look ahead.
    if (offset === 0 && nowMin >= openMin) continue;
    const time = formatMinutes(openMin);
    if (offset === 0) return time;
    if (offset === 1) return time + " tomorrow";
    return time + " " + DAY_ABBREV[idx];
  }
  return null;
}

export function hoursInfo(row: HoursSource, now: Date = new Date()): { label: string; open: boolean } {
  if (row.open247) return { label: "Open 24 / 7", open: true };
  if (!isOperatingHours(row.operating_hours)) return { label: "Hours vary", open: row.wait_time_minutes !== null };

  const index = localDayIndex(now, VANCOUVER_TZ);
  const today = index >= 0 ? row.operating_hours.days?.[index] : undefined;
  const openMin = operatingMinutes(today?.open);
  const closeMinRaw = operatingMinutes(today?.close);

  if (openMin == null || closeMinRaw == null) return { label: "Hours vary", open: false };

  const closeMin = closeMinRaw <= openMin ? closeMinRaw + 24 * 60 : closeMinRaw;
  const { hour, minute } = localHourMinute(now, VANCOUVER_TZ);
  const nowMinRaw = hour * 60 + minute;
  const nowMin = nowMinRaw < openMin && closeMin > 24 * 60 ? nowMinRaw + 24 * 60 : nowMinRaw;
  const open = nowMin >= openMin && nowMin < closeMin;
  const label = formatMinutes(openMin) + " - " + formatMinutes(closeMinRaw);
  return { label, open };
}
