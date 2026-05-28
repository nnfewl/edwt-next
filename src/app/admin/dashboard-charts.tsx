"use client";

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
  mint: "#2dd4bf",
  cyan: "#06b6d4",
  sky: "#38bdf8",
  blue: "#2563eb",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  coral: "#fb7185",
  rose: "#e11d48",
  red: "#b91c1c",
  darkRed: "#7f1d1d",
  slate: "#475569",
  grid: "#e2e8f0",
};

const theme = {
  background: "transparent",
  text: { fill: "#475569", fontSize: 12 },
  axis: {
    ticks: { line: { stroke: "#cbd5e1" }, text: { fill: "#64748b", fontSize: 11 } },
    legend: { text: { fill: "#334155", fontSize: 12, fontWeight: 600 } },
  },
  grid: { line: { stroke: colors.grid, strokeDasharray: "3 4" } },
  legends: { text: { fill: "#334155", fontSize: 12 } },
  tooltip: {
    container: {
      background: "#ffffff",
      color: "#0f172a",
      borderRadius: 8,
      boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
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
  if (value >= 360) return colors.darkRed;
  if (value >= 300) return colors.red;
  if (value >= 240) return colors.rose;
  if (value >= 180) return colors.coral;
  if (value >= 120) return colors.amber;
  if (value >= 60) return colors.mint;
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

function ChartShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{eyebrow}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DumbbellChart({ rows }: { rows: Array<{ facility: string; delta: number; current: number; median: number; color: string }> }) {
  const maxWait = Math.max(60, ...rows.flatMap((row) => [row.current, row.median]));
  const axisMax = Math.ceil(maxWait / 60) * 60;
  const hourlyTicks = Array.from({ length: axisMax / 60 + 1 }, (_, index) => index * 60);
  const ticks = hourlyTicks.length <= 11 ? hourlyTicks : hourlyTicks.filter((tick, index) => index % 2 === 0 || tick === axisMax);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px]">
        <div className="mb-4 grid grid-cols-[140px_1fr_74px] gap-3 text-xs text-slate-500">
        <div />
        <div className="relative h-5 border-b border-slate-200">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: String((tick / axisMax) * 100) + "%" }}
            >
              {axisMinutes(tick)}
            </span>
          ))}
        </div>
        <div className="text-right">change</div>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const medianLeft = (row.median / axisMax) * 100;
          const currentLeft = (row.current / axisMax) * 100;
          const start = Math.min(medianLeft, currentLeft);
          const width = Math.abs(currentLeft - medianLeft);
          return (
            <div key={row.facility} className="grid grid-cols-[140px_1fr_74px] items-center gap-3">
              <div className="truncate text-sm font-medium text-slate-800">{row.facility}</div>
              <div className="relative h-7 rounded bg-slate-50">
                <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
                <div
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-slate-300 via-slate-200 to-slate-300"
                  style={{ left: String(start) + "%", width: String(Math.max(width, 1)) + "%" }}
                />
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-600 shadow"
                  style={{ left: String(medianLeft) + "%" }}
                  title={"Usual median " + minutes(row.median)}
                />
                <span
                  className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-lg ring-2 ring-slate-100"
                  style={{ left: String(currentLeft) + "%", backgroundColor: row.color }}
                  title={"Current " + minutes(row.current)}
                />
              </div>
              <div className={row.delta >= 0 ? "text-right text-sm font-semibold text-rose-700" : "text-right text-sm font-semibold text-blue-700"}>
                {signedAxisMinutes(row.delta)}
              </div>
            </div>
          );
        })}
      </div>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-slate-500" />usual median</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: colors.coral }} />current wait</span>
        </div>
      </div>
    </div>
  );
}
export function DashboardCharts({ current, distribution, heatmap, facilityRisk, typeTrend, coverage }: Props) {
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
      color: point.readings >= 1000 ? colors.mint : point.readings >= 500 ? colors.amber : colors.rose,
    }));

  return (
    <div className="space-y-8">
      <section className="grid gap-8 xl:grid-cols-[1fr_1.25fr]">
        <ChartShell title="Current access pressure" eyebrow="This is the chart that matters first: who has the longest wait right now, severity-colored by threshold.">
          <div style={{ height: 430 }}>
            <ResponsiveBar
              data={currentRanking}
              keys={["wait"]}
              indexBy="facility"
              layout="horizontal"
              theme={theme}
              margin={{ top: 8, right: 32, bottom: 42, left: 140 }}
              padding={0.24}
              colors={({ data }) => String(data.color)}
              borderRadius={6}
              axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: waitTicks, legend: "current wait", legendOffset: 34, format: axisMinutes }}
              axisLeft={{ tickSize: 0, tickPadding: 8 }}
              label={(bar) => minutes(Number(bar.value))}
              labelSkipWidth={46}
              labelTextColor="#0f172a"
              enableGridY={false}
              tooltip={({ data }) => (
                <div className="rounded-md bg-white px-3 py-2 text-sm shadow-lg">
                  <div className="font-semibold text-slate-950">{data.facility}</div>
                  <div className="text-slate-600">Current wait: {minutes(Number(data.wait))}</div>
                </div>
              )}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.sky }} />under 1h</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.amber }} />2h+</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.rose }} />4h+</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.darkRed }} />6h+</span>
          </div>
        </ChartShell>

        <ChartShell title="ED vs UPCC trend" eyebrow="Median and p90 by care type. This avoids hiding UPCC behavior inside ED volume and shows tail risk clearly.">
          <div style={{ height: 430 }}>
            <ResponsiveLine
              data={typeTrendSeries}
              theme={theme}
              colors={({ id }) => {
                if (id === "ED p90") return colors.rose;
                if (id === "ED median") return colors.coral;
                if (id === "UPCC p90") return colors.indigo;
                return colors.mint;
              }}
              margin={{ top: 24, right: 32, bottom: 58, left: 54 }}
              xScale={{ type: "point" }}
              yScale={{ type: "linear", min: 0, stacked: false, reverse: false }}
              curve="monotoneX"
              axisBottom={{ tickRotation: -20, tickSize: 0, tickPadding: 12, tickValues: typeTrendTicks }}
              axisLeft={{ tickSize: 0, tickPadding: 10, tickValues: trendWaitTicks, legend: "wait", legendOffset: -42, format: axisMinutes }}
              enablePoints={false}
              lineWidth={3}
              useMesh
              legends={[{ anchor: "top-left", direction: "row", translateY: -18, itemWidth: 110, itemHeight: 18, symbolSize: 10 }]}
            />
          </div>
        </ChartShell>
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        <ChartShell title="Sustained facility pressure" eyebrow="Facilities ranked by p90 wait. Median shows typical pressure; p90 shows bad-day pressure.">
          <div style={{ height: 460 }}>
            <ResponsiveBar
              data={sustained}
              keys={["median", "p90"]}
              indexBy="facility"
              layout="horizontal"
              groupMode="grouped"
              theme={theme}
              margin={{ top: 28, right: 32, bottom: 48, left: 150 }}
              padding={0.22}
              innerPadding={3}
              colors={[colors.mint, colors.violet]}
              borderRadius={5}
              axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: sustainedWaitTicks, legend: "wait", legendOffset: 34, format: axisMinutes }}
              axisLeft={{ tickSize: 0, tickPadding: 8 }}
              legends={[{ dataFrom: "keys", anchor: "top-left", direction: "row", translateY: -28, itemWidth: 90, itemHeight: 18, symbolSize: 10 }]}
              labelSkipWidth={54}
              label={(bar) => minutes(Number(bar.value))}
              labelTextColor="#0f172a"
            />
          </div>
        </ChartShell>

        <ChartShell title="Current vs usual" eyebrow="Grey dot is the site median; colored dot is current wait. The connecting line shows the gap without signed-axis weirdness.">
          <DumbbellChart rows={currentVsUsual} />
        </ChartShell>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1fr_1fr]">
        <ChartShell title="Tail-risk map" eyebrow="Median vs p90 by facility. Upper-right sites are both typically slow and painful in the tail.">
          <div style={{ height: 420 }}>
            <ResponsiveScatterPlot
              data={riskMatrix}
              theme={theme}
              margin={{ top: 18, right: 28, bottom: 58, left: 68 }}
              xScale={{ type: "linear", min: 0, max: "auto" }}
              yScale={{ type: "linear", min: 0, max: "auto" }}
              colors={[colors.rose, colors.indigo]}
              blendMode="multiply"
              nodeSize={(node) => Number(node.data.size)}
              axisBottom={{ tickSize: 0, tickPadding: 10, tickValues: sustainedWaitTicks, legend: "median wait", legendOffset: 42, format: axisMinutes }}
              axisLeft={{ tickSize: 0, tickPadding: 10, tickValues: sustainedWaitTicks, legend: "p90 wait", legendOffset: -54, format: axisMinutes }}
              useMesh
              legends={[{ anchor: "top-left", direction: "row", translateY: -12, itemWidth: 80, itemHeight: 18, symbolSize: 10 }]}
              tooltip={({ node }) => (
                <div className="rounded-md bg-white px-3 py-2 text-sm shadow-lg">
                  <div className="font-semibold text-slate-950">{String(node.data.name)}</div>
                  <div className="text-slate-600">Median {minutes(Number(node.data.x))} · P90 {minutes(Number(node.data.y))}</div>
                  <div className="text-slate-600">{Number(node.data.readings).toLocaleString()} readings</div>
                </div>
              )}
            />
          </div>
        </ChartShell>

        <ChartShell title="Wait distribution" eyebrow="How many readings land in each bucket. Useful as a sanity check on long-tail pressure.">
          <div style={{ height: 420 }}>
            <ResponsiveBar
              data={distributionData}
              keys={["readings"]}
              indexBy="bucket"
              theme={theme}
              margin={{ top: 12, right: 24, bottom: 46, left: 58 }}
              padding={0.22}
              colors={({ index }) => [colors.sky, colors.mint, colors.amber, colors.coral, colors.rose, colors.red, colors.darkRed][index] ?? colors.slate}
              borderRadius={6}
              axisBottom={{ tickSize: 0, tickPadding: 10 }}
              axisLeft={{ tickSize: 0, tickPadding: 10, legend: "readings", legendOffset: -46, format: compactNumber }}
              labelSkipHeight={18}
              labelTextColor="#0f172a"
            />
          </div>
        </ChartShell>
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.3fr_0.9fr]">
        <ChartShell title="Facility-hour pattern" eyebrow="Top sustained-pressure facilities by local hour. Darker means higher average wait at that hour.">
          <div style={{ height: 460 }}>
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
              emptyColor="#f1f5f9"
              borderRadius={2}
              borderWidth={1}
              borderColor="#ffffff"
              enableLabels={false}
              hoverTarget="cell"
            />
          </div>
        </ChartShell>

        <ChartShell title="Coverage / sampling volume" eyebrow="Readings per facility. Low-volume facilities should be interpreted more cautiously.">
          <div style={{ height: 460 }}>
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
              labelTextColor="#0f172a"
            />
          </div>
        </ChartShell>
      </section>
    </div>
  );
}
