// Pure derivations turning query results into finding-title scalar inputs.

export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Share of total above-baseline pressure held by the two biggest contributors. */
export function top2Share(deltas: number[]): number {
  const pos = deltas.map((d) => Math.max(0, d));
  const total = pos.reduce((s, d) => s + d, 0);
  if (total <= 0) return 0;
  const top2 = [...pos].sort((a, b) => b - a).slice(0, 2).reduce((s, d) => s + d, 0);
  return top2 / total;
}

export type HourMedian = { hour: number; min: number };
export function peakWindow(hourly: HourMedian[]): { peakStartHour: number; peakEndHour: number; morningDeltaMin: number } {
  if (hourly.length === 0) return { peakStartHour: 0, peakEndHour: 0, morningDeltaMin: 0 };
  const max = Math.max(...hourly.map((h) => h.min));
  const peak = hourly.filter((h) => h.min >= max * 0.85).map((h) => h.hour);
  const morning = hourly.filter((h) => h.hour >= 6 && h.hour <= 11).map((h) => h.min);
  const morningMin = morning.length ? Math.min(...morning) : max;
  return { peakStartHour: Math.min(...peak), peakEndHour: Math.max(...peak), morningDeltaMin: Math.round(max - morningMin) };
}

export type DowMedian = { dow: number; min: number };
export function dowExtremes(dows: DowMedian[]): { roughestDow: number; calmestDow: number; deltaMin: number } {
  if (dows.length === 0) return { roughestDow: 0, calmestDow: 0, deltaMin: 0 };
  const roughest = dows.reduce((a, b) => (b.min > a.min ? b : a));
  const calmest = dows.reduce((a, b) => (b.min < a.min ? b : a));
  return { roughestDow: roughest.dow, calmestDow: calmest.dow, deltaMin: Math.round(roughest.min - calmest.min) };
}

export function gapTrend(gaps: number[]): { gapMin: number; trend: "widening" | "narrowing" | "steady" } {
  if (gaps.length === 0) return { gapMin: 0, trend: "steady" };
  const gapMin = Math.round(gaps[gaps.length - 1]);
  const third = Math.max(1, Math.floor(gaps.length / 3));
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const diff = avg(gaps.slice(-third)) - avg(gaps.slice(0, third));
  const trend = diff > 10 ? "widening" : diff < -10 ? "narrowing" : "steady";
  return { gapMin, trend };
}

export function countCalmDays(dailyMedians: number[]): number {
  if (dailyMedians.length === 0) return 0;
  const p25 = percentile(dailyMedians, 0.25);
  return dailyMedians.filter((m) => m < p25).length;
}

export type FacilitySwing = { name: string; median: number; stddev: number };
export function steadyAndGamble(facilities: FacilitySwing[], regionalMedian: number): { steadyLongName: string | null; gambleName: string | null } {
  if (facilities.length < 2) return { steadyLongName: null, gambleName: null };
  const gamble = facilities.reduce((a, b) => (b.stddev > a.stddev ? b : a));
  const long = facilities.filter((f) => f.median >= regionalMedian && f.name !== gamble.name);
  const steadyLong = long.length ? long.reduce((a, b) => (b.stddev < a.stddev ? b : a)) : null;
  return { steadyLongName: steadyLong?.name ?? null, gambleName: gamble.name };
}

export function weeksAtTop(leadersByWeek: string[]): { leaderName: string; weeksAtTop: number } {
  if (leadersByWeek.length === 0) return { leaderName: "", weeksAtTop: 0 };
  const leaderName = leadersByWeek[leadersByWeek.length - 1];
  let streak = 0;
  for (let i = leadersByWeek.length - 1; i >= 0 && leadersByWeek[i] === leaderName; i--) streak++;
  return { leaderName, weeksAtTop: streak };
}

export type RankSeries = { name: string; ranks: number[] }; // rank 1 = longest wait (top)
export function standingsMovers(series: RankSeries[]): { climberName: string; climbBy: number; sliderName: string | null } {
  let climber = { name: "", by: 0 };
  let slider = { name: "", by: 0 };
  for (const s of series) {
    if (s.ranks.length < 2) continue;
    const move = s.ranks[0] - s.ranks[s.ranks.length - 1]; // positive = climbed toward top
    if (move > climber.by) climber = { name: s.name, by: move };
    if (-move > slider.by) slider = { name: s.name, by: -move };
  }
  return { climberName: climber.name, climbBy: climber.by, sliderName: slider.by > 0 ? slider.name : null };
}
