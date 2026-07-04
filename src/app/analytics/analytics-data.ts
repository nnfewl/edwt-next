import { cache as reactCache } from "react";
import { client as sharedClient } from "../../db/client";
import { VANCOUVER_TZ } from "@/lib/local-time";
import {
  top2Share, peakWindow, dowExtremes, gapTrend, countCalmDays,
  steadyAndGamble, weeksAtTop, standingsMovers, percentile,
} from "@/lib/analytics/derive";
import {
  heroContext as fHeroContext, heroDrivers as fHeroDrivers,
  section01 as f01, section02 as f02, section03 as f03, section04 as f04,
  section05 as f05, section06 as f06, section07 as f07, section08 as f08,
  section09 as f09, section10 as f10,
} from "@/lib/analytics/finding-titles";
import { pressureStatus } from "@/lib/analytics/pressure-index";
import { partOfDay, weekdayName, fmtMin, chartName } from "@/lib/analytics/format";
import { hourLabel } from "./charts/chart-theme";

const TZ = VANCOUVER_TZ;

export type FacilityNow = {
  name: string; address: string | null; type: string;
  wait: number | null; elos: number | null; baseline: number | null;
};
export type HeatCell = { name: string; type: string; hour: number; avgWait: number | null };
export type DayShape = { dow: number; median: number | null };
export type GapPoint = { day: string; ed: number | null; upcc: number | null };
export type DistBucket = { bucket: string; order: number; readings: number };
export type CalendarDay = { date: string; median: number | null };
export type LeagueRow = { name: string; type: string; median: number | null; eveningPeak: number | null; spark: number[]; trend7d: number | null };
export type ScatterPoint = { name: string; median: number; stddev: number; readings: number };
export type BumpRow = { name: string; ranks: number[] };
export type RecordTile = { emoji: string; title: string; value: string; sub: string };
export type WeekBand = { dow: number; hour: number; p25: number; p50: number; p75: number };
export type TypicalBand = { hour: number; p25: number; p50: number; p75: number };
export type HourPoint = { hour: number; min: number };

export type AnalyticsView = {
  // hero
  status: string; ratio: number; regionalMedian: number; heroContext: string; heroDrivers: string;
  heroToday: HourPoint[]; heroTypical: TypicalBand[];
  // stat strip
  shortest: { name: string; min: number } | null; longest: { name: string; min: number } | null;
  reporting: { open: number; total: number }; quietWindow: string;
  // sections
  facilitiesNow: FacilityNow[]; section01: string;
  heat: HeatCell[]; profile: HourPoint[]; bestWindow: string; bestHours: [number, number]; section02: string;
  week: DayShape[]; weekTypical: WeekBand[]; todayDow: number; section03: string;
  gap: GapPoint[]; distribution: DistBucket[]; section04: string;
  visit: FacilityNow[]; section05: string;
  scatter: ScatterPoint[]; section06: string;
  calendar: CalendarDay[]; section07: string;
  league: LeagueRow[]; section08: string;
  bump: BumpRow[]; moverClimber: string; moverSlider: string | null; section09: string;
  records: RecordTile[]; moonNote: string; section10: string;
  // kept header
  meta: { firstObserved: Date | null; lastObserved: Date | null; lastReading: Date | null };
};

export type AnalyticsResult = { view?: AnalyticsView; error?: string };

async function runQueries() {
  const sql = sharedClient;
  const useRollup = process.env.USE_HOURLY_ROLLUP === "1";

  // Lower Mainland only: exclude Sunshine Coast / Sea-to-Sky / Powell River sites
  // (Sechelt, Squamish, Whistler, Pemberton, qathet). Metro Vancouver + the Fraser
  // Valley (Abbotsford / Chilliwack / Mission) stay in. Prefetched once, then every
  // aggregate below is filtered to these ids.
  const lm = await sql<{ id: string }[]>`
    select id from locations
    where status = 'published' and type in ('ed', 'upcc')
      and address !~* '(sechelt|squamish|whistler|pemberton|powell river)'
  `;
  const lmIds = lm.map((r) => r.id);

  return Promise.all([
    // [0] Latest reading per facility + its own 28d hour+dow baseline median. Feeds hero, 01, 05.
    // Latest is a per-location lateral top-1 (one backward probe of
    // idx_readings_location_observed per facility) — a table-wide `distinct on`
    // re-walks every historical row and gets slower as the table grows.
    sql<{ name: string; address: string | null; type: string; wait: number | null; elos: number | null; baseline: number | null; is_open: boolean }[]>`
      with baseline as (
        select location_id,
               percentile_cont(0.5) within group (order by wait_time_minutes) as baseline
        from wait_time_readings
        where has_wait_time = true and wait_time_minutes is not null
          and location_id in ${sql(lmIds)}
          and observed_at >= now() - interval '28 days'
          and extract(hour from observed_at at time zone ${TZ}) = extract(hour from now() at time zone ${TZ})
          and (extract(isodow from observed_at at time zone ${TZ}) >= 6) = (extract(isodow from now() at time zone ${TZ}) >= 6)
        group by location_id
      )
      select l.name, l.address, l.type, latest.wait, latest.elos, baseline.baseline,
             coalesce(l.open247, true) as is_open
      from locations l
      join lateral (
        select w.wait_time_minutes as wait, w.elos_minutes as elos
        from wait_time_readings w
        where w.location_id = l.id
        order by w.observed_at desc
        limit 1
      ) latest on true
      left join baseline on baseline.location_id = l.id
      where l.status = 'published' and l.type in ('ed', 'upcc') and l.id in ${sql(lmIds)}
      order by latest.wait desc nulls last, l.name
    `,
    // [1] Regional today-by-hour median (ED only). Feeds hero curve.
    sql<{ hour: number; min: number }[]>`
      select extract(hour from observed_at at time zone ${TZ})::int as hour,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as min
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}
      group by 1 order by 1
    `,
    // [2] Regional typical curve p25/p50/p75 by hour (30d, ED only). Feeds hero band + 02 profile.
    // Two-level: collapse each day×hour to its regional median first, then take the
    // percentiles ACROSS DAYS. Pooling raw readings measures cross-facility spread
    // (which hospital you're at, ~1h-4h wide) and the band swallows the chart; the
    // band should show the day-to-day range of the regional median itself.
    sql<{ hour: number; p25: number; p50: number; p75: number }[]>`
      with day_hour as (
        select to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
               extract(hour from observed_at at time zone ${TZ})::int as hour,
               percentile_cont(0.5) within group (order by wait_time_minutes) as med
        from wait_time_readings w join locations l on l.id = w.location_id
        where l.type = 'ed' and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
          and observed_at >= now() - interval '30 days'
        group by 1, 2
      )
      select hour,
             percentile_cont(0.25) within group (order by med)::float as p25,
             percentile_cont(0.5)  within group (order by med)::float as p50,
             percentile_cont(0.75) within group (order by med)::float as p75
      from day_hour
      group by 1 order by 1
    `,
    // [3] Facility × hour averages, top-8 busiest EDs, 30d. Feeds 02 heatmap.
    sql<{ name: string; type: string; hour: number; avgWait: number | null }[]>`
      with top8 as (
        select location_id, avg(wait_time_minutes) as avg_w
        from wait_time_readings
        where wait_time_minutes is not null and location_id in ${sql(lmIds)}
          and observed_at >= now() - interval '30 days'
        group by location_id having count(*) >= 50
        order by avg_w desc limit 8
      )
      select l.name, l.type,
             extract(hour from w.observed_at at time zone ${TZ})::int as hour,
             round(avg(w.wait_time_minutes)::numeric, 1)::float as "avgWait"
      from top8 t join wait_time_readings w on w.location_id = t.location_id
      join locations l on l.id = t.location_id
      where w.wait_time_minutes is not null and w.observed_at >= now() - interval '30 days'
      group by l.name, l.type, t.avg_w, 3
      order by t.avg_w desc, l.name, 3
    `,
    // [4] Day-of-week regional medians, 30d, ED only. Feeds 03.
    sql<{ dow: number; median: number | null }[]>`
      select extract(dow from observed_at at time zone ${TZ})::int as dow,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '30 days'
      group by 1 order by 1
    `,
    // [5] Daily median by care type, 30d. Feeds 04 gap trend.
    sql<{ day: string; type: string; median: number | null }[]>`
      select to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day, l.type,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type in ('ed','upcc') and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '30 days'
      group by 1, 2 order by 1, 2
    `,
    // [6] ED wait distribution buckets, 30d. Feeds 04 distribution bar.
    sql<{ bucket: string; order: number; readings: number }[]>`
      select case when wait_time_minutes < 60 then '<1h' when wait_time_minutes < 120 then '1-2h'
                  when wait_time_minutes < 180 then '2-3h' when wait_time_minutes < 240 then '3-4h' else '4h+' end as bucket,
             case when wait_time_minutes < 60 then 1 when wait_time_minutes < 120 then 2
                  when wait_time_minutes < 180 then 3 when wait_time_minutes < 240 then 4 else 5 end as "order",
             count(*)::int as readings
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and l.id in ${sql(lmIds)} and w.wait_time_minutes is not null and observed_at >= now() - interval '30 days'
      group by 1, 2 order by 2
    `,
    // [7] Median + stddev + evening peak (17-22) + 30d daily sparkline + 7d/14d, per facility, 30d. Feeds 06, 08.
    // Sparklines come from one grouped pass over the window — a correlated
    // subquery re-scans each facility's 30 days once per facility.
    sql<{ name: string; type: string; median: number | null; stddev: number | null; evening: number | null; readings: number; spark: number[]; recent7: number | null; prior7: number | null }[]>`
      with spark as (
        select location_id, array_agg(round(med)::int order by day) as spark
        from (select w2.location_id, to_char(w2.observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
                     percentile_cont(0.5) within group (order by w2.wait_time_minutes) as med
              from wait_time_readings w2 where w2.location_id in ${sql(lmIds)} and w2.has_wait_time
                and w2.observed_at >= now() - interval '30 days'
              group by 1, 2) s
        group by location_id
      )
      select l.name, l.type,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median,
             round(stddev_samp(w.wait_time_minutes)::numeric, 1)::float as stddev,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)
               filter (where extract(hour from w.observed_at at time zone ${TZ}) between 17 and 22)::float as evening,
             count(*)::int as readings,
             coalesce(s.spark, '{}') as spark,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)
               filter (where w.observed_at >= now() - interval '7 days')::float as recent7,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)
               filter (where w.observed_at >= now() - interval '14 days' and w.observed_at < now() - interval '7 days')::float as prior7
      from locations l join wait_time_readings w on w.location_id = l.id
      left join spark s on s.location_id = l.id
      where l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null and w.observed_at >= date_trunc('hour', now()) - interval '30 days'
      group by l.id, l.name, l.type, s.spark having count(*) >= 50
      order by median desc nulls last, l.name
    `,
    // [8] Regional daily median (ED), 30d. Feeds 07 calendar + 10 calmest/roughest.
    sql<{ date: string; median: number | null }[]>`
      ${useRollup
        ? sql`
          select to_char(bucket at time zone ${TZ}, 'YYYY-MM-DD') as date,
                 round((sum(avg_wait_minutes * reported_count) / nullif(sum(reported_count),0))::numeric,1)::float as median
          from wait_time_hourly h join locations l on l.id = h.location_id
          where l.type = 'ed' and l.id in ${sql(lmIds)} and h.avg_wait_minutes is not null and bucket >= now() - interval '30 days'
          group by 1 order by 1`
        : sql`
          select to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as date,
                 percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
          from wait_time_readings w join locations l on l.id = w.location_id
          where l.type = 'ed' and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
            and observed_at >= now() - interval '30 days'
          group by 1 order by 1`}
    `,
    // [9] Weekly per-facility median (ED), last 4 weeks. Feeds 08 weeks-at-top, 09 bump.
    sql<{ name: string; week: number; median: number | null }[]>`
      select l.name,
             floor(extract(epoch from (now() - observed_at)) / 604800)::int as week,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '28 days'
      group by l.name, 2
      order by l.name, 2
    `,
    // [10] Record wait + timestamp (ED), 30d. Feeds 10.
    sql<{ name: string; wait: number; at: Date }[]>`
      select l.name, w.wait_time_minutes as wait, w.observed_at as at
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and l.id in ${sql(lmIds)} and w.wait_time_minutes is not null and observed_at >= now() - interval '30 days'
      order by w.wait_time_minutes desc, w.observed_at desc limit 1
    `,
    // [11] Per-dow × hour typical p25/p50/p75 (28d, ED). Feeds 03 week detail.
    // Same two-level shape as [2]: day×hour regional medians first, then percentiles
    // across the ~4 same-weekday samples — not the cross-facility reading pool.
    sql<{ dow: number; hour: number; p25: number; p50: number; p75: number }[]>`
      with day_hour as (
        select to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
               extract(dow from observed_at at time zone ${TZ})::int as dow,
               extract(hour from observed_at at time zone ${TZ})::int as hour,
               percentile_cont(0.5) within group (order by wait_time_minutes) as med
        from wait_time_readings w join locations l on l.id = w.location_id
        where l.type = 'ed' and l.id in ${sql(lmIds)} and w.has_wait_time = true and w.wait_time_minutes is not null
          and observed_at >= now() - interval '28 days'
        group by 1, 2, 3
      )
      select dow, hour,
             percentile_cont(0.25) within group (order by med)::float as p25,
             percentile_cont(0.5)  within group (order by med)::float as p50,
             percentile_cont(0.75) within group (order by med)::float as p75
      from day_hour
      group by 1, 2 order by 1, 2
    `,
    // [12] Observed range (all facilities) — feeds the kept header's data-window aside.
    sql<{ first_observed: Date | null; last_observed: Date | null; last_reading: Date | null }[]>`
      select min(observed_at) as first_observed, max(observed_at) as last_observed,
             max(reading_created_at) as last_reading
      from wait_time_readings
    `,
  ]);
}

// 2026 full-moon dates (America/Vancouver) — verify against an ephemeris before shipping.
const FULL_MOONS = ["2026-05-01", "2026-05-31", "2026-06-29", "2026-07-29", "2026-08-28", "2026-09-26", "2026-10-26"];

function buildRecords(
  record: { name: string; wait: number; at: Date } | null,
  facRows: { name: string; stddev: number | null }[],
  dailyRows: { date: string; median: number | null }[],
  typical: { hour: number; p50: number }[],
): RecordTile[] {
  const dfmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  const withStd = facRows.filter((f) => f.stddev != null) as { name: string; stddev: number }[];
  const metro = withStd.length ? withStd.reduce((a, b) => (b.stddev < a.stddev ? b : a)) : null;
  const coaster = withStd.length ? withStd.reduce((a, b) => (b.stddev > a.stddev ? b : a)) : null;
  const withMed = dailyRows.filter((d) => d.median != null) as { date: string; median: number }[];
  const calm = withMed.length ? withMed.reduce((a, b) => (b.median < a.median ? b : a)) : null;
  const rough = withMed.length ? withMed.reduce((a, b) => (b.median > a.median ? b : a)) : null;
  const golden = typical.length ? typical.reduce((a, b) => (b.p50 < a.p50 ? b : a)) : null;

  const tiles: RecordTile[] = [];
  if (record) tiles.push({ emoji: "🏆", title: "Longest wait recorded", value: fmtMin(record.wait), sub: `${shortName(record.name)} · ${new Date(record.at).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` });
  if (golden) tiles.push({ emoji: "🌅", title: "The golden hour", value: hourLabel(golden.hour), sub: `${fmtMin(golden.p50)} median — the quietest window` });
  if (metro) tiles.push({ emoji: "📏", title: "The metronome", value: shortName(metro.name), sub: `swung just ±${fmtMin(metro.stddev)} all month` });
  if (coaster) tiles.push({ emoji: "🎢", title: "The rollercoaster", value: shortName(coaster.name), sub: `±${fmtMin(coaster.stddev)} — pack a book, or get lucky` });
  if (calm) tiles.push({ emoji: "😌", title: "Calmest day", value: dfmt(calm.date), sub: `regional median ${fmtMin(calm.median)}` });
  if (rough) tiles.push({ emoji: "🔥", title: "Roughest day", value: dfmt(rough.date), sub: `regional median ${fmtMin(rough.median)}` });
  return tiles;
}

function buildMoonNote(dailyRows: { date: string; median: number | null }[]): string {
  const withMed = dailyRows.filter((d) => d.median != null) as { date: string; median: number }[];
  if (withMed.length === 0) return "";
  const mean = withMed.reduce((s, d) => s + d.median, 0) / withMed.length;
  const moons = withMed.filter((d) => FULL_MOONS.includes(d.date));
  if (moons.length === 0) return "";
  const avgDelta = Math.round(moons.reduce((s, d) => s + (d.median - mean), 0) / moons.length);
  const dir = avgDelta === 0 ? "right on" : avgDelta > 0 ? `+${avgDelta}m vs` : `${avgDelta}m vs`;
  const caveat = moons.length < 3 ? " (This one gets better as history accumulates.)" : "";
  return `Full-moon check 🌕 — ER folklore says full moons bring chaos. Full moons in this window ran ${dir} the monthly average.${caveat}`;
}

// Display name: keep the full published name, but abbreviate the long UPCC suffix
// ("… Urgent and Primary Care Centre" → "… UPCC"). Hospitals stay full.
function shortName(name: string): string {
  return name
    .replace(/\s*urgent\s+(?:and|&)\s+primary\s+care\s+cent(?:re|er)/i, " UPCC")
    .replace(/\s+/g, " ")
    .trim();
}

function shapeView(rows: Awaited<ReturnType<typeof runQueries>>): AnalyticsView {
  const [nowRows, todayRows, typicalRows, heatRows, dowRows, gapRows, distRows, facRows, dailyRows, weeklyRows, recordRows, weekTypicalRows, metaRows] = rows;

  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const dow = new Date(ymd + "T00:00:00Z").getUTCDay();
  const pod = partOfDay(hour);

  const openEds = nowRows.filter((r) => r.type === "ed" && r.wait != null && r.is_open);
  const regionalMedian = openEds.length ? percentile(openEds.map((r) => r.wait as number), 0.5) : 0;
  const baselineMedian = (() => {
    const bs = openEds.map((r) => r.baseline).filter((b): b is number => b != null);
    return bs.length ? percentile(bs, 0.5) : regionalMedian;
  })();
  const ratio = baselineMedian > 0 ? regionalMedian / baselineMedian : 1;

  const drivers = openEds
    .filter((r) => r.baseline != null)
    .map((r) => ({ name: shortName(r.name), wait: r.wait as number, delta: (r.wait as number) - (r.baseline as number) }))
    .sort((a, b) => b.delta - a.delta);
  const upccUnderHour = nowRows.filter((r) => r.type === "upcc" && r.wait != null).every((r) => (r.wait as number) < 60);

  const facilitiesNow: FacilityNow[] = nowRows.map((r) => ({ name: shortName(r.name), address: r.address, type: r.type, wait: r.wait, elos: r.elos, baseline: r.baseline }));

  const profile = typicalRows.map((r) => ({ hour: r.hour, min: Math.round(r.p50) }));
  const pk = peakWindow(profile);
  const peakStart = String(pk.peakStartHour % 12 || 12);
  const peakEnd = hourLabel(pk.peakEndHour);
  const bestHour = profile.length ? profile.reduce((a, b) => (b.min < a.min ? b : a)).hour : 9;
  const bestHours: [number, number] = [bestHour, (bestHour + 2) % 24];
  const quietWindow = `${hourLabel(bestHour)}–${hourLabel((bestHour + 2) % 24)}`;

  const dowMedians = dowRows.filter((r) => r.median != null).map((r) => ({ dow: r.dow, min: r.median as number }));
  const de = dowExtremes(dowMedians);

  const days = Array.from(new Set(gapRows.map((r) => r.day))).sort();
  const gap = days.map((day) => ({
    day,
    ed: gapRows.find((r) => r.day === day && r.type === "ed")?.median ?? null,
    upcc: gapRows.find((r) => r.day === day && r.type === "upcc")?.median ?? null,
  }));
  const gaps = gap.filter((g) => g.ed != null && g.upcc != null).map((g) => (g.ed as number) - (g.upcc as number));
  const gt = gapTrend(gaps);

  const reportingEds = nowRows.filter((r) => r.type === "ed" && r.wait != null);
  const worst = reportingEds.length
    ? reportingEds.reduce((a, b) => ((b.wait as number) + (b.elos ?? 0) > (a.wait as number) + (a.elos ?? 0) ? b : a))
    : null;
  const visitTotal = worst ? (worst.wait as number) + (worst.elos ?? 0) : 0;

  const swing = facRows.filter((r) => r.type === "ed" && r.median != null && r.stddev != null).map((r) => ({ name: shortName(r.name), median: r.median as number, stddev: r.stddev as number }));
  const sg = steadyAndGamble(swing, regionalMedian);

  const dailyMedians = dailyRows.filter((r) => r.median != null).map((r) => r.median as number);
  const calmDays = countCalmDays(dailyMedians);

  // weekly ranks: week 0 = this week … 3 = 4 weeks ago; rank 1 = longest median.
  // Rank within the fixed cohort of facilities present in ALL weeks — per-week cohorts
  // differ in size, and ranking against a shrinking cohort fabricates rank "climbs"
  // (everyone ▲, no ▼, and the movers title contradicts the badges).
  const weeks = [3, 2, 1, 0];
  const weekRows = weeks.map((wk) => weeklyRows.filter((r) => r.week === wk && r.median != null));
  const cohort = weekRows
    .map((rs) => new Set(rs.map((r) => r.name)))
    .reduce((a, b) => new Set([...a].filter((n) => b.has(n))));
  const rankByWeek = weekRows.map((rs) => new Map(
    rs.filter((r) => cohort.has(r.name))
      .sort((a, b) => (b.median as number) - (a.median as number))
      .map((r, i) => [r.name, i + 1] as const),
  ));
  const bump: BumpRow[] = [...cohort]
    .map((name) => ({ name: chartName(shortName(name)), ranks: rankByWeek.map((m) => m.get(name)).filter((r): r is number => r != null) }))
    .filter((s) => s.ranks.length === weeks.length)
    .sort((a, b) => a.ranks[a.ranks.length - 1] - b.ranks[b.ranks.length - 1])
    .slice(0, 8);
  // Leader for 08 comes from the full per-week field, not the bump cohort.
  const leadersByWeek = weekRows
    .map((rs) => (rs.length ? rs.reduce((a, b) => ((b.median as number) > (a.median as number) ? b : a)).name : ""))
    .filter(Boolean);
  const wt = weeksAtTop(leadersByWeek);
  const mv = standingsMovers(bump);

  const league: LeagueRow[] = facRows.map((r) => ({
    name: shortName(r.name), type: r.type, median: r.median, eveningPeak: r.evening, spark: r.spark ?? [],
    trend7d: r.recent7 != null && r.prior7 != null ? Math.round((r.recent7 as number) - (r.prior7 as number)) : null,
  }));

  const scatter: ScatterPoint[] = facRows.filter((r) => r.type === "ed" && r.median != null && r.stddev != null)
    .map((r) => ({ name: chartName(shortName(r.name)), median: Math.round(r.median as number), stddev: Math.round(r.stddev as number), readings: r.readings }))
    .sort((a, b) => a.name.localeCompare(b.name)); // deterministic render order (no hydration jitter)

  const calendar: CalendarDay[] = dailyRows.map((r) => ({ date: r.date, median: r.median }));

  // Pin today's final curve point to the official live median (open EDs) so the
  // chart's "now" marker matches the hero sentence — the partial-hour median drifts.
  const heroToday = todayRows.map((r) => ({ hour: r.hour, min: Math.round(r.min) }));
  const lastToday = heroToday[heroToday.length - 1];
  if (lastToday && lastToday.hour === hour && openEds.length) lastToday.min = Math.round(regionalMedian);

  const record = recordRows[0] ?? null;
  const records = buildRecords(record, facRows, dailyRows, typicalRows.map((t) => ({ hour: t.hour, p50: t.p50 })));
  const moonNote = buildMoonNote(dailyRows);

  const shortest = [...reportingEds].sort((a, b) => (a.wait as number) - (b.wait as number))[0] ?? null;
  const longest = [...reportingEds].sort((a, b) => (b.wait as number) - (a.wait as number))[0] ?? null;

  return {
    status: pressureStatus(ratio), ratio, regionalMedian: Math.round(regionalMedian),
    heroContext: fHeroContext({ medianMin: Math.round(regionalMedian), ratio, weekday: weekdayName(dow), partOfDay: pod }),
    heroDrivers: fHeroDrivers({ drivers: drivers.slice(0, 2), upccUnderHour }),
    heroToday,
    heroTypical: typicalRows,
    shortest: shortest ? { name: shortName(shortest.name), min: shortest.wait as number } : null,
    longest: longest ? { name: shortName(longest.name), min: longest.wait as number } : null,
    reporting: { open: nowRows.filter((r) => r.wait != null).length, total: nowRows.length },
    quietWindow,
    facilitiesNow, section01: f01({ top2Share: top2Share(drivers.map((d) => d.delta)), partOfDay: pod }),
    heat: heatRows.map((r) => ({ ...r, name: shortName(r.name) })), profile, bestWindow: `Best time to go: ${quietWindow}`, bestHours,
    section02: f02({ peakStart, peakEnd, morningDeltaMin: pk.morningDeltaMin }),
    week: dowRows, weekTypical: weekTypicalRows, todayDow: dow, section03: f03(de),
    gap, distribution: distRows, section04: f04(gt),
    visit: facilitiesNow.filter((r) => r.wait != null), section05: f05({ facilityName: shortName(worst?.name ?? ""), totalMin: visitTotal }),
    scatter, section06: f06(sg),
    calendar, section07: f07({ calmDays, windowDays: dailyMedians.length }),
    league, section08: f08({ leaderName: shortName(wt.leaderName), weeksAtTop: wt.weeksAtTop }),
    bump, moverClimber: mv.climberName, moverSlider: mv.sliderName, section09: f09(mv),
    records, moonNote, section10: f10({ recordWaitMin: record?.wait ?? 0 }),
    meta: { firstObserved: metaRows[0]?.first_observed ?? null, lastObserved: metaRows[0]?.last_observed ?? null, lastReading: metaRows[0]?.last_reading ?? null },
  };
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; result: AnalyticsResult } | null = null;
let inflight: Promise<AnalyticsResult> | null = null;
const DEADLINE_MS = 45_000;

async function queryAnalytics(): Promise<AnalyticsResult> {
  try {
    const rows = await runQueries();
    return { view: shapeView(rows) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown database error" };
  }
}

function withDeadline(p: Promise<AnalyticsResult>): Promise<AnalyticsResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "Analytics queries timed out." }), DEADLINE_MS);
    p.then((r) => { clearTimeout(timer); resolve(r); }, (e) => { clearTimeout(timer); resolve({ error: e instanceof Error ? e.message : "Unknown database error" }); });
  });
}

// Wrapped in React cache() so a single request's HTML render and RSC render share
// ONE data snapshot — otherwise the two passes can read slightly different rows and
// the data-driven SVG charts mismatch on hydration.
export const getAnalytics = reactCache(async (): Promise<AnalyticsResult> => {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  if (!inflight) {
    inflight = queryAnalytics().then((r) => { if (!r.error) cache = { at: Date.now(), result: r }; return r; }).finally(() => { inflight = null; });
  }
  return withDeadline(inflight);
});
