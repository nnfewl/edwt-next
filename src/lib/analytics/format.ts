// Pure formatters shared by the analytics finding-titles and SVG charts.

/** Minutes → "Xm" or "Xh Ym" (mockup `fmtMin`). Rounds the total first so the
    remainder stays 0–59 (119.6 → "2h 0m", never "1h 60m"). */
export function fmtMin(v: number): string {
  const total = Math.round(v);
  if (total >= 60) return `${Math.floor(total / 60)}h ${total % 60}m`;
  return `${total}m`;
}

/** Natural-language window for a 24h clock hour (Vancouver local). */
export function partOfDay(hour: number): string {
  if (hour < 6) return "overnight";
  if (hour < 12) return "this morning";
  if (hour < 17) return "this afternoon";
  return "tonight";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** 0=Sunday..6=Saturday → full weekday name. */
export function weekdayName(index: number): string {
  return WEEKDAYS[((index % 7) + 7) % 7];
}

/** Ratio vs typical (1.0) → signed integer percent, e.g. 1.35 → 35. */
export function pctDelta(ratio: number): number {
  return Math.round((ratio - 1) * 100);
}

/** Label-driven-chart name (scatter, bump): drop the "Hospital" token so labels fit
    the mockup's geometry — "Lions Gate Hospital" → "Lions Gate",
    "Surrey Memorial Hospital Adult" → "Surrey Memorial Adult". */
export function chartName(name: string): string {
  return name.replace(/\s+Hospital\b/i, "").replace(/\s+/g, " ").trim();
}
