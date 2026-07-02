import { scaleLinear } from "d3-scale";
import { line as d3line, curveCatmullRom } from "d3-shape";

export { fmtMin } from "@/lib/analytics/format";

// Sage palette — production ships this only (the mockup's other palettes are a
// mock-only lab). Values mirror PALETTES.sage in the mockup.
export const SAGE = {
  ink: "#171a18", ink2: "#3b403d", muted: "#71766f", faint: "#9aa098",
  line: "#e5e9e4", surface: "#ffffff", bg: "#f4f6f2", card2: "#fafbf8", track: "#eef1ec",
  primary: "#0f766e", primarySoft: "#e2efec",
  hot: "#b5462d", good: "#15803d", rose: "#be123c",
  grid: "#eef1ec", tick: "#9aa098",
  band: "rgba(15,118,110,0.09)", todayFillTop: 0.2,
} as const;

// Warm severity ramp shared by all charts.
export function severityColor(v: number): string {
  return v >= 300 ? "#8f2a22" : v >= 240 ? "#b5462d" : v >= 180 ? "#cf6a3c" : v >= 120 ? "#dd8a4d" : v >= 60 ? "#d9a44a" : "#84a86a";
}

// Heatmap ramp (green → honey → apricot → terracotta → coral → brick).
export const HEAT = ["#e4f2ef", "#b8ddd4", "#e9c78d", "#e89b73", "#d66d5b", "#b94a45"];
export function heatColor(v: number): string {
  return HEAT[v >= 300 ? 5 : v >= 240 ? 4 : v >= 180 ? 3 : v >= 120 ? 2 : v >= 60 ? 1 : 0];
}

// Distribution segment ramp (< 1h → 4h+).
export const DIST = ["#84a86a", "#d9a44a", "#dd8a4d", "#cf6a3c", "#b5462d"];

/** Linear scale factory (thin d3-scale wrapper). */
export function linear(domain: [number, number], range: [number, number]) {
  return scaleLinear().domain(domain).range(range);
}

/** Smooth Catmull-Rom path through [x,y] points. */
export function smoothPath(points: [number, number][]): string {
  return d3line().curve(curveCatmullRom.alpha(0.5))(points) ?? "";
}

/** Straight polyline path through [x,y] points. */
export function linePath(points: [number, number][]): string {
  return d3line()(points) ?? "";
}

/** 24h clock-hour label, e.g. 0→"12am", 12→"noon", 18→"6pm". */
export function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
