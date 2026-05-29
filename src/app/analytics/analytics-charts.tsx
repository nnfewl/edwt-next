"use client";

import type { ReactNode } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveScatterPlot } from "@nivo/scatterplot";

type MaybeNumber = number | null;

type TrendPoint = {
  bucket: string;
  avgWait: MaybeNumber;
  medianWait: MaybeNumber;
  p90Wait: MaybeNumber;
};

type CurrentPoint = {
  name: string;
  type: string;
  wait: MaybeNumber;
};

type DistributionPoint = {
  bucket: string;
  readings: number;
};

type HeatmapPoint = {
  name: string;
  hour: number;
  avgWait: MaybeNumber;
};

type FacilityRiskPoint = {
  name: string;
  type: string;
  readings: number;
  currentWait: MaybeNumber;
  avgWait: MaybeNumber;
  medianWait: MaybeNumber;
  p90Wait: MaybeNumber;
  stddevWait: MaybeNumber;
};

type TypeTrendPoint = {
  bucket: string;
  type: string;
  medianWait: MaybeNumber;
  p90Wait: MaybeNumber;
  readings: number;
};

type CoveragePoint = {
  name: string;
  type: string;
  readings: number;
  hoursCovered: MaybeNumber;
  freshnessMinutes: MaybeNumber;
};

type Props = {
  trend: TrendPoint[];
  current: CurrentPoint[];
  distribution: DistributionPoint[];
  heatmap: HeatmapPoint[];
  facilityRisk: FacilityRiskPoint[];
  typeTrend: TypeTrendPoint[];
  coverage: CoveragePoint[];
};

const colors = {
  ink: "#1a1d1b",
  ink2: "#3b403d",
  muted: "#757a75",
  line: "#e2e8f0",
  grid: "#edf1f5",
  surface: "#ffffff",
  teal: "#0f766e",
  tealSoft: "#dff3ef",
  green: "#16a34a",
  sky: "#38bdf8",
  amber: "#d97706",
  coral: "#dc6d55",
  rose: "#be123c",
  red: "#991b1b",
  blue: "#2563eb",
  violet: "#7c3aed",
};

const theme = {
  background: "transparent",
  fontFamily: "var(--font-manrope), Manrope, system-ui, sans-serif",
  text: { fill: colors.muted, fontSize: 12 },
  axis: {
    domain: { line: { stroke: "transparent" } },
    ticks: { line: { stroke: "transparent" }, text: { fill: colors.muted, fontSize: 11 } },
    legend: { text: { fill: colors.ink2, fontSize: 12, fontWeight: 700 } },
  },
  grid: { line: { stroke: colors.grid, strokeDasharray: "4 5" } },
  legends: { text: { fill: colors.ink2, fontSize: 12 } },
  labels: { text: { fontWeight: 700 } },
  tooltip: {
    container: {
      background: colors.surface,
      color: colors.ink,
      borderRadius: 10,
      boxShadow: "0 18px 44px rgba(26, 29, 27, 0.14)",
      border: `1px solid ${colors.line}`,
      fontSize: 12,
    },
  },
};

function hourLabel(hour: number) {
  const suffix = hour < 12 ? "a" : "p";
  const normalized = hour % 12 || 12;
  return `${normalized}${suffix}`;
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Vancouver",
    month: "short",
    day: "numeric",
    hour: "numeric",
  }).format(new Date(value));
}

function minutes(value: MaybeNumber | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  if (value >= 60) return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  return `${Math.round(value)}m`;
}

function axisMinutes(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (numeric === 0) return "0";
  if (numeric >= 60) return numeric % 60 === 0 ? `${Math.round(numeric / 60)}h` : `${Math.floor(numeric / 60)}h ${Math.round(numeric % 60)}m`;
  return `${Math.round(numeric)}m`;
}

function signedAxisMinutes(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (numeric === 0) return "0";
  const sign = numeric > 0 ? "+" : "-";
  return sign + axisMinutes(Math.abs(numeric));
}

function compactNumber(value: number | string) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

function pressureColor(wait: MaybeNumber | undefined) {
  const value = wait ?? 0;
  if (value >= 360) return colors.red;
  if (value >= 240) return colors.rose;
  if (value >= 180) return colors.coral;
  if (value >= 120) return colors.amber;
  if (value >= 60) return colors.green;
  return colors.sky;
}

function facilityShortName(name: string) {
  return name
    .replace(" Hospital", "")
    .replace("Health Care Centre", "HCC")
    .replace("Urgent and Primary Care Centre", "UPCC")
    .replace("Centre", "Ctr");
}

function sparseTicks<T>(items: T[], desired = 6) {
  const unique = Array.from(new Set(items));
  const step = Math.max(1, Math.ceil(unique.length / desired));
  return unique.filter((_, index) => index % step === 0);
}

function ChartShell({
  title,
  eyebrow,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={wide ? "analytics-chart-card analytics-chart-card-wide" : "analytics-chart-card"}>
      <div className="analytics-chart-head">
        <p className="analytics-eyebrow">Chart</p>
        <h2>{title}</h2>
        <p>{eyebrow}</p>
      </div>
      {children}
    </section>
  );
}

function Tooltip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="analytics-chart-tooltip">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

function DumbbellChart({ rows }: { rows: Array<{ facility: string; delta: number; current: number; median: number; color: string }> }) {
  const maxWait = Math.max(60, ...rows.flatMap((row) => [row.current, row.median]));
  const axisMax = Math.ceil(maxWait / 60) * 60;
  const hourlyTicks = Array.from({ length: axisMax / 60 + 1 }, (_, index) => index * 60);
  const ticks = hourlyTicks.length <= 11 ? hourlyTicks : hourlyTicks.filter((tick, index) => index % 2 === 0 || tick === axisMax);

  return (
    <div className="analytics-dumbbell-scroll">
      <div className="analytics-dumbbell">
        <div className="analytics-dumbbell-axis">
          <div />
          <div className="analytics-dumbbell-axis-line">
            {ticks.map((tick) => (
              <span key={tick} style={{ left: `${(tick / axisMax) * 100}%` }}>{axisMinutes(tick)}</span>
            ))}
          </div>
          <div>change</div>
        </div>
        <div className="analytics-dumbbell-rows">
          {rows.map((row) => {
            const medianLeft = (row.median / axisMax) * 100;
            const currentLeft = (row.current / axisMax) * 100;
            const start = Math.min(medianLeft, currentLeft);
            const width = Math.abs(currentLeft - medianLeft);
            return (
              <div className="analytics-dumbbell-row" key={row.facility}>
                <div className="analytics-dumbbell-name">{row.facility}</div>
                <div className="analytics-dumbbell-track">
                  <span className="analytics-dumbbell-base" />
                  <span className="analytics-dumbbell-band" style={{ left: `${start}%`, width: `${Math.max(width, 1)}%` }} />
                  <span className="analytics-dumbbell-median" style={{ left: `${medianLeft}%` }} title={`Usual median ${minutes(row.median)}`} />
                  <span className="analytics-dumbbell-current" style={{ left: `${currentLeft}%`, backgroundColor: row.color }} title={`Current ${minutes(row.current)}`} />
                </div>
                <div className={row.delta >= 0 ? "analytics-dumbbell-delta is-up" : "analytics-dumbbell-delta is-down"}>
                  {signedAxisMinutes(row.delta)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="analytics-legend-inline analytics-dumbbell-legend">
          <span><i className="analytics-dot analytics-dot-usual" />usual median</span>
          <span><i className="analytics-dot analytics-dot-current" />current wait</span>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsCharts({ current, distribution, heatmap, facilityRisk, typeTrend, coverage }: Props) {
  const waitTicks = [0, 60, 120, 180, 240, 300, 360, 480, 600];
  const trendWaitTicks = [0, 60, 120, 180, 240, 300, 360, 420, 480];
  const sustainedWaitTicks = [0, 60, 120, 180, 240, 300, 360, 420, 480, 600];

  const currentRanking = current
    .filter((point) => point.wait !== null)
    .slice(0, 14)
    .map((point) => ({
      facility: facilityShortName(point.name),
      wait: point.wait ?? 0,
      color: pressureColor(point.wait),
    }));

  const typeTrendTicks = sparseTicks(typeTrend.map((point) => shortTime(point.bucket)), 5);
  const typeTrendSeries = [
    { id: "ED median", type: "ed", metric: "median" },
    { id: "ED p90", type: "ed", metric: "p90" },
    { id: "UPCC median", type: "upcc", metric: "median" },
    { id: "UPCC p90", type: "upcc", metric: "p90" },
  ].map((series) => ({
    id: series.id,
    data: typeTrend
      .filter((point) => point.type === series.type)
      .map((point) => ({
        x: shortTime(point.bucket),
        y: series.metric === "median" ? point.medianWait ?? 0 : point.p90Wait ?? 0,
      })),
  }));

  const sustained = facilityRisk
    .filter((point) => point.readings >= 100)
    .sort((a, b) => (b.p90Wait ?? 0) - (a.p90Wait ?? 0))
    .slice(0, 14)
    .map((point) => ({
      facility: facilityShortName(point.name),
      median: point.medianWait ?? 0,
      p90: point.p90Wait ?? 0,
    }));

  const currentVsUsual = facilityRisk
    .filter((point) => point.currentWait !== null && point.medianWait !== null && point.readings >= 100)
    .map((point) => ({
      facility: facilityShortName(point.name),
      delta: Math.round((point.currentWait ?? 0) - (point.medianWait ?? 0)),
      current: point.currentWait ?? 0,
      median: point.medianWait ?? 0,
      color: (point.currentWait ?? 0) >= (point.medianWait ?? 0) ? pressureColor(point.currentWait) : colors.blue,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 12);

  const riskMatrix = ["ed", "upcc"].map((type) => ({
    id: type.toUpperCase(),
    data: facilityRisk
      .filter((point) => point.type === type && point.readings >= 100)
      .map((point) => ({
        x: point.medianWait ?? 0,
        y: point.p90Wait ?? 0,
        size: Math.max(8, Math.min(28, Math.sqrt(point.readings) * 1.1)),
        name: point.name,
        readings: point.readings,
      })),
  }));

  const distributionData = distribution.map((point) => ({ bucket: point.bucket, readings: point.readings }));

  const heatmapNames = Array.from(new Set(heatmap.map((point) => point.name)));
  const heatmapData = heatmapNames.map((name) => ({
    id: facilityShortName(name),
    data: Array.from({ length: 24 }, (_, hour) => {
      const found = heatmap.find((point) => point.name === name && point.hour === hour);
      return { x: hourLabel(hour), y: found?.avgWait ?? null };
    }),
  }));

  const coverageData = coverage
    .filter((point) => point.readings > 0)
    .slice(0, 18)
    .map((point) => ({
      facility: facilityShortName(point.name),
      readings: point.readings,
      color: point.readings >= 1000 ? colors.teal : point.readings >= 500 ? colors.amber : colors.coral,
    }));

  return (
    <div className="analytics-charts">
      <section className="analytics-chart-grid analytics-chart-grid-featured">
        <ChartShell title="Current access pressure" eyebrow="Longest current waits, severity-colored by threshold.">
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-tall">
              <ResponsiveBar
                data={currentRanking}
                keys={["wait"]}
                indexBy="facility"
                layout="horizontal"
                theme={theme}
                margin={{ top: 8, right: 28, bottom: 42, left: 140 }}
                padding={0.24}
                colors={({ data }) => String(data.color)}
                borderRadius={6}
                axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: waitTicks, legend: "current wait", legendOffset: 34, format: axisMinutes }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                label={(bar) => minutes(Number(bar.value))}
                labelSkipWidth={46}
                labelTextColor={colors.ink}
                enableGridY={false}
                tooltip={({ data }) => <Tooltip title={String(data.facility)}>Current wait: {minutes(Number(data.wait))}</Tooltip>}
              />
            </div>
          </div>
          <div className="analytics-legend-inline">
            <span><i style={{ backgroundColor: colors.sky }} />under 1h</span>
            <span><i style={{ backgroundColor: colors.amber }} />2h+</span>
            <span><i style={{ backgroundColor: colors.rose }} />4h+</span>
            <span><i style={{ backgroundColor: colors.red }} />6h+</span>
          </div>
        </ChartShell>

        <ChartShell title="ED vs UPCC trend" eyebrow="Median and p90 by care type, shown separately for clearer tail risk.">
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-tall analytics-chart-frame-wide">
              <ResponsiveLine
                data={typeTrendSeries}
                theme={theme}
                colors={({ id }) => {
                  if (id === "ED p90") return colors.rose;
                  if (id === "ED median") return colors.coral;
                  if (id === "UPCC p90") return colors.violet;
                  return colors.teal;
                }}
                margin={{ top: 28, right: 28, bottom: 58, left: 54 }}
                xScale={{ type: "point" }}
                yScale={{ type: "linear", min: 0, stacked: false, reverse: false }}
                curve="monotoneX"
                axisBottom={{ tickRotation: -20, tickSize: 0, tickPadding: 12, tickValues: typeTrendTicks }}
                axisLeft={{ tickSize: 0, tickPadding: 10, tickValues: trendWaitTicks, legend: "wait", legendOffset: -42, format: axisMinutes }}
                enablePoints={false}
                lineWidth={3}
                useMesh
                legends={[{ anchor: "top-left", direction: "row", translateY: -22, itemWidth: 110, itemHeight: 18, symbolSize: 10 }]}
              />
            </div>
          </div>
        </ChartShell>
      </section>

      <section className="analytics-chart-grid">
        <ChartShell title="Sustained facility pressure" eyebrow="Facilities ranked by p90 wait. Median shows typical pressure; p90 shows bad-day pressure.">
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-tall">
              <ResponsiveBar
                data={sustained}
                keys={["median", "p90"]}
                indexBy="facility"
                layout="horizontal"
                groupMode="grouped"
                theme={theme}
                margin={{ top: 28, right: 28, bottom: 48, left: 150 }}
                padding={0.22}
                innerPadding={3}
                colors={[colors.teal, colors.violet]}
                borderRadius={5}
                axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: sustainedWaitTicks, legend: "wait", legendOffset: 34, format: axisMinutes }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                legends={[{ dataFrom: "keys", anchor: "top-left", direction: "row", translateY: -28, itemWidth: 90, itemHeight: 18, symbolSize: 10 }]}
                labelSkipWidth={54}
                label={(bar) => minutes(Number(bar.value))}
                labelTextColor={colors.ink}
              />
            </div>
          </div>
        </ChartShell>

        <ChartShell title="Current vs usual" eyebrow="Grey dot is site median; colored dot is current wait. The line shows the gap.">
          <DumbbellChart rows={currentVsUsual} />
        </ChartShell>
      </section>

      <section className="analytics-chart-grid">
        <ChartShell title="Tail-risk map" eyebrow="Median vs p90 by facility. Upper-right sites are typically slow and painful in the tail.">
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-medium analytics-chart-frame-wide">
              <ResponsiveScatterPlot
                data={riskMatrix}
                theme={theme}
                margin={{ top: 18, right: 28, bottom: 58, left: 68 }}
                xScale={{ type: "linear", min: 0, max: "auto" }}
                yScale={{ type: "linear", min: 0, max: "auto" }}
                colors={[colors.coral, colors.violet]}
                blendMode="multiply"
                nodeSize={(node) => Number(node.data.size)}
                axisBottom={{ tickSize: 0, tickPadding: 10, tickValues: sustainedWaitTicks, legend: "median wait", legendOffset: 42, format: axisMinutes }}
                axisLeft={{ tickSize: 0, tickPadding: 10, tickValues: sustainedWaitTicks, legend: "p90 wait", legendOffset: -54, format: axisMinutes }}
                useMesh
                legends={[{ anchor: "top-left", direction: "row", translateY: -12, itemWidth: 80, itemHeight: 18, symbolSize: 10 }]}
                tooltip={({ node }) => (
                  <Tooltip title={String(node.data.name)}>
                    Median {minutes(Number(node.data.x))} / P90 {minutes(Number(node.data.y))}<br />
                    {Number(node.data.readings).toLocaleString()} readings
                  </Tooltip>
                )}
              />
            </div>
          </div>
        </ChartShell>

        <ChartShell title="Wait distribution" eyebrow="How many readings land in each bucket, useful for long-tail pressure checks.">
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-medium">
              <ResponsiveBar
                data={distributionData}
                keys={["readings"]}
                indexBy="bucket"
                theme={theme}
                margin={{ top: 12, right: 24, bottom: 46, left: 58 }}
                padding={0.22}
                colors={({ index }) => [colors.sky, colors.teal, colors.amber, colors.coral, colors.rose, colors.red][index] ?? colors.muted}
                borderRadius={6}
                axisBottom={{ tickSize: 0, tickPadding: 10 }}
                axisLeft={{ tickSize: 0, tickPadding: 10, legend: "readings", legendOffset: -46, format: compactNumber }}
                labelSkipHeight={18}
                labelTextColor={colors.ink}
              />
            </div>
          </div>
        </ChartShell>
      </section>

      <section className="analytics-chart-grid analytics-chart-grid-featured">
        <ChartShell title="Facility-hour pattern" eyebrow="Top sustained-pressure facilities by local hour. Darker means higher average wait." wide>
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-tall analytics-chart-frame-extra-wide">
              <ResponsiveHeatMap
                data={heatmapData}
                theme={theme}
                margin={{ top: 18, right: 20, bottom: 56, left: 168 }}
                valueFormat={(value) => minutes(Number(value))}
                axisTop={null}
                axisRight={null}
                axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -35, tickValues: ["12a", "4a", "8a", "12p", "4p", "8p"] }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                colors={{ type: "sequential", scheme: "reds" }}
                emptyColor="#f3f4f1"
                borderRadius={2}
                borderWidth={1}
                borderColor="#ffffff"
                enableLabels={false}
                hoverTarget="cell"
              />
            </div>
          </div>
        </ChartShell>

        <ChartShell title="Coverage volume" eyebrow="Readings per facility. Low-volume facilities should be interpreted cautiously.">
          <div className="analytics-chart-scroll">
            <div className="analytics-chart-frame analytics-chart-frame-tall">
              <ResponsiveBar
                data={coverageData}
                keys={["readings"]}
                indexBy="facility"
                layout="horizontal"
                theme={theme}
                margin={{ top: 8, right: 24, bottom: 42, left: 142 }}
                padding={0.24}
                colors={({ data }) => String(data.color)}
                borderRadius={5}
                axisBottom={{ tickSize: 0, tickPadding: 8, legend: "readings", legendOffset: 34, format: compactNumber }}
                axisLeft={{ tickSize: 0, tickPadding: 8 }}
                labelSkipWidth={42}
                label={(bar) => compactNumber(Number(bar.value))}
                labelTextColor={colors.ink}
              />
            </div>
          </div>
        </ChartShell>
      </section>
    </div>
  );
}
