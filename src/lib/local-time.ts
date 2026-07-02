// Timezone-aware wall-clock helpers built on Intl.formatToParts, so results
// never depend on locale-formatted date strings being re-parsed by `new Date`
// (which is runtime-defined behavior and differs across ICU builds).

export const VANCOUVER_TZ = "America/Vancouver";

/** Hour/minute of the wall clock in a given timezone. */
export function localHourMinute(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return { hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

/**
 * Day-of-week (Sun=0..Sat=6) in a given timezone — built from year/month/day so
 * it doesn't depend on which ICU short-weekday string the runtime emits.
 * Returns -1 if the date can't be resolved.
 */
export function localDayIndex(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const y = get("year");
  const m = get("month") - 1;
  const d = get("day");
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return -1;
  return new Date(Date.UTC(y, m, d)).getUTCDay();
}

/** Minutes since local midnight in a given timezone. */
export function minutesSinceMidnight(date: Date, timeZone: string): number {
  const { hour, minute } = localHourMinute(date, timeZone);
  return hour * 60 + minute;
}

/** Whether the wall-clock day in a given timezone is Saturday or Sunday. */
export function isWeekend(date: Date, timeZone: string): boolean {
  const day = localDayIndex(date, timeZone);
  return day === 0 || day === 6;
}
