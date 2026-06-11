import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { client as sharedClient } from "../../db/client";
import { HeroMapBackdrop } from "../hero-map-backdrop";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("analyticsTitle"),
    description: t("analyticsDescription"),
    alternates: { canonical: "/analytics" },
  };
}
import { AutoRefresh } from "../auto-refresh";
import { AnalyticsCharts } from "./analytics-charts";
import "./styles.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// These analytics aggregations take longer than the default serverless budget.
// Without this, Vercel kills the request before the queries finish → endless load.
export const maxDuration = 60;

type MaybeNumber = number | null;

type TableCount = { table_name: string; rows: number };
type ObservedRange = {
  first_observed: Date | null;
  last_observed: Date | null;
  first_source_reading: Date | null;
  last_source_reading: Date | null;
};
type ReadingQuality = {
  readings: number;
  with_wait_minutes: number;
  with_elos_minutes: number;
  with_source_timestamp: number;
  locations_with_readings: number;
};
type TypeSummary = {
  type: string;
  locations: number;
  readings: number;
  avg_wait: MaybeNumber;
  median_wait: MaybeNumber;
  p90_wait: MaybeNumber;
  max_wait: MaybeNumber;
};
type FacilitySummary = {
  name: string;
  type: string;
  readings: number;
  first_observed?: Date | null;
  last_observed?: Date | null;
  avg_wait: MaybeNumber;
  median_wait: MaybeNumber;
  p90_wait?: MaybeNumber;
  max_wait: MaybeNumber;
  stddev_wait?: MaybeNumber;
};
type SnapshotRow = {
  name: string;
  type: string;
  observed_at: Date | null;
  reading_created_at: Date | null;
  wait_time_minutes: MaybeNumber;
  elos_minutes: MaybeNumber;
  status: string | null;
};
type HourlyRow = {
  vancouver_hour: number;
  readings: number;
  avg_wait: MaybeNumber;
  median_wait: MaybeNumber;
  p90_wait: MaybeNumber;
};
type TrendRow = {
  bucket: Date;
  readings: number;
  avg_wait: MaybeNumber;
  median_wait: MaybeNumber;
  p90_wait: MaybeNumber;
};
type DistributionRow = {
  bucket: string;
  bucket_order: number;
  readings: number;
};
type HeatmapRow = {
  name: string;
  type: string;
  vancouver_hour: number;
  avg_wait: MaybeNumber;
  readings: number;
};
type FacilityRiskRow = {
  name: string;
  type: string;
  readings: number;
  current_wait: MaybeNumber;
  avg_wait: MaybeNumber;
  median_wait: MaybeNumber;
  p90_wait: MaybeNumber;
  stddev_wait: MaybeNumber;
};
type RankFlowRow = {
  bucket: Date;
  name: string;
  rank: number;
  avg_wait: MaybeNumber;
};
type TypeTrendRow = {
  bucket: Date;
  type: string;
  median_wait: MaybeNumber;
  p90_wait: MaybeNumber;
  readings: number;
};
type CoverageRow = {
  name: string;
  type: string;
  readings: number;
  hours_covered: MaybeNumber;
  freshness_minutes: MaybeNumber;
};
type AlertRow = {
  name: string;
  type: string;
  current_wait: MaybeNumber;
  avg_wait: MaybeNumber;
  stddev_wait: MaybeNumber;
  z_score: MaybeNumber;
  delta_from_avg: MaybeNumber;
  readings: number;
};
type PollCadence = {
  polls: number;
  first_poll: Date | null;
  last_poll: Date | null;
  avg_seconds_between_polls: MaybeNumber;
  median_seconds_between_polls: MaybeNumber;
  max_seconds_between_polls: MaybeNumber;
};
type Freshness = {
  readings: number;
  avg_minutes_source_lag: MaybeNumber;
  median_minutes_source_lag: MaybeNumber;
  p95_minutes_source_lag: MaybeNumber;
  max_minutes_source_lag: MaybeNumber;
};
type NoReadingLocation = {
  name: string;
  type: string;
  show_wait_times: boolean | null;
  show_status: boolean | null;
  wait_time_fallback: string | null;
};
type AnalyticsData = {
  tables: TableCount[];
  observedRange: ObservedRange | null;
  quality: ReadingQuality | null;
  pollCadence: PollCadence | null;
  freshness: Freshness | null;
  byType: TypeSummary[];
  current: SnapshotRow[];
  highestAverage: FacilitySummary[];
  mostVolatile: FacilitySummary[];
  hourly: HourlyRow[];
  trend: TrendRow[];
  distribution: DistributionRow[];
  heatmap: HeatmapRow[];
  facilityRisk: FacilityRiskRow[];
  rankFlow: RankFlowRow[];
  typeTrend: TypeTrendRow[];
  coverage: CoverageRow[];
  alerts: AlertRow[];
  noReadings: NoReadingLocation[];
};

// localFormatter is created inside AnalyticsPage with the active locale.

type AnalyticsResult = { data?: AnalyticsData; error?: string };
const ANALYTICS_CACHE_TTL_MS = 30_000;
let analyticsCache: { at: number; result: AnalyticsResult } | null = null;
let analyticsInflight: Promise<AnalyticsResult> | null = null;

async function queryAnalytics(): Promise<AnalyticsResult> {
  const sql = sharedClient;
  const startedAt = Date.now();
  console.log("[analytics] query start");

  try {
    const rawPollsExists = await sql<{ exists: boolean }[]>`
      select to_regclass('public.raw_polls') is not null as exists
    `;
    console.log("[analytics] raw polls exists", Date.now() - startedAt);
    const hasRawPolls = rawPollsExists[0]?.exists ?? false;
    const tablesQuery = hasRawPolls
      ? sql<TableCount[]>`
        select 'locations' as table_name, count(*)::int as rows from locations
        union all
        select 'raw_polls' as table_name, count(*)::int as rows from raw_polls
        union all
        select 'wait_time_readings' as table_name, count(*)::int as rows from wait_time_readings
        order by table_name
      `
      : sql<TableCount[]>`
        select 'locations' as table_name, count(*)::int as rows from locations
        union all
        select 'raw_polls' as table_name, 0::int as rows
        union all
        select 'wait_time_readings' as table_name, count(*)::int as rows from wait_time_readings
        order by table_name
      `;
    const pollCadenceQuery = hasRawPolls
      ? sql<PollCadence[]>`
        with intervals as (
          select fetched_at, fetched_at - lag(fetched_at) over (order by fetched_at) as gap
          from raw_polls
        )
        select
          count(*)::int as polls,
          min(fetched_at) as first_poll,
          max(fetched_at) as last_poll,
          round(avg(extract(epoch from gap))::numeric, 1)::float as avg_seconds_between_polls,
          percentile_cont(0.5) within group (order by extract(epoch from gap))::float as median_seconds_between_polls,
          max(extract(epoch from gap))::int as max_seconds_between_polls
        from intervals
        where gap is not null
      `
      : Promise.resolve([{ polls: 0, first_poll: null, last_poll: null, avg_seconds_between_polls: null, median_seconds_between_polls: null, max_seconds_between_polls: null }]);

    // Batch 1: lightweight meta queries (5 queries, all fast)
    console.log("[analytics] batch 1 start", Date.now() - startedAt);
    const [tables, observedRange, quality, pollCadence, freshness] = await Promise.all([
      tablesQuery,
      sql<ObservedRange[]>`
        select
          min(observed_at) as first_observed,
          max(observed_at) as last_observed,
          min(reading_created_at) as first_source_reading,
          max(reading_created_at) as last_source_reading
        from wait_time_readings
      `,
      sql<ReadingQuality[]>`
        select
          count(*)::int as readings,
          count(*) filter (where wait_time_minutes is not null)::int as with_wait_minutes,
          count(*) filter (where elos_minutes is not null)::int as with_elos_minutes,
          count(*) filter (where reading_created_at is not null)::int as with_source_timestamp,
          count(distinct location_id)::int as locations_with_readings
        from wait_time_readings
      `,
      pollCadenceQuery,
      sql<Freshness[]>`
        select
          count(*)::int as readings,
          round(avg(extract(epoch from (observed_at - reading_created_at)) / 60)::numeric, 1)::float as avg_minutes_source_lag,
          percentile_cont(0.5) within group (order by extract(epoch from (observed_at - reading_created_at)) / 60)::float as median_minutes_source_lag,
          percentile_cont(0.95) within group (order by extract(epoch from (observed_at - reading_created_at)) / 60)::float as p95_minutes_source_lag,
          max(round((extract(epoch from (observed_at - reading_created_at)) / 60)::numeric, 1))::float as max_minutes_source_lag
        from wait_time_readings
        where reading_created_at is not null
          and observed_at >= now() - interval '30 days'
      `,
    ]);
    console.log("[analytics] batch 1 done", Date.now() - startedAt);

    // Batch 2: per-type + snapshot + facility aggregations (5 queries)
    const [byType, current, highestAverage, mostVolatile, noReadings] = await Promise.all([
      sql<TypeSummary[]>`
        select
          l.type,
          count(distinct l.id)::int as locations,
          count(w.id)::int as readings,
          round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by w.wait_time_minutes)::float as p90_wait,
          max(w.wait_time_minutes)::int as max_wait
        from locations l
        left join wait_time_readings w on w.location_id = l.id
          and w.observed_at >= now() - interval '30 days'
        group by l.type
        order by l.type
      `,
      sql<SnapshotRow[]>`
        with latest as (
          select distinct on (location_id)
            location_id,
            observed_at,
            reading_created_at,
            wait_time_minutes,
            elos_minutes,
            status
          from wait_time_readings
          order by location_id, observed_at desc
        )
        select
          l.name,
          l.type,
          latest.observed_at,
          latest.reading_created_at,
          latest.wait_time_minutes,
          latest.elos_minutes,
          latest.status
        from latest
        join locations l on l.id = latest.location_id
        order by latest.wait_time_minutes desc nulls last, l.name
        limit 20
      `,
      sql<FacilitySummary[]>`
        select
          l.name,
          l.type,
          count(w.id)::int as readings,
          min(w.observed_at) as first_observed,
          max(w.observed_at) as last_observed,
          round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by w.wait_time_minutes)::float as p90_wait,
          max(w.wait_time_minutes)::int as max_wait
        from locations l
        join wait_time_readings w on w.location_id = l.id
        where w.wait_time_minutes is not null
          and w.observed_at >= now() - interval '30 days'
        group by l.id, l.name, l.type
        having count(w.id) >= 50
        order by avg(w.wait_time_minutes) desc
        limit 12
      `,
      sql<FacilitySummary[]>`
        select
          l.name,
          l.type,
          count(w.id)::int as readings,
          round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
          max(w.wait_time_minutes)::int as max_wait,
          round(stddev_samp(w.wait_time_minutes)::numeric, 1)::float as stddev_wait
        from locations l
        join wait_time_readings w on w.location_id = l.id
        where w.wait_time_minutes is not null
          and w.observed_at >= now() - interval '30 days'
        group by l.id, l.name, l.type
        having count(w.id) >= 50
        order by stddev_samp(w.wait_time_minutes) desc nulls last
        limit 10
      `,
      sql<NoReadingLocation[]>`
        select l.name, l.type, l.show_wait_times, l.show_status, l.wait_time_fallback
        from locations l
        left join wait_time_readings w on w.location_id = l.id
        where w.id is null
        order by l.type, l.name
      `,
    ]);
    console.log("[analytics] batch 2 done", Date.now() - startedAt);

    // Batch 3: time-series, distribution, heatmap, risk, alerts (9 queries)
    const [hourly, trend, distribution, heatmap, facilityRisk, rankFlow, typeTrend, coverage, alerts] = await Promise.all([
      sql<HourlyRow[]>`
        select
          extract(hour from observed_at at time zone 'America/Vancouver')::int as vancouver_hour,
          count(*)::int as readings,
          round(avg(wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by wait_time_minutes)::float as p90_wait
        from wait_time_readings
        where wait_time_minutes is not null
          and observed_at >= now() - interval '30 days'
        group by 1
        order by 1
      `,
      sql<TrendRow[]>`
        select
          date_bin('30 minutes', observed_at, timestamp with time zone '2000-01-01') as bucket,
          count(*)::int as readings,
          round(avg(wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by wait_time_minutes)::float as p90_wait
        from wait_time_readings
        where wait_time_minutes is not null
          and observed_at >= now() - interval '30 days'
        group by 1
        order by 1
      `,
      sql<DistributionRow[]>`
        select
          case
            when wait_time_minutes < 60 then '<1h'
            when wait_time_minutes < 120 then '1-2h'
            when wait_time_minutes < 180 then '2-3h'
            when wait_time_minutes < 240 then '3-4h'
            when wait_time_minutes < 300 then '4-5h'
            when wait_time_minutes < 360 then '5-6h'
            else '6h+'
          end as bucket,
          case
            when wait_time_minutes < 60 then 1
            when wait_time_minutes < 120 then 2
            when wait_time_minutes < 180 then 3
            when wait_time_minutes < 240 then 4
            when wait_time_minutes < 300 then 5
            when wait_time_minutes < 360 then 6
            else 7
          end as bucket_order,
          count(*)::int as readings
        from wait_time_readings
        where wait_time_minutes is not null
          and observed_at >= now() - interval '30 days'
        group by 1, 2
        order by 2
      `,
      sql<HeatmapRow[]>`
        with top_locations as (
          select location_id
          from wait_time_readings
          where wait_time_minutes is not null
            and observed_at >= now() - interval '30 days'
          group by location_id
          having count(*) >= 50
          order by avg(wait_time_minutes) desc
          limit 12
        )
        select
          l.name,
          l.type,
          extract(hour from w.observed_at at time zone 'America/Vancouver')::int as vancouver_hour,
          round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
          count(*)::int as readings
        from top_locations t
        join wait_time_readings w on w.location_id = t.location_id
        join locations l on l.id = t.location_id
        where w.wait_time_minutes is not null
          and w.observed_at >= now() - interval '30 days'
        group by l.name, l.type, 3
        order by l.name, 3
      `,
      sql<FacilityRiskRow[]>`
        with latest as (
          select distinct on (location_id)
            location_id,
            wait_time_minutes as current_wait
          from wait_time_readings
          where wait_time_minutes is not null
          order by location_id, observed_at desc
        )
        select
          l.name,
          l.type,
          count(w.id)::int as readings,
          max(latest.current_wait)::int as current_wait,
          round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by w.wait_time_minutes)::float as p90_wait,
          round(stddev_samp(w.wait_time_minutes)::numeric, 1)::float as stddev_wait
        from locations l
        join wait_time_readings w on w.location_id = l.id
        left join latest on latest.location_id = l.id
        where w.wait_time_minutes is not null
          and w.observed_at >= now() - interval '30 days'
        group by l.id, l.name, l.type
        having count(w.id) >= 10
        order by avg(w.wait_time_minutes) desc
      `,
      sql<RankFlowRow[]>`
        with bucketed as (
          select
            date_bin('2 hours', observed_at, timestamp with time zone '2000-01-01') as bucket,
            location_id,
            avg(wait_time_minutes)::float as avg_wait,
            count(*)::int as readings
          from wait_time_readings
          where wait_time_minutes is not null
            and observed_at >= now() - interval '30 days'
          group by 1, 2
          having count(*) >= 2
        ), ranked as (
          select
            bucket,
            location_id,
            avg_wait,
            row_number() over (partition by bucket order by avg_wait desc nulls last) as rank
          from bucketed
        )
        select
          ranked.bucket,
          l.name,
          ranked.rank::int as rank,
          round(ranked.avg_wait::numeric, 1)::float as avg_wait
        from ranked
        join locations l on l.id = ranked.location_id
        where ranked.rank <= 8
        order by ranked.bucket, ranked.rank
      `,
      sql<TypeTrendRow[]>`
        select
          date_bin('2 hours', w.observed_at, timestamp with time zone '2000-01-01') as bucket,
          l.type,
          percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by w.wait_time_minutes)::float as p90_wait,
          count(*)::int as readings
        from wait_time_readings w
        join locations l on l.id = w.location_id
        where w.wait_time_minutes is not null
          and w.observed_at >= now() - interval '30 days'
        group by 1, 2
        order by 1, 2
      `,
      sql<CoverageRow[]>`
        with bounds as (
          select max(observed_at) as max_observed from wait_time_readings
        )
        select
          l.name,
          l.type,
          count(w.id)::int as readings,
          round((extract(epoch from (max(w.observed_at) - min(w.observed_at))) / 3600)::numeric, 1)::float as hours_covered,
          round((extract(epoch from ((select max_observed from bounds) - max(w.observed_at))) / 60)::numeric, 1)::float as freshness_minutes
        from locations l
        left join wait_time_readings w on w.location_id = l.id and w.wait_time_minutes is not null
        group by l.id, l.name, l.type
        order by readings desc, l.name
      `,
      sql<AlertRow[]>`
        with latest as (
          select distinct on (location_id)
            location_id,
            wait_time_minutes as current_wait
          from wait_time_readings
          where wait_time_minutes is not null
          order by location_id, observed_at desc
        ), baseline as (
          select
            location_id,
            count(*)::int as readings,
            avg(wait_time_minutes)::float as avg_wait,
            stddev_samp(wait_time_minutes)::float as stddev_wait
          from wait_time_readings
          where wait_time_minutes is not null
            and observed_at >= now() - interval '30 days'
          group by location_id
          having count(*) >= 50 and stddev_samp(wait_time_minutes) > 0
        )
        select
          l.name,
          l.type,
          latest.current_wait::int as current_wait,
          round(baseline.avg_wait::numeric, 1)::float as avg_wait,
          round(baseline.stddev_wait::numeric, 1)::float as stddev_wait,
          round(((latest.current_wait - baseline.avg_wait) / baseline.stddev_wait)::numeric, 2)::float as z_score,
          round((latest.current_wait - baseline.avg_wait)::numeric, 1)::float as delta_from_avg,
          baseline.readings
        from latest
        join baseline on baseline.location_id = latest.location_id
        join locations l on l.id = latest.location_id
        where latest.current_wait > baseline.avg_wait
        order by ((latest.current_wait - baseline.avg_wait) / baseline.stddev_wait) desc
        limit 10
      `,
    ]);
    console.log("[analytics] batch 3 done", Date.now() - startedAt);
    return {
      data: {
        tables,
        observedRange: observedRange[0] ?? null,
        quality: quality[0] ?? null,
        pollCadence: pollCadence[0] ?? null,
        freshness: freshness[0] ?? null,
        byType,
        current,
        highestAverage,
        mostVolatile,
        hourly,
        trend,
        distribution,
        heatmap,
        facilityRisk,
        rankFlow,
        typeTrend,
        coverage,
        alerts,
        noReadings,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown database error" };
  }
}

// Hard ceiling so the page can never hang: if the queries don't resolve in
// time, return an error result and let the page render its error panel instead
// of loading forever. Sits just under the function's maxDuration budget.
const ANALYTICS_DEADLINE_MS = 45_000;

function withDeadline(promise: Promise<AnalyticsResult>): Promise<AnalyticsResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ error: "Analytics queries timed out. The database may be slow or unreachable." }),
      ANALYTICS_DEADLINE_MS,
    );
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        resolve({ error: error instanceof Error ? error.message : "Unknown database error" });
      },
    );
  });
}

async function getAnalytics(): Promise<AnalyticsResult> {
  if (analyticsCache && Date.now() - analyticsCache.at < ANALYTICS_CACHE_TTL_MS) return analyticsCache.result;
  if (!analyticsInflight) {
    analyticsInflight = queryAnalytics()
      .then((result) => {
        // Only cache successful results so a transient failure isn't pinned for
        // the whole TTL.
        if (!result.error) analyticsCache = { at: Date.now(), result };
        return result;
      })
      .finally(() => {
        analyticsInflight = null;
      });
  }
  return withDeadline(analyticsInflight);
}

function rowCount(data: AnalyticsData, table: string) {
  return data.tables.find((item) => item.table_name === table)?.rows ?? 0;
}

function fmtNumber(value: MaybeNumber | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function fmtWait(value: MaybeNumber | undefined) {
  if (value === null || value === undefined) return "n/a";
  if (value >= 60) return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  return `${Math.round(value)}m`;
}

function fmtDate(value: Date | string | null | undefined, formatter: Intl.DateTimeFormat) {
  if (!value) return "n/a";
  return formatter.format(new Date(value));
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}


function typeLabel(type: string | null | undefined) {
  if (type === "ed") return "ED";
  if (type === "upcc") return "UPCC";
  return type ?? "n/a";
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "green" | "amber" | "coral";
}) {
  return (
    <article className={`analytics-metric analytics-tone-${tone}`}>
      <span className="analytics-metric-mark" aria-hidden="true" />
      <p className="analytics-label">{label}</p>
      <p className="analytics-metric-value">{value}</p>
      <p className="analytics-muted">{detail}</p>
    </article>
  );
}

function TypePill({ type }: { type: string }) {
  return <span className={`analytics-type-pill analytics-type-${type}`}>{typeLabel(type)}</span>;
}

function InsightCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "teal" | "green" | "amber" | "coral";
}) {
  return (
    <article className={`analytics-insight analytics-tone-${tone}`}>
      <p className="analytics-label">{label}</p>
      <h3>{value}</h3>
      <p>{detail}</p>
    </article>
  );
}

function TypeComparison({ rows, t }: { rows: TypeSummary[]; t: (key: string, values?: Record<string, string | number>) => string }) {
  const max = Math.max(...rows.map((row) => row.p90_wait ?? 0), 1);

  return (
    <section className="analytics-panel analytics-type-card">
      <div className="analytics-section-head">
        <p className="analytics-eyebrow">{t("careType")}</p>
        <h2>{t("edVsUpcc")}</h2>
        <p>{t("edVsUpccDesc")}</p>
      </div>
      <div className="analytics-type-bars">
        {rows.map((row) => (
          <div className="analytics-type-row" key={row.type}>
            <div className="analytics-type-row-head">
              <TypePill type={row.type} />
              <span>{t("medianWaitLabel", { wait: fmtWait(row.median_wait) })} / {t("p90WaitLabel", { wait: fmtWait(row.p90_wait) })}</span>
            </div>
            <div className="analytics-bar-track" aria-label={`${typeLabel(row.type)} ${t("medianWaitLabel", { wait: fmtWait(row.median_wait) })}`}>
              <span className="analytics-bar-fill analytics-bar-median" style={{ width: `${Math.max(((row.median_wait ?? 0) / max) * 100, 2)}%` }} />
            </div>
            <div className="analytics-bar-track" aria-label={`${typeLabel(row.type)} ${t("p90WaitLabel", { wait: fmtWait(row.p90_wait) })}`}>
              <span className="analytics-bar-fill analytics-bar-p90" style={{ width: `${Math.max(((row.p90_wait ?? 0) / max) * 100, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="analytics-legend-inline">
        <span><i className="analytics-dot analytics-dot-median" />{t("medianWaitTime")}</span>
        <span><i className="analytics-dot analytics-dot-p90" />{t("p90WaitTime")}</span>
      </div>
    </section>
  );
}

function DataTable({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="analytics-table-card">
      <div className="analytics-table-head">
        <p className="analytics-eyebrow">Table</p>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="analytics-table-scroll">{children}</div>
    </section>
  );
}

function EmptyFallback({ children }: { children: ReactNode }) {
  return <p className="analytics-empty">{children}</p>;
}

function AnalyticsHeroMap() {
  return (
    <HeroMapBackdrop
      className="analytics-hero-map"
      pictureClassName="analytics-hero-map-picture"
      imageClassName="analytics-hero-map-image"
    />
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [t, locale] = await Promise.all([
    getTranslations("analytics"),
    getLocale(),
  ]);
  const localFormatter = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Vancouver",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  console.log("[analytics] page render start", new Date().toISOString());

  // Emergency isolation path: /analytics?shell=1 renders without touching
  // Postgres. Direct /analytics uses the lightweight facility snapshot.
  if (params.shell === "1") {
    console.log("[analytics] shell-only mode — skipping all DB queries");
    return (
      <div className="analytics-root">
        <main className="analytics-page">
          <section className="analytics-error-panel">
            <p className="analytics-eyebrow">Analytics</p>
            <h1>{t("shellTitle")}</h1>
            <p>{t("shellDesc")}</p>
            <Link href="/" className="analytics-button">{t("backToFacilities")}</Link>
          </section>
        </main>
      </div>
    );
  }

  const result = await getAnalytics();
  console.log("[analytics] getAnalytics resolved", { hasError: !!result.error, hasData: !!result.data });

  if (result.error || !result.data) {
    return (
      <div className="analytics-root">
        <AutoRefresh intervalMs={300_000} />
        <main className="analytics-page">
          <section className="analytics-error-panel">
            <p className="analytics-eyebrow">{t("databaseUnavailable")}</p>
            <h1>{t("dbErrorTitle")}</h1>
            <p>{t("dbErrorDesc")}</p>
            <Link href="/" className="analytics-button">{t("backToFacilities")}</Link>
            <pre>{result.error}</pre>
          </section>
        </main>
      </div>
    );
  }

  const data = result.data;
  const locationCount = rowCount(data, "locations");
  const readings = rowCount(data, "wait_time_readings");
  const polls = rowCount(data, "raw_polls");
  const quality = data.quality;
  const latestCurrent = data.current[0];
  const highestAvg = data.highestAverage[0];
  const upcc = data.byType.find((row) => row.type === "upcc");
  const ed = data.byType.find((row) => row.type === "ed");
  const hasObservedRange = !!data.observedRange?.first_observed || !!data.observedRange?.last_observed;
  const dataWindow = hasObservedRange
    ? `${fmtDate(data.observedRange?.first_observed, localFormatter)} to ${fmtDate(data.observedRange?.last_observed, localFormatter)} PT`
    : t("currentFacilitySnapshot");
  const latestSourceReading = data.observedRange?.last_source_reading ? `${fmtDate(data.observedRange.last_source_reading, localFormatter)} PT` : t("snapshotMode");
  const freshnessValue = data.freshness?.median_minutes_source_lag == null ? "n/a" : `${fmtNumber(data.freshness.median_minutes_source_lag, 1)}m`;
  const freshnessDetail = data.freshness?.p95_minutes_source_lag == null
    ? t("sourceLagDisabled")
    : t("p95SourceLag", { minutes: fmtNumber(data.freshness.p95_minutes_source_lag, 1) });
  const edPremium = ed?.median_wait != null && upcc?.median_wait != null ? ed.median_wait - upcc.median_wait : null;

  return (
    <div className="analytics-root">
      <AutoRefresh intervalMs={300_000} />
      <main className="analytics-page">
        <section className="analytics-hero">
          <AnalyticsHeroMap />
          <div className="analytics-hero-copy">
            <div className="analytics-kicker"><span aria-hidden="true" /> {t("liveAnalytics")}</div>
            <h1>{t("heroTitle")}</h1>
            <p>
              {t("heroSubtitle")}
            </p>
          </div>
          <aside className="analytics-window" aria-label={t("dataWindow")}>
            <div>
              <span>{t("dataWindow")}</span>
              <strong>{dataWindow}</strong>
            </div>
            <div>
              <span>{t("latestSourceReading")}</span>
              <strong>{latestSourceReading}</strong>
            </div>
          </aside>
        </section>

        <section className="analytics-metrics" aria-label="Analytics summary">
          <MetricCard label={t("facilitiesTracked")} value={fmtNumber(locationCount)} detail={t("locationsProducedReadings", { count: quality?.locations_with_readings ?? 0 })} tone="teal" />
          <MetricCard label={t("readingsCaptured")} value={fmtNumber(readings)} detail={t("includeWaitMinutes", { percent: percent(quality?.with_wait_minutes ?? 0, quality?.readings ?? 0) })} tone="green" />
          <MetricCard label={t("pollArchive")} value={fmtNumber(polls)} detail={data.pollCadence?.polls ? t("medianCadence", { seconds: fmtNumber(data.pollCadence.median_seconds_between_polls, 1) }) : t("archiveNotPresent")} tone="amber" />
          <MetricCard label={t("freshness")} value={freshnessValue} detail={freshnessDetail} tone="coral" />
        </section>

        <section className="analytics-grid analytics-grid-readout">
          <section className="analytics-panel analytics-readout">
            <div className="analytics-section-head">
              <p className="analytics-eyebrow">{t("executiveReadout")}</p>
              <h2>{t("whatNeedsAttention")}</h2>
              <p>{t("readoutDesc")}</p>
            </div>
            <div className="analytics-insight-grid">
              <InsightCard
                label={t("currentHighestPressure")}
                value={latestCurrent?.name ?? "n/a"}
                detail={t("latestWaitAt", { wait: fmtWait(latestCurrent?.wait_time_minutes), time: fmtDate(latestCurrent?.observed_at, localFormatter) })}
                tone="coral"
              />
              <InsightCard
                label={t("highestSustainedAverage")}
                value={highestAvg?.name ?? "n/a"}
                detail={t("avgMedianWait", { avg: fmtWait(highestAvg?.avg_wait), median: fmtWait(highestAvg?.median_wait) })}
                tone="teal"
              />
              <InsightCard
                label={t("edAccessGap")}
                value={edPremium == null ? "n/a" : t("longerMedianWait", { wait: fmtWait(edPremium) })}
                detail={t("edVsUpccMedian", { ed: fmtWait(ed?.median_wait), upcc: fmtWait(upcc?.median_wait) })}
                tone="amber"
              />
              <InsightCard
                label={t("coverageNote")}
                value={t("locationsWithoutReadings", { count: data.noReadings.length })}
                detail={t("coverageDetail")}
                tone="green"
              />
            </div>
          </section>
          <TypeComparison rows={data.byType} t={t} />
        </section>

        <AnalyticsCharts
          trend={data.trend.map((row) => ({
            bucket: new Date(row.bucket).toISOString(),
            avgWait: row.avg_wait,
            medianWait: row.median_wait,
            p90Wait: row.p90_wait,
          }))}
          current={data.current.map((row) => ({
            name: row.name,
            type: row.type,
            wait: row.wait_time_minutes,
          }))}
          distribution={data.distribution.map((row) => ({
            bucket: row.bucket,
            readings: row.readings,
          }))}
          heatmap={data.heatmap.map((row) => ({
            name: row.name,
            hour: row.vancouver_hour,
            avgWait: row.avg_wait,
          }))}
          facilityRisk={data.facilityRisk.map((row) => ({
            name: row.name,
            type: row.type,
            readings: row.readings,
            currentWait: row.current_wait,
            avgWait: row.avg_wait,
            medianWait: row.median_wait,
            p90Wait: row.p90_wait,
            stddevWait: row.stddev_wait,
          }))}
          typeTrend={data.typeTrend.map((row) => ({
            bucket: new Date(row.bucket).toISOString(),
            type: row.type,
            medianWait: row.median_wait,
            p90Wait: row.p90_wait,
            readings: row.readings,
          }))}
          coverage={data.coverage.map((row) => ({
            name: row.name,
            type: row.type,
            readings: row.readings,
            hoursCovered: row.hours_covered,
            freshnessMinutes: row.freshness_minutes,
          }))}
        />

        <section className="analytics-table-grid">
          <DataTable title={t("currentWaitPressure")} subtitle={t("currentWaitPressureDesc")}>
            <table>
              <thead>
                <tr><th>{t("facility")}</th><th>{t("type")}</th><th>{t("waitTime")}</th><th>{t("estimatedLengthOfStay")}</th><th>{t("observed")}</th></tr>
              </thead>
              <tbody>
                {data.current.slice(0, 12).map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td><TypePill type={row.type} /></td>
                    <td><strong>{fmtWait(row.wait_time_minutes)}</strong></td>
                    <td>{fmtWait(row.elos_minutes)}</td>
                    <td>{fmtDate(row.observed_at, localFormatter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <DataTable title={t("aboveBaselineSignals")} subtitle={t("aboveBaselineDesc")}>
            {data.alerts.length ? (
              <table>
                <thead>
                  <tr><th>{t("facility")}</th><th>{t("currentWait")}</th><th>{t("averageWait")}</th><th>{t("deltaFromAverage")}</th><th>{t("zScore")}</th></tr>
                </thead>
                <tbody>
                  {data.alerts.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td><strong>{fmtWait(row.current_wait)}</strong></td>
                      <td>{fmtWait(row.avg_wait)}</td>
                      <td>+{fmtWait(row.delta_from_avg)}</td>
                      <td><span className={(row.z_score ?? 0) > 2 ? "analytics-score analytics-score-hot" : "analytics-score analytics-score-watch"}>{fmtNumber(row.z_score, 2)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyFallback>{t("noAboveBaseline")}</EmptyFallback>}
          </DataTable>
        </section>

        <section className="analytics-table-grid">
          <DataTable title={t("sustainedHighWaitTimes")} subtitle={t("sustainedHighDesc")}>
            <table>
              <thead>
                <tr><th>{t("facility")}</th><th>{t("averageWait")}</th><th>{t("medianWait")}</th><th>{t("p90WaitTime")}</th><th>{t("maxWait")}</th></tr>
              </thead>
              <tbody>
                {data.highestAverage.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td><strong>{fmtWait(row.avg_wait)}</strong></td>
                    <td>{fmtWait(row.median_wait)}</td>
                    <td>{fmtWait(row.p90_wait)}</td>
                    <td>{fmtWait(row.max_wait)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <DataTable title={t("volatility")} subtitle={t("volatilityDesc")}>
            <table>
              <thead>
                <tr><th>{t("facility")}</th><th>{t("standardDeviation")}</th><th>{t("averageWait")}</th><th>{t("medianWait")}</th><th>{t("readings")}</th></tr>
              </thead>
              <tbody>
                {data.mostVolatile.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td><strong>{fmtWait(row.stddev_wait)}</strong></td>
                    <td>{fmtWait(row.avg_wait)}</td>
                    <td>{fmtWait(row.median_wait)}</td>
                    <td>{fmtNumber(row.readings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>

        <section className="analytics-method-grid" aria-label="Analytics notes">
          {[
            [t("method1Title"), t("method1Body")],
            [t("method2Title"), t("method2Body")],
            [t("method3Title"), t("method3Body")],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <DataTable title={t("locationsWithoutReadingsTitle")} subtitle={t("locationsWithoutReadingsDesc")}>
          {data.noReadings.length ? (
            <table>
              <thead>
                <tr><th>{t("facility")}</th><th>{t("type")}</th><th>{t("showWaitTimes")}</th><th>{t("fallbackText")}</th></tr>
              </thead>
              <tbody>
                {data.noReadings.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td><TypePill type={row.type} /></td>
                    <td>{row.show_wait_times ? t("yes") : t("no")}</td>
                    <td>{row.wait_time_fallback ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyFallback>{t("everyLocationHasReadings")}</EmptyFallback>}
        </DataTable>
      </main>
    </div>
  );
}
