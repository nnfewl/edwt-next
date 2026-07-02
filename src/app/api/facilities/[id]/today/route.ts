import { NextResponse } from "next/server";
import { client } from "@/db/client";
import {
  type BaselineRow,
  type ProjectedPoint,
  type TodayPoint,
  buildProjection,
  baselineInterp,
  deviationFor,
  smooth,
} from "@/lib/forecast";
import { VANCOUVER_TZ, isWeekend, minutesSinceMidnight } from "@/lib/local-time";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TZ = VANCOUVER_TZ;

export type { TodayPoint, ProjectedPoint };
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

// Per-facility in-process cache, mirroring the pattern in facilities-db.ts:
// the response only changes when a new reading lands (~every 5 min), so a
// short TTL plus in-flight coalescing keeps the 2-3 percentile queries from
// re-running for every drawer open.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; body: TodayResponse }>();
const inflight = new Map<string, Promise<TodayResponse>>();

async function queryToday(id: string): Promise<TodayResponse> {
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

  const weekend = isWeekend(new Date(), TZ);

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
      and (${matchDow ? client`(extract(isodow from observed_at at time zone ${TZ}) >= 6) = ${weekend}` : client`true`})
    group by 1
    order by 1
  `;

  let baseline = smooth(await baselineFor(true));
  if (baseline.length < 12) baseline = smooth(await baselineFor(false));

  const actual: TodayPoint[] = actualRows.map((r) => ({ t: r.t, min: Number(r.min) }));
  const nowMin = minutesSinceMidnight(new Date(), TZ);

  const last = actual[actual.length - 1] ?? null;
  const typicalNow = baselineInterp(baseline, "p50")(nowMin);
  const projected = buildProjection(last, baseline);

  const remaining = projected.filter((p) => p.t > nowMin);
  const bestTime = remaining.length
    ? remaining.reduce((best, p) => (p.min < best.min ? p : best))
    : null;

  return {
    nowMin,
    actual,
    projected,
    typicalNow: typicalNow != null ? Math.round(typicalNow) : null,
    deviation: deviationFor(last, nowMin, baseline),
    bestTime: bestTime ? { t: bestTime.t, min: bestTime.min } : null,
    usual: baseline.map((b) => ({ hour: b.hour, min: Math.round(b.p50) })),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const cached = cache.get(id);
    let body: TodayResponse;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      body = cached.body;
    } else {
      let pending = inflight.get(id);
      if (!pending) {
        pending = queryToday(id)
          .then((result) => {
            cache.set(id, { at: Date.now(), body: result });
            return result;
          })
          .finally(() => {
            inflight.delete(id);
          });
        inflight.set(id, pending);
      }
      body = await pending;
    }

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[today] query failed:", err);
    return NextResponse.json(
      { error: "wait-time history unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
