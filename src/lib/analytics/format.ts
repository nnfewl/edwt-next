// Pure formatters shared by the analytics finding-titles and SVG charts.

/** Minutes → "Xm" or "Xh Ym" (mockup `fmtMin`). */
export function fmtMin(v: number): string {
  if (v >= 60) {
    const m = Math.round(v % 60);
    return `${Math.floor(v / 60)}h ${m}m`;
  }
  return `${Math.round(v)}m`;
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
