"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration, ChartType, Plugin } from "chart.js";

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

type XYDatum = { x: number; y: number };
type BubbleDatum = { x: number; y: number; r: number; name: string; readings: number; type: string };
type HeatmapDatum = { x: number; y: number; v: MaybeNumber; name: string; hour: number };

const colors = {
  ink: "#1a1d1b",
  ink2: "#3b403d",
  muted: "#757a75",
  line: "#e2e8f0",
  grid: "#edf1f5",
  surface: "#ffffff",
  teal: "#0f766e",
  green: "#16a34a",
  sky: "#38bdf8",
  cyan: "#0e7490",
  amber: "#d97706",
  coral: "#dc6d55",
  rose: "#be123c",
  red: "#991b1b",
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

function heatColor(value: MaybeNumber | undefined) {
  if (value === null || value === undefined) return "#f3f4f1";
  if (value >= 360) return "#8f2f2b";
  if (value >= 300) return "#b94a45";
  if (value >= 240) return "#d66d5b";
  if (value >= 180) return "#e89b73";
  if (value >= 120) return "#e9c78d";
  if (value >= 60) return "#b8ddd4";
  return "#e4f2ef";
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

const fontFamily = "var(--font-manrope), Manrope, system-ui, sans-serif";

const basePlugins = {
  legend: {
    labels: {
      boxWidth: 9,
      boxHeight: 9,
      color: colors.ink2,
      font: { family: fontFamily, size: 12, weight: 700 },
      usePointStyle: true,
    },
  },
  tooltip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    bodyColor: colors.ink2,
    bodyFont: { family: fontFamily, size: 12 },
    titleColor: colors.ink,
    titleFont: { family: fontFamily, size: 12, weight: 800 },
    padding: 10,
    cornerRadius: 10,
    displayColors: false,
  },
};

const commonScales = {
  grid: {
    color: colors.grid,
    borderDash: [4, 5],
    drawBorder: false,
  },
  ticks: {
    color: colors.muted,
    font: { family: fontFamily, size: 11, weight: 650 },
  },
  title: {
    color: colors.ink2,
    font: { family: fontFamily, size: 12, weight: 800 },
  },
};

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
        <h2>{title}</h2>
        <p>{eyebrow}</p>
      </div>
      {children}
    </section>
  );
}

function ChartCanvas({
  config,
  frameClassName = "analytics-chart-frame analytics-chart-frame-medium",
}: {
  config: ChartConfiguration;
  frameClassName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<ChartType> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvas, config);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config]);

  return (
    <div className="analytics-chart-scroll">
      <div className={frameClassName}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

const dumbbellConnectorPlugin: Plugin = {
  id: "analyticsDumbbellConnectors",
  beforeDatasetsDraw(chart) {
    const medianMeta = chart.getDatasetMeta(0);
    const currentMeta = chart.getDatasetMeta(1);
    const { ctx } = chart;

    ctx.save();
    ctx.strokeStyle = "#d8ded9";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";

    medianMeta.data.forEach((medianPoint, index) => {
      const currentPoint = currentMeta.data[index];
      if (!currentPoint) return;
      ctx.beginPath();
      ctx.moveTo(medianPoint.x, medianPoint.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();
    });

    ctx.restore();
  },
};

const heatmapCellPlugin: Plugin = {
  id: "analyticsHeatmapCells",
  beforeDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    const points = dataset.data as HeatmapDatum[];
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const { ctx } = chart;
    const cellWidth = Math.max(8, Math.abs(xScale.getPixelForValue(1) - xScale.getPixelForValue(0)) - 2);
    const cellHeight = Math.max(8, Math.abs(yScale.getPixelForValue(1) - yScale.getPixelForValue(0)) - 2);

    ctx.save();
    points.forEach((point) => {
      const x = xScale.getPixelForValue(point.x) - cellWidth / 2;
      const y = yScale.getPixelForValue(point.y) - cellHeight / 2;
      ctx.fillStyle = heatColor(point.v);
      ctx.beginPath();
      ctx.roundRect(x, y, cellWidth, cellHeight, 3);
      ctx.fill();
    });
    ctx.restore();
  },
};

export function AnalyticsCharts({ current, distribution, heatmap, facilityRisk, typeTrend, coverage }: Props) {
  const currentRanking = useMemo(() => current
    .filter((point) => point.wait !== null)
    .slice(0, 14)
    .map((point) => ({
      facility: facilityShortName(point.name),
      wait: point.wait ?? 0,
      color: pressureColor(point.wait),
    })), [current]);

  const currentPressureConfig = useMemo<ChartConfiguration>(() => ({
    type: "bar",
    data: {
      labels: currentRanking.map((point) => point.facility),
      datasets: [{
        label: "Current wait time",
        data: currentRanking.map((point) => point.wait),
        backgroundColor: currentRanking.map((point) => point.color),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.76,
        categoryPercentage: 0.78,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        ...basePlugins,
        legend: { display: false },
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            label: (item) => `Current wait time: ${minutes(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: axisMinutes }, title: { ...commonScales.title, display: true, text: "current wait time" } },
        y: { ...commonScales, grid: { display: false } },
      },
    },
  }), [currentRanking]);

  const typeTrendLabels = useMemo(() => Array.from(new Set(typeTrend.map((point) => shortTime(point.bucket)))), [typeTrend]);
  const typeTrendTicks = useMemo(() => new Set(sparseTicks(typeTrendLabels, 5)), [typeTrendLabels]);
  const typeTrendSeries = useMemo(() => [
    { label: "ED median wait time", type: "ed", metric: "median", color: colors.coral },
    { label: "ED P90 wait time", type: "ed", metric: "p90", color: colors.red },
    { label: "UPCC median wait time", type: "upcc", metric: "median", color: colors.teal },
    { label: "UPCC P90 wait time", type: "upcc", metric: "p90", color: colors.cyan },
  ].map((series) => ({
    label: series.label,
    data: typeTrendLabels.map((label) => {
      const found = typeTrend.find((point) => point.type === series.type && shortTime(point.bucket) === label);
      return series.metric === "median" ? found?.medianWait ?? null : found?.p90Wait ?? null;
    }),
    borderColor: series.color,
    backgroundColor: series.color,
    borderWidth: 3,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.36,
    spanGaps: true,
  })), [typeTrend, typeTrendLabels]);

  const trendConfig = useMemo<ChartConfiguration>(() => ({
    type: "line",
    data: { labels: typeTrendLabels, datasets: typeTrendSeries },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        ...basePlugins,
        legend: { display: false },
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${minutes(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: { ...commonScales, grid: { display: false }, ticks: { ...commonScales.ticks, callback: (_value, index) => typeTrendTicks.has(typeTrendLabels[index]) ? typeTrendLabels[index] : "" } },
        y: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: axisMinutes }, title: { ...commonScales.title, display: true, text: "wait time" } },
      },
    },
  }), [typeTrendLabels, typeTrendSeries, typeTrendTicks]);

  const sustained = useMemo(() => facilityRisk
    .filter((point) => point.readings >= 100)
    .sort((a, b) => (b.p90Wait ?? 0) - (a.p90Wait ?? 0))
    .slice(0, 14)
    .map((point) => ({
      facility: facilityShortName(point.name),
      median: point.medianWait ?? 0,
      p90: point.p90Wait ?? 0,
    })), [facilityRisk]);

  const sustainedConfig = useMemo<ChartConfiguration>(() => ({
    type: "bar",
    data: {
      labels: sustained.map((point) => point.facility),
      datasets: [
        { label: "Median wait time", data: sustained.map((point) => point.median), backgroundColor: colors.teal, borderRadius: 5, borderSkipped: false },
        { label: "P90 wait time", data: sustained.map((point) => point.p90), backgroundColor: colors.coral, borderRadius: 5, borderSkipped: false },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        ...basePlugins,
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            label: (item) => `${item.dataset.label}: ${minutes(Number(item.raw))}`,
          },
        },
      },
      scales: {
        x: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: axisMinutes }, title: { ...commonScales.title, display: true, text: "wait time" } },
        y: { ...commonScales, grid: { display: false } },
      },
    },
  }), [sustained]);

  const currentVsUsual = useMemo(() => facilityRisk
    .filter((point) => point.currentWait !== null && point.medianWait !== null && point.readings >= 100)
    .map((point) => ({
      facility: facilityShortName(point.name),
      delta: Math.round((point.currentWait ?? 0) - (point.medianWait ?? 0)),
      current: point.currentWait ?? 0,
      median: point.medianWait ?? 0,
      color: (point.currentWait ?? 0) >= (point.medianWait ?? 0) ? pressureColor(point.currentWait) : colors.cyan,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 12), [facilityRisk]);

  const dumbbellConfig = useMemo<ChartConfiguration>(() => ({
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Usual median wait time",
          data: currentVsUsual.map((point, index) => ({ x: point.median, y: index })) as XYDatum[],
          backgroundColor: colors.muted,
          borderColor: colors.surface,
          borderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 6,
        },
        {
          label: "Current wait time",
          data: currentVsUsual.map((point, index) => ({ x: point.current, y: index })) as XYDatum[],
          backgroundColor: currentVsUsual.map((point) => point.color),
          borderColor: colors.surface,
          borderWidth: 3,
          pointRadius: 8,
          pointHoverRadius: 9,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        ...basePlugins,
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            title: (items) => currentVsUsual[Number(items[0]?.parsed.y)]?.facility ?? "Facility",
            label: (item) => `${item.dataset.label}: ${minutes(item.parsed.x)}`,
            afterBody: (items) => {
              const row = currentVsUsual[Number(items[0]?.parsed.y)];
              return row ? `Change from usual median wait time: ${signedAxisMinutes(row.delta)}` : "";
            },
          },
        },
      },
      scales: {
        x: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: axisMinutes }, title: { ...commonScales.title, display: true, text: "wait time" } },
        y: {
          ...commonScales,
          reverse: true,
          min: -0.5,
          max: currentVsUsual.length - 0.5,
          ticks: { ...commonScales.ticks, stepSize: 1, callback: (value) => currentVsUsual[Number(value)]?.facility ?? "" },
          grid: { display: false },
        },
      },
    },
    plugins: [dumbbellConnectorPlugin],
  }), [currentVsUsual]);

  const riskPoints = useMemo(() => facilityRisk
    .filter((point) => point.readings >= 100)
    .map((point) => ({
      x: point.medianWait ?? 0,
      y: point.p90Wait ?? 0,
      r: Math.max(5, Math.min(15, Math.sqrt(point.readings) * 0.62)),
      name: point.name,
      readings: point.readings,
      type: point.type,
    })), [facilityRisk]);

  const riskConfig = useMemo<ChartConfiguration>(() => ({
    type: "bubble",
    data: {
      datasets: [
        {
          label: "ED",
          data: riskPoints.filter((point) => point.type === "ed") as BubbleDatum[],
          backgroundColor: "rgba(220, 109, 85, 0.72)",
          borderColor: colors.coral,
          borderWidth: 1,
        },
        {
          label: "UPCC",
          data: riskPoints.filter((point) => point.type === "upcc") as BubbleDatum[],
          backgroundColor: "rgba(14, 116, 144, 0.58)",
          borderColor: colors.cyan,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        ...basePlugins,
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            title: (items) => (items[0]?.raw as BubbleDatum | undefined)?.name ?? "Facility",
            label: (item) => `Median wait time ${minutes(item.parsed.x)} / P90 wait time ${minutes(item.parsed.y)}`,
            afterBody: (items) => {
              const raw = items[0]?.raw as BubbleDatum | undefined;
              return raw ? `${compactNumber(raw.readings)} readings` : "";
            },
          },
        },
      },
      scales: {
        x: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: axisMinutes }, title: { ...commonScales.title, display: true, text: "median wait time" } },
        y: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: axisMinutes }, title: { ...commonScales.title, display: true, text: "P90 wait time" } },
      },
    },
  }), [riskPoints]);

  const distributionConfig = useMemo<ChartConfiguration>(() => ({
    type: "bar",
    data: {
      labels: distribution.map((point) => point.bucket),
      datasets: [{
        label: "Readings",
        data: distribution.map((point) => point.readings),
        backgroundColor: distribution.map((_, index) => [colors.sky, colors.teal, colors.amber, colors.coral, colors.rose, colors.red][index] ?? colors.muted),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { ...basePlugins, legend: { display: false } },
      scales: {
        x: { ...commonScales, grid: { display: false } },
        y: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: compactNumber }, title: { ...commonScales.title, display: true, text: "readings" } },
      },
    },
  }), [distribution]);

  const heatmapNames = useMemo(() => Array.from(new Set(heatmap.map((point) => point.name))).slice(0, 12), [heatmap]);
  const heatmapData = useMemo(() => heatmapNames.flatMap((name, y) => Array.from({ length: 24 }, (_, hour) => {
    const found = heatmap.find((point) => point.name === name && point.hour === hour);
    return { x: hour, y, v: found?.avgWait ?? null, name, hour };
  })), [heatmap, heatmapNames]);

  const heatmapConfig = useMemo<ChartConfiguration>(() => ({
    type: "scatter",
    data: {
      datasets: [{
        label: "Average wait time",
        data: heatmapData as HeatmapDatum[],
        pointRadius: 7,
        pointHoverRadius: 8,
        pointBackgroundColor: "rgba(0,0,0,0)",
        pointBorderColor: "rgba(0,0,0,0)",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...basePlugins.tooltip,
          callbacks: {
            title: (items) => {
              const point = items[0]?.raw as HeatmapDatum | undefined;
              return point?.name ?? "Facility";
            },
            label: (item) => {
              const point = item.raw as HeatmapDatum;
              return `Average wait time at ${hourLabel(point.hour)}: ${minutes(point.v)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ...commonScales,
          min: -0.5,
          max: 23.5,
          ticks: { ...commonScales.ticks, stepSize: 1, callback: (value) => [0, 4, 8, 12, 16, 20].includes(Number(value)) ? hourLabel(Number(value)) : "" },
          grid: { display: false },
        },
        y: {
          ...commonScales,
          reverse: true,
          min: -0.5,
          max: heatmapNames.length - 0.5,
          ticks: { ...commonScales.ticks, stepSize: 1, callback: (value) => facilityShortName(heatmapNames[Number(value)] ?? "") },
          grid: { display: false },
        },
      },
    },
    plugins: [heatmapCellPlugin],
  }), [heatmapData, heatmapNames]);

  const coverageData = useMemo(() => coverage
    .filter((point) => point.readings > 0)
    .slice(0, 18)
    .map((point) => ({
      facility: facilityShortName(point.name),
      readings: point.readings,
      color: point.readings >= 1000 ? colors.teal : point.readings >= 500 ? colors.amber : colors.coral,
    })), [coverage]);

  const coverageConfig = useMemo<ChartConfiguration>(() => ({
    type: "bar",
    data: {
      labels: coverageData.map((point) => point.facility),
      datasets: [{
        label: "Readings",
        data: coverageData.map((point) => point.readings),
        backgroundColor: coverageData.map((point) => point.color),
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { ...basePlugins, legend: { display: false } },
      scales: {
        x: { ...commonScales, beginAtZero: true, ticks: { ...commonScales.ticks, callback: compactNumber }, title: { ...commonScales.title, display: true, text: "readings" } },
        y: { ...commonScales, grid: { display: false } },
      },
    },
  }), [coverageData]);

  return (
    <div className="analytics-charts">
      <section className="analytics-chart-grid analytics-chart-grid-featured">
        <ChartShell title="Current access pressure" eyebrow="Longest current wait times, severity-colored by threshold.">
          <ChartCanvas config={currentPressureConfig} frameClassName="analytics-chart-frame analytics-chart-frame-tall" />
          <div className="analytics-legend-inline">
            <span><i className="analytics-dot-short" />under 1h</span>
            <span><i className="analytics-dot-watch" />2h+</span>
            <span><i className="analytics-dot-high" />4h+</span>
            <span><i className="analytics-dot-severe" />6h+</span>
          </div>
        </ChartShell>

        <ChartShell title="ED vs UPCC trend" eyebrow="Median wait time and P90 wait time by care type, shown separately for clearer tail risk.">
          <ChartCanvas config={trendConfig} frameClassName="analytics-chart-frame analytics-chart-frame-tall analytics-chart-frame-wide" />
          <div className="analytics-legend-inline analytics-line-legend" aria-label="ED and UPCC wait-time trend legend">
            <span><i className="analytics-line-ed-median" />ED median wait time</span>
            <span><i className="analytics-line-ed-p90" />ED P90 wait time</span>
            <span><i className="analytics-line-upcc-median" />UPCC median wait time</span>
            <span><i className="analytics-line-upcc-p90" />UPCC P90 wait time</span>
          </div>
        </ChartShell>
      </section>

      <section className="analytics-chart-grid">
        <ChartShell title="Sustained facility pressure" eyebrow="Facilities ranked by P90 wait time. Median wait time shows typical pressure; P90 wait time shows bad-day pressure.">
          <ChartCanvas config={sustainedConfig} frameClassName="analytics-chart-frame analytics-chart-frame-tall" />
        </ChartShell>

        <ChartShell title="Current wait time vs usual median" eyebrow="Neutral dot is site median wait time; colored dot is current wait time. The line shows the gap.">
          <ChartCanvas config={dumbbellConfig} frameClassName="analytics-chart-frame analytics-chart-frame-tall" />
        </ChartShell>
      </section>

      <section className="analytics-chart-grid">
        <ChartShell title="Tail-risk map" eyebrow="Median wait time vs P90 wait time by facility. Upper-right sites are typically slow and painful in the tail.">
          <ChartCanvas config={riskConfig} frameClassName="analytics-chart-frame analytics-chart-frame-medium analytics-chart-frame-wide" />
        </ChartShell>

        <ChartShell title="Wait-time distribution" eyebrow="How many readings land in each wait-time bucket, useful for long-tail pressure checks.">
          <ChartCanvas config={distributionConfig} frameClassName="analytics-chart-frame analytics-chart-frame-medium" />
        </ChartShell>
      </section>

      <section className="analytics-chart-grid analytics-chart-grid-featured">
        <ChartShell title="Facility-hour pattern" eyebrow="Top sustained-pressure facilities by local hour. Darker means higher average wait time." wide>
          <ChartCanvas config={heatmapConfig} frameClassName="analytics-chart-frame analytics-chart-frame-tall analytics-chart-frame-extra-wide" />
        </ChartShell>

        <ChartShell title="Coverage volume" eyebrow="Readings per facility. Low-volume facilities should be interpreted cautiously.">
          <ChartCanvas config={coverageConfig} frameClassName="analytics-chart-frame analytics-chart-frame-tall" />
        </ChartShell>
      </section>
    </div>
  );
}
