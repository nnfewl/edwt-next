import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicFacilities } from "../facilities-db";
import { AppTopBar } from "../app-topbar";
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

const sourceUrl = process.env.EDWT_SOURCE_URL ?? "https://www.edwaittimes.ca/api/wait-times";
const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type AnalyticsResult = { data?: AnalyticsData; error?: string };
const ANALYTICS_CACHE_TTL_MS = 30_000;
let analyticsCache: { at: number; result: AnalyticsResult } | null = null;
let analyticsInflight: Promise<AnalyticsResult> | null = null;

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function analyticsType(type: string) {
  return type === "UPCC" ? "upcc" : "ed";
}

async function queryAnalytics(): Promise<AnalyticsResult> {
  const startedAt = Date.now();
  console.log("[analytics] facility snapshot query start");

  try {
    const facilities = await getPublicFacilities();
    console.log("[analytics] facility snapshot query done", { ms: Date.now() - startedAt, facilities: facilities.length });

    const waitFacilities = facilities.filter((facility) => facility.waitMin !== null);
    const groupedTypes = ["ed", "upcc"].map((type) => {
      const typeFacilities = facilities.filter((facility) => analyticsType(facility.type) === type);
      const waits = typeFacilities
        .map((facility) => facility.waitMin)
        .filter((value): value is number => value !== null);
      return {
        type,
        locations: typeFacilities.length,
        readings: waits.length,
        avg_wait: waits.length ? waits.reduce((sum, value) => sum + value, 0) / waits.length : null,
        median_wait: median(waits),
        p90_wait: percentile(waits, 0.9),
        max_wait: waits.length ? Math.max(...waits) : null,
      } satisfies TypeSummary;
    });

    const current = facilities
      .map((facility) => ({
        name: facility.name,
        type: analyticsType(facility.type),
        observed_at: null,
        reading_created_at: null,
        wait_time_minutes: facility.waitMin,
        elos_minutes: null,
        status: facility.open ? "open" : "closed",
      }))
      .sort((a, b) => (b.wait_time_minutes ?? -1) - (a.wait_time_minutes ?? -1));

    const facilitySummaries = waitFacilities
      .map((facility) => ({
        name: facility.name,
        type: analyticsType(facility.type),
        readings: 1,
        first_observed: null,
        last_observed: null,
        avg_wait: facility.waitMin,
        median_wait: facility.waitMin,
        p90_wait: facility.waitMin,
        max_wait: facility.waitMin,
        stddev_wait: null,
      }))
      .sort((a, b) => (b.avg_wait ?? 0) - (a.avg_wait ?? 0));

    return {
      data: {
        tables: [
          { table_name: "locations", rows: facilities.length },
          { table_name: "raw_polls", rows: 0 },
          { table_name: "wait_time_readings", rows: waitFacilities.length },
        ],
        observedRange: { first_observed: null, last_observed: null, first_source_reading: null, last_source_reading: null },
        quality: {
          readings: facilities.length,
          with_wait_minutes: waitFacilities.length,
          with_elos_minutes: 0,
          with_source_timestamp: 0,
          locations_with_readings: waitFacilities.length,
        },
        pollCadence: { polls: 0, first_poll: null, last_poll: null, avg_seconds_between_polls: null, median_seconds_between_polls: null, max_seconds_between_polls: null },
        freshness: { readings: 0, avg_minutes_source_lag: null, median_minutes_source_lag: null, p95_minutes_source_lag: null, max_minutes_source_lag: null },
        byType: groupedTypes,
        current,
        highestAverage: facilitySummaries.slice(0, 12),
        mostVolatile: [],
        hourly: [],
        trend: [],
        distribution: [],
        heatmap: [],
        facilityRisk: [],
        rankFlow: [],
        typeTrend: [],
        coverage: facilities.map((facility) => ({
          name: facility.name,
          type: analyticsType(facility.type),
          readings: facility.waitMin === null ? 0 : 1,
          hours_covered: null,
          freshness_minutes: null,
        })),
        alerts: [],
        noReadings: facilities
          .filter((facility) => facility.waitMin === null)
          .map((facility) => ({
            name: facility.name,
            type: analyticsType(facility.type),
            show_wait_times: null,
            show_status: null,
            wait_time_fallback: facility.waitText,
          })),
      },
    };
  } catch (error) {
    console.error("[analytics] facility snapshot query failed", error);
    return { error: error instanceof Error ? error.message : "Unknown database error" };
  }
}

// Hard ceiling so the page can never hang: if the queries don't resolve in
// time, return an error result and let the page render its error panel instead
// of loading forever. Sits just under the function's maxDuration budget.
const ANALYTICS_DEADLINE_MS = 30_000;

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

function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "n/a";
  return localFormatter.format(new Date(value));
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

function TypeComparison({ rows }: { rows: TypeSummary[] }) {
  const max = Math.max(...rows.map((row) => row.p90_wait ?? 0), 1);

  return (
    <section className="analytics-panel analytics-type-card">
      <div className="analytics-section-head">
        <p className="analytics-eyebrow">Care type</p>
        <h2>ED vs UPCC</h2>
        <p>Median wait time and P90 wait time stay separate so tail pressure does not disappear inside an average.</p>
      </div>
      <div className="analytics-type-bars">
        {rows.map((row) => (
          <div className="analytics-type-row" key={row.type}>
            <div className="analytics-type-row-head">
              <TypePill type={row.type} />
              <span>Median wait time {fmtWait(row.median_wait)} / P90 wait time {fmtWait(row.p90_wait)}</span>
            </div>
            <div className="analytics-bar-track" aria-label={`${typeLabel(row.type)} median wait time ${fmtWait(row.median_wait)}`}>
              <span className="analytics-bar-fill analytics-bar-median" style={{ width: `${Math.max(((row.median_wait ?? 0) / max) * 100, 2)}%` }} />
            </div>
            <div className="analytics-bar-track" aria-label={`${typeLabel(row.type)} P90 wait time ${fmtWait(row.p90_wait)}`}>
              <span className="analytics-bar-fill analytics-bar-p90" style={{ width: `${Math.max(((row.p90_wait ?? 0) / max) * 100, 2)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="analytics-legend-inline">
        <span><i className="analytics-dot analytics-dot-median" />Median wait time</span>
        <span><i className="analytics-dot analytics-dot-p90" />P90 wait time</span>
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

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  console.log("[analytics] page render start", new Date().toISOString());

  // STEP 1: direct /analytics must render without touching Postgres. Use
  // /analytics?data=1 for the next iteration when re-enabling DB reads.
  if (params.data !== "1") {
    console.log("[analytics] shell-only mode — skipping all DB queries");
    return (
      <div className="analytics-root">
        <AppTopBar active="analytics" />
        <main className="analytics-page">
          <section className="analytics-error-panel">
            <p className="analytics-eyebrow">Analytics</p>
            <h1>Analytics page is loading without data.</h1>
            <p>The route rendered successfully without database queries. Data panels are temporarily disabled while production access is verified.</p>
            <Link href="/" className="analytics-button">Back to facilities</Link>
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
        <AppTopBar active="analytics" />
        <AutoRefresh intervalMs={300_000} />
        <main className="analytics-page">
          <section className="analytics-error-panel">
            <p className="analytics-eyebrow">Database unavailable</p>
            <h1>The analytics page could not read Postgres.</h1>
            <p>Check <code>DATABASE_URL</code> or the environment file used to start Next, then refresh this page.</p>
            <Link href="/" className="analytics-button">Back to facilities</Link>
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
  const dataWindow = `${fmtDate(data.observedRange?.first_observed)} to ${fmtDate(data.observedRange?.last_observed)} PT`;
  const edPremium = ed?.median_wait != null && upcc?.median_wait != null ? ed.median_wait - upcc.median_wait : null;

  return (
    <div className="analytics-root">
      <AppTopBar active="analytics" />
      <AutoRefresh intervalMs={300_000} />
      <main className="analytics-page">
        <section className="analytics-hero">
          <div className="analytics-hero-copy">
            <div className="analytics-kicker"><span aria-hidden="true" /> Live wait-time analytics</div>
            <h1>Wait-time analytics</h1>
            <p>
              A system-level view of current pressure, sustained risk, coverage quality, and care-type trends across tracked facilities.
            </p>
          </div>
          <aside className="analytics-window" aria-label="Data window">
            <div>
              <span>Data window</span>
              <strong>{dataWindow}</strong>
            </div>
            <div>
              <span>Latest source reading</span>
              <strong>{fmtDate(data.observedRange?.last_source_reading)} PT</strong>
            </div>
            <div>
              <span>Data source</span>
              <strong><a className="analytics-source-link" href={sourceUrl} target="_blank" rel="noreferrer">edwaittimes.ca API</a></strong>
              <small>Queried through the same shared DB client used by the public facilities and map pages.</small>
            </div>
          </aside>
        </section>

        <section className="analytics-metrics" aria-label="Analytics summary">
          <MetricCard label="Facilities tracked" value={fmtNumber(locationCount)} detail={`${quality?.locations_with_readings ?? 0} locations produced wait-time readings`} tone="teal" />
          <MetricCard label="Readings captured" value={fmtNumber(readings)} detail={`${percent(quality?.with_wait_minutes ?? 0, quality?.readings ?? 0)} include wait-time minutes`} tone="green" />
          <MetricCard label="Poll archive" value={fmtNumber(polls)} detail={data.pollCadence?.polls ? `Median cadence ${fmtNumber(data.pollCadence.median_seconds_between_polls, 1)} seconds` : "Archive table not present"} tone="amber" />
          <MetricCard label="Freshness" value={`${fmtNumber(data.freshness?.median_minutes_source_lag, 1)}m`} detail={`P95 source lag ${fmtNumber(data.freshness?.p95_minutes_source_lag, 1)} minutes`} tone="coral" />
        </section>

        <section className="analytics-grid analytics-grid-readout">
          <section className="analytics-panel analytics-readout">
            <div className="analytics-section-head">
              <p className="analytics-eyebrow">Executive readout</p>
              <h2>What needs attention now</h2>
              <p>Fast scan of current wait-time pressure, sustained averages, and structural data gaps.</p>
            </div>
            <div className="analytics-insight-grid">
              <InsightCard
                label="Current highest pressure"
                value={latestCurrent?.name ?? "n/a"}
                detail={`Latest wait time ${fmtWait(latestCurrent?.wait_time_minutes)} at ${fmtDate(latestCurrent?.observed_at)} PT`}
                tone="coral"
              />
              <InsightCard
                label="Highest sustained average"
                value={highestAvg?.name ?? "n/a"}
                detail={`Average wait time ${fmtWait(highestAvg?.avg_wait)}, median wait time ${fmtWait(highestAvg?.median_wait)}`}
                tone="teal"
              />
              <InsightCard
                label="ED access gap"
                value={edPremium == null ? "n/a" : `${fmtWait(edPremium)} longer median wait time`}
                detail={`ED median wait time ${fmtWait(ed?.median_wait)} vs UPCC median wait time ${fmtWait(upcc?.median_wait)}`}
                tone="amber"
              />
              <InsightCard
                label="Coverage note"
                value={`${data.noReadings.length} locations without wait-time readings`}
                detail="Most are configured with wait-time display hidden, so treat this as product state rather than missing telemetry."
                tone="green"
              />
            </div>
          </section>
          <TypeComparison rows={data.byType} />
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
          <DataTable title="Current wait-time pressure" subtitle="Latest reading per facility, sorted by wait time.">
            <table>
              <thead>
                <tr><th>Facility</th><th>Type</th><th>Wait time</th><th>Estimated length of stay</th><th>Observed</th></tr>
              </thead>
              <tbody>
                {data.current.slice(0, 12).map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td><TypePill type={row.type} /></td>
                    <td><strong>{fmtWait(row.wait_time_minutes)}</strong></td>
                    <td>{fmtWait(row.elos_minutes)}</td>
                    <td>{fmtDate(row.observed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>

          <DataTable title="Above-baseline signals" subtitle="Current wait time versus each site's own short history.">
            {data.alerts.length ? (
              <table>
                <thead>
                  <tr><th>Facility</th><th>Current wait time</th><th>Average wait time</th><th>Delta from average</th><th>Z-score</th></tr>
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
            ) : <EmptyFallback>No above-baseline signals in the current data window.</EmptyFallback>}
          </DataTable>
        </section>

        <section className="analytics-table-grid">
          <DataTable title="Sustained high wait times" subtitle="Facilities with at least 50 readings, ranked by average wait time.">
            <table>
              <thead>
                <tr><th>Facility</th><th>Average wait time</th><th>Median wait time</th><th>P90 wait time</th><th>Max wait time</th></tr>
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

          <DataTable title="Volatility" subtitle="High standard deviation means the facility swings more than its peers.">
            <table>
              <thead>
                <tr><th>Facility</th><th>Standard deviation</th><th>Average wait time</th><th>Median wait time</th><th>Readings</th></tr>
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
            ["Median wait time and P90 wait time first", "Average wait time is useful, but median wait time and P90 wait time are better for public pressure and tail-risk decisions."],
            ["Baseline per site", "Each facility has its own normal range, so alerts compare current wait times to that site's own history."],
            ["Separate structural gaps", "Locations with hidden wait-time display should be shown as product state, not confused with broken telemetry."],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <DataTable title="Locations without wait-time readings" subtitle="Useful for data quality checks and product-state audits.">
          {data.noReadings.length ? (
            <table>
              <thead>
                <tr><th>Facility</th><th>Type</th><th>Show wait times</th><th>Fallback wait-time text</th></tr>
              </thead>
              <tbody>
                {data.noReadings.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td><TypePill type={row.type} /></td>
                    <td>{row.show_wait_times ? "yes" : "no"}</td>
                    <td>{row.wait_time_fallback ?? "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyFallback>Every tracked location has at least one wait-time reading.</EmptyFallback>}
        </DataTable>
      </main>
    </div>
  );
}
