import { NextResponse } from "next/server";
import { client } from "@/db/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TZ = "America/Vancouver";
/** Decay constant (minutes) for anchoring the forecast to the current deviation. */
const TAU_MIN = 150;
const STEP_MIN = 15;

export type TodayPoint = { t: number; min: number };
export type ProjectedPoint = { t: number; min: number; lo: number; hi: number };
export type TodayResponse = {
  nowMin: number;
  actual: TodayPoint[];
  projected: ProjectedPoint[];
  typicalNow: number | null;
  deviation: "lower" | "typical" | "higher" | null;
  bestTime: { t: number; min: number } | null;
  /** Typical wait per hour of day (28-day median) — the "popular times" baseline. */
  usual: { hour: number; min: number }[];
};

type BaselineRow = { hour: number; p25: number; p50: number; p75: number };

function minutesSinceMidnight(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Linear interpolation over hourly baseline rows (anchored at the half-hour). */
function baselineInterp(rows: BaselineRow[], key: "p25" | "p50" | "p75") {
  return (t: number): number | null => {
    if (rows.length === 0) return null;
    const pts = rows.map((r) => ({ x: r.hour * 60 + 30, y: r[key] }));
    if (t <= pts[0].x) return pts[0].y;
    if (t >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 0; i < pts.length - 1; i++) {
      if (t >= pts[i].x && t <= pts[i + 1].x) {
        const f = (t - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + f * (pts[i + 1].y - pts[i].y);
      }
    }
    return pts[pts.length - 1].y;
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const actualRows = await client<{ t: number; min: number }[]>`
    with today as (
      select
        (extract(hour from observed_at at time zone ${TZ}) * 60
         + extract(minute from observed_at at time zone ${TZ}))::int as m,
        observed_at,
        wait_time_minutes
      from wait_time_readings
      where location_id = ${id}
        and has_wait_time = true
        and wait_time_minutes is not null
        and observed_at >= (date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ})
    )
    select distinct on (m / 15)
      (m / 15 * 15)::int as t,
      wait_time_minutes as min
    from today
    order by m / 15, observed_at desc
  `;

  const isWeekend = [0, 6].includes(
    new Date(new Date().toLocaleString("en-US", { timeZone: TZ })).getDay(),
  );

  const baselineFor = (matchDow: boolean) => client<BaselineRow[]>`
    select
      extract(hour from observed_at at time zone ${TZ})::int as hour,
      percentile_cont(0.25) within group (order by wait_time_minutes) as p25,
      percentile_cont(0.5)  within group (order by wait_time_minutes) as p50,
      percentile_cont(0.75) within group (order by wait_time_minutes) as p75
    from wait_time_readings
    where location_id = ${id}
      and has_wait_time = true
      and wait_time_minutes is not null
      and observed_at >= now() - interval '28 days'
      and observed_at < (date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ})
      and (${matchDow ? client`(extract(isodow from observed_at at time zone ${TZ}) >= 6) = ${isWeekend}` : client`true`})
    group by 1
    order by 1
  `;

  // Sparse facilities (hourly reporters) yield jagged hourly percentiles; a
  // light 1-2-1 pass keeps the forecast ridge from lurching bucket to bucket.
  const smooth = (rows: BaselineRow[]): BaselineRow[] =>
    rows.map((r, i) => {
      const prev = rows[i - 1] ?? r;
      const next = rows[i + 1] ?? r;
      const mix = (k: "p25" | "p50" | "p75") => 0.25 * prev[k] + 0.5 * r[k] + 0.25 * next[k];
      return { ...r, p25: mix("p25"), p50: mix("p50"), p75: mix("p75") };
    });

  let baseline = smooth(await baselineFor(true));
  if (baseline.length < 12) baseline = smooth(await baselineFor(false));

  const actual: TodayPoint[] = actualRows.map((r) => ({ t: r.t, min: Number(r.min) }));
  const nowMin = minutesSinceMidnight(new Date());

  const p25At = baselineInterp(baseline, "p25");
  const p50At = baselineInterp(baseline, "p50");
  const p75At = baselineInterp(baseline, "p75");

  const last = actual[actual.length - 1] ?? null;
  const typicalNow = p50At(nowMin);

  let deviation: TodayResponse["deviation"] = null;
  if (last && typicalNow != null) {
    const iqr = Math.max(10, (p75At(nowMin) ?? 0) - (p25At(nowMin) ?? 0));
    const z = (last.min - typicalNow) / iqr;
    deviation = z > 0.5 ? "higher" : z < -0.5 ? "lower" : "typical";
  }

  const projected: ProjectedPoint[] = [];
  if (last && baseline.length > 0) {
    const anchorDev = last.min - (p50At(last.t) ?? last.min);
    for (let t = last.t + STEP_MIN; t <= 1440 - STEP_MIN; t += STEP_MIN) {
      const base = p50At(t);
      if (base == null) continue;
      const min = Math.max(0, base + anchorDev * Math.exp(-(t - last.t) / TAU_MIN));
      const hoursAhead = (t - last.t) / 60;
      const rawHalf =
        (Math.max(10, (p75At(t) ?? 0) - (p25At(t) ?? 0)) / 2) * (1 + 0.15 * hoursAhead);
      // Cap the band so noisy baselines can't balloon the cone past the forecast itself.
      const half = Math.min(rawHalf, Math.max(20, min * 0.4), 90);
      projected.push({
        t,
        min: Math.round(min),
        lo: Math.max(0, Math.round(min - half)),
        hi: Math.round(min + half),
      });
    }
  }

  const remaining = projected.filter((p) => p.t > nowMin);
  const bestTime = remaining.length
    ? remaining.reduce((best, p) => (p.min < best.min ? p : best))
    : null;

  const body: TodayResponse = {
    nowMin,
    actual,
    projected,
    typicalNow: typicalNow != null ? Math.round(typicalNow) : null,
    deviation,
    bestTime: bestTime ? { t: bestTime.t, min: bestTime.min } : null,
    usual: baseline.map((b) => ({ hour: b.hour, min: Math.round(b.p50) })),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
  });
}
