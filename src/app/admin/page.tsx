import Link from "next/link";
import postgres from "postgres";
import { AutoRefresh } from "../auto-refresh";
import { DashboardCharts } from "./dashboard-charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

const databaseUrl = process.env.DATABASE_URL ?? "postgres://edwt:edwt@localhost:5433/edwt";
const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function getAnalytics(): Promise<{ data?: AnalyticsData; error?: string }> {
  const sql = postgres(databaseUrl, { max: 4, idle_timeout: 5 });

  try {
    const rawPollsExists = await sql<{ exists: boolean }[]>`
      select to_regclass('public.raw_polls') is not null as exists
    `;
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

    const [
      tables,
      observedRange,
      quality,
      pollCadence,
      freshness,
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
    ] = await Promise.all([
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
      `,
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
        group by l.id, l.name, l.type
        having count(w.id) >= 50
        order by stddev_samp(w.wait_time_minutes) desc nulls last
        limit 10
      `,
      sql<HourlyRow[]>`
        select
          extract(hour from observed_at at time zone 'America/Vancouver')::int as vancouver_hour,
          count(*)::int as readings,
          round(avg(wait_time_minutes)::numeric, 1)::float as avg_wait,
          percentile_cont(0.5) within group (order by wait_time_minutes)::float as median_wait,
          percentile_cont(0.9) within group (order by wait_time_minutes)::float as p90_wait
        from wait_time_readings
        where wait_time_minutes is not null
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
        group by 1, 2
        order by 2
      `,
      sql<HeatmapRow[]>`
        with top_locations as (
          select location_id
          from wait_time_readings
          where wait_time_minutes is not null
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
      sql<NoReadingLocation[]>`
        select l.name, l.type, l.show_wait_times, l.show_status, l.wait_time_fallback
        from locations l
        left join wait_time_readings w on w.location_id = l.id
        where w.id is null
        order by l.type, l.name
      `,
    ]);

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
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
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

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "n/a";
  return localFormatter.format(new Date(value));
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 h-1.5 w-14 rounded-full ${accent}`} />
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function ComparisonBars({ rows }: { rows: TypeSummary[] }) {
  const max = Math.max(...rows.map((row) => row.p90_wait ?? 0), 1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">ED vs UPCC</h2>
      <p className="mt-1 text-sm text-slate-600">Common operational lens: compare median and p90, not just averages.</p>
      <div className="mt-6 space-y-6">
        {rows.map((row) => (
          <div key={row.type}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold uppercase text-slate-950">{row.type}</span>
              <span className="text-right text-slate-600">median {fmtWait(row.median_wait)} · p90 {fmtWait(row.p90_wait)}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(((row.median_wait ?? 0) / max) * 100, 2)}%` }} />
            </div>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(((row.p90_wait ?? 0) / max) * 100, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-teal-500" />median</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />p90</span>
      </div>
    </div>
  );
}

function DataTable({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "cyan" | "amber" | "rose" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    cyan: "bg-cyan-50 text-cyan-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
  };
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export default async function Home() {
  const result = await getAnalytics();

  if (result.error || !result.data) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
        <AutoRefresh />
        <div className="mx-auto max-w-3xl rounded-lg border border-rose-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase text-rose-700">Database unavailable</p>
          <h1 className="mt-3 text-3xl font-semibold">The analytics page could not read Postgres.</h1>
          <p className="mt-4 leading-7 text-slate-600">Check <code className="rounded bg-slate-100 px-1.5 py-1">DATABASE_URL</code> or the env file used to start Next, then refresh this page.</p>
          <Link href="/" className="mt-5 inline-flex rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Back to public app</Link>
          <pre className="mt-5 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-100">{result.error}</pre>
        </div>
      </main>
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
  const dataWindow = `${fmtDate(data.observedRange?.first_observed)} to ${fmtDate(data.observedRange?.last_observed)} PT`;
  const edPremium = ed?.median_wait && upcc?.median_wait ? ed.median_wait - upcc.median_wait : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <AutoRefresh />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <nav className="mb-5 flex flex-wrap items-center gap-3 text-sm" aria-label="Dashboard navigation">
              <Link href="/" className="font-semibold text-cyan-700 underline underline-offset-4">Public app</Link>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-700">Analytics</span>
            </nav>
            <div className="mb-5 flex flex-wrap gap-2">
              <Pill tone="cyan">live Postgres</Pill>
              <Pill tone="amber">Vancouver local time</Pill>
              <Pill>read-only analysis</Pill>
            </div>
            <h1 className="text-4xl font-semibold text-slate-950 sm:text-5xl">Emergency wait-time intelligence</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
              A working operations dashboard for facility coverage, data quality, current pressure, volatility, and common healthcare analytics signals.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-950">Data window</div>
            <div className="mt-1">{dataWindow}</div>
            <div className="mt-3 font-semibold text-slate-950">Latest source reading</div>
            <div className="mt-1">{fmtDate(data.observedRange?.last_source_reading)} PT</div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Facilities tracked" value={fmtNumber(locationCount)} detail={`${quality?.locations_with_readings ?? 0} locations produced wait readings`} accent="bg-cyan-500" />
          <MetricCard label="Readings captured" value={fmtNumber(readings)} detail={`${percent(quality?.with_wait_minutes ?? 0, quality?.readings ?? 0)} include wait minutes`} accent="bg-teal-500" />
          <MetricCard label="Poll archive" value={fmtNumber(polls)} detail={data.pollCadence?.polls ? `Median cadence ${fmtNumber(data.pollCadence.median_seconds_between_polls, 1)} seconds` : "Archive table not present"} accent="bg-amber-500" />
          <MetricCard label="Freshness" value={`${fmtNumber(data.freshness?.median_minutes_source_lag, 1)}m`} detail={`P95 source lag ${fmtNumber(data.freshness?.p95_minutes_source_lag, 1)} minutes`} accent="bg-rose-500" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-950">Executive readout</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="border-l-4 border-rose-500 pl-4">
                <p className="text-sm font-semibold text-slate-500">Current highest pressure</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{latestCurrent?.name ?? "n/a"}</p>
                <p className="mt-1 text-sm text-slate-600">Latest wait {fmtWait(latestCurrent?.wait_time_minutes)} at {fmtDate(latestCurrent?.observed_at)} PT</p>
              </div>
              <div className="border-l-4 border-cyan-500 pl-4">
                <p className="text-sm font-semibold text-slate-500">Highest sustained average</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{highestAvg?.name ?? "n/a"}</p>
                <p className="mt-1 text-sm text-slate-600">Average {fmtWait(highestAvg?.avg_wait)}, median {fmtWait(highestAvg?.median_wait)}</p>
              </div>
              <div className="border-l-4 border-amber-500 pl-4">
                <p className="text-sm font-semibold text-slate-500">ED access gap</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{fmtWait(edPremium)} longer median</p>
                <p className="mt-1 text-sm text-slate-600">ED median {fmtWait(ed?.median_wait)} vs UPCC median {fmtWait(upcc?.median_wait)}</p>
              </div>
              <div className="border-l-4 border-teal-500 pl-4">
                <p className="text-sm font-semibold text-slate-500">Coverage note</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{data.noReadings.length} no-wait locations</p>
                <p className="mt-1 text-sm text-slate-600">Most are configured with wait times hidden, so this looks structural.</p>
              </div>
            </div>
          </div>
          <ComparisonBars rows={data.byType} />
        </section>

        <DashboardCharts
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

        <section className="grid gap-8 xl:grid-cols-2">
          <DataTable title="Current pressure" subtitle="Latest reading per facility, sorted by wait time.">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-5 py-3">Facility</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Wait</th><th className="px-5 py-3">ELOS</th><th className="px-5 py-3">Observed</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.current.slice(0, 12).map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-950">{row.name}</td>
                    <td className="px-5 py-3"><Pill tone={row.type === "ed" ? "rose" : "cyan"}>{row.type}</Pill></td>
                    <td className="px-5 py-3 font-semibold">{fmtWait(row.wait_time_minutes)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.elos_minutes)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(row.observed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <DataTable title="Above-baseline signals" subtitle="Simple z-score screen: current wait versus each site's own short history.">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-5 py-3">Facility</th><th className="px-5 py-3">Current</th><th className="px-5 py-3">Avg</th><th className="px-5 py-3">Delta</th><th className="px-5 py-3">Z</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.alerts.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-950">{row.name}</td>
                    <td className="px-5 py-3 font-semibold">{fmtWait(row.current_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.avg_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">+{fmtWait(row.delta_from_avg)}</td>
                    <td className="px-5 py-3"><Pill tone={(row.z_score ?? 0) > 2 ? "rose" : "amber"}>{fmtNumber(row.z_score, 2)}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>

        <section className="grid gap-8 xl:grid-cols-2">
          <DataTable title="Sustained high waits" subtitle="Facilities with at least 50 readings, ranked by average wait.">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-5 py-3">Facility</th><th className="px-5 py-3">Avg</th><th className="px-5 py-3">Median</th><th className="px-5 py-3">P90</th><th className="px-5 py-3">Max</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.highestAverage.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-950">{row.name}</td>
                    <td className="px-5 py-3 font-semibold">{fmtWait(row.avg_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.median_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.p90_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.max_wait)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <DataTable title="Volatility" subtitle="High standard deviation means the facility swings a lot; alerts need site-specific baselines.">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th className="px-5 py-3">Facility</th><th className="px-5 py-3">Std dev</th><th className="px-5 py-3">Avg</th><th className="px-5 py-3">Median</th><th className="px-5 py-3">Readings</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.mostVolatile.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-950">{row.name}</td>
                    <td className="px-5 py-3 font-semibold">{fmtWait(row.stddev_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.avg_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtWait(row.median_wait)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtNumber(row.readings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {[
            ["Use rolling windows", "Track 15m, 1h, 4h, and 24h rolling medians. Healthcare operations dashboards usually avoid acting on a single noisy point."],
            ["Prefer median and p90", "Averages are easy to explain but hide tail risk. P90 is the better public-pressure and staffing signal."],
            ["Separate structural gaps", "Locations with wait times hidden should be excluded from availability metrics and shown as a metadata state, not missing data."],
            ["Baseline per site", "Each facility has its own normal range. Site-specific z-scores or quantile bands are better than one global threshold."],
            ["Alert on persistence", "Page or notify only when a threshold holds for two or three consecutive polls. This reduces false alarms."],
            ["Keep raw payloads", "Your raw_polls table is the right move. It supports replay, schema drift detection, and auditability."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </section>

        <DataTable title="Locations without wait readings" subtitle="These are useful for data quality and product-state checks.">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3">Facility</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Show wait times</th><th className="px-5 py-3">Fallback</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.noReadings.map((row) => (
                <tr key={row.name} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-950">{row.name}</td>
                  <td className="px-5 py-3"><Pill tone={row.type === "ed" ? "rose" : "cyan"}>{row.type}</Pill></td>
                  <td className="px-5 py-3 text-slate-600">{row.show_wait_times ? "yes" : "no"}</td>
                  <td className="px-5 py-3 text-slate-600">{row.wait_time_fallback ?? "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>
    </main>
  );
}
