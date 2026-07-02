import { describe, expect, it } from "vitest";
import {
  percentile, top2Share, peakWindow, dowExtremes, gapTrend,
  countCalmDays, steadyAndGamble, weeksAtTop, standingsMovers,
} from "./derive";

describe("percentile", () => {
  it("linearly interpolates", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("top2Share", () => {
  it("is the fraction of total positive delta held by the top two", () => {
    expect(top2Share([62, 48, 12, 25])).toBeCloseTo(110 / 147, 5);
  });
  it("is 0 when nothing is above baseline", () => {
    expect(top2Share([-5, -2, 0])).toBe(0);
  });
});

describe("peakWindow", () => {
  it("finds the 85%-of-max run and the morning gap", () => {
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      min: h >= 18 && h <= 20 ? 200 : h >= 6 && h <= 11 ? 80 : 120,
    }));
    expect(peakWindow(hourly)).toEqual({ peakStartHour: 18, peakEndHour: 20, morningDeltaMin: 120 });
  });
});

describe("dowExtremes", () => {
  it("picks roughest and calmest weekday", () => {
    expect(dowExtremes([{ dow: 1, min: 185 }, { dow: 6, min: 132 }, { dow: 0, min: 145 }]))
      .toEqual({ roughestDow: 1, calmestDow: 6, deltaMin: 53 });
  });
});

describe("gapTrend", () => {
  it("classifies the trend from first third vs last third", () => {
    expect(gapTrend([50, 60, 70, 80, 90])).toEqual({ gapMin: 90, trend: "widening" });
    expect(gapTrend([90, 80, 70, 60, 50])).toEqual({ gapMin: 50, trend: "narrowing" });
    expect(gapTrend([70, 72, 68, 71, 69])).toEqual({ gapMin: 69, trend: "steady" });
  });
});

describe("countCalmDays", () => {
  it("counts days below p25 of daily medians", () => {
    expect(countCalmDays([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(3);
  });
});

describe("steadyAndGamble", () => {
  it("names the long-but-steady standout and the biggest gamble", () => {
    const f = [
      { name: "Richmond", median: 160, stddev: 14 },
      { name: "Eagle Ridge", median: 130, stddev: 64 },
      { name: "Surrey", median: 225, stddev: 52 },
    ];
    expect(steadyAndGamble(f, 150)).toEqual({ steadyLongName: "Richmond", gambleName: "Eagle Ridge" });
  });
});

describe("weeksAtTop", () => {
  it("counts the current leader's trailing streak", () => {
    expect(weeksAtTop(["A", "A", "B", "B", "B"])).toEqual({ leaderName: "B", weeksAtTop: 3 });
  });
});

describe("standingsMovers", () => {
  it("finds the biggest climber and slider", () => {
    expect(standingsMovers([
      { name: "Surrey", ranks: [1, 1, 1, 1] },
      { name: "Burnaby", ranks: [5, 3, 3, 3] },
      { name: "Langley", ranks: [4, 5, 6, 6] },
    ])).toEqual({ climberName: "Burnaby", climbBy: 2, sliderName: "Langley" });
  });
});
