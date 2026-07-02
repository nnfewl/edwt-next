import { describe, expect, it } from "vitest";
import {
  type BaselineRow,
  STEP_MIN,
  baselineInterp,
  buildProjection,
  deviationFor,
  smooth,
} from "./forecast";

/** Flat baseline: every hour has the same percentiles. */
function flatBaseline(p50: number, iqrHalf = 10): BaselineRow[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    p25: p50 - iqrHalf,
    p50,
    p75: p50 + iqrHalf,
  }));
}

describe("baselineInterp", () => {
  it("returns null with no rows", () => {
    expect(baselineInterp([], "p50")(600)).toBeNull();
  });

  it("clamps before the first and after the last anchor", () => {
    const rows: BaselineRow[] = [
      { hour: 8, p25: 10, p50: 20, p75: 30 },
      { hour: 20, p25: 30, p50: 60, p75: 90 },
    ];
    const at = baselineInterp(rows, "p50");
    expect(at(0)).toBe(20);
    expect(at(1439)).toBe(60);
  });

  it("interpolates linearly between hourly anchors", () => {
    const rows: BaselineRow[] = [
      { hour: 8, p25: 0, p50: 20, p75: 0 },
      { hour: 10, p25: 0, p50: 60, p75: 0 },
    ];
    // Anchors sit at the half hour: 8:30 (510) and 10:30 (630); 9:30 is halfway.
    expect(baselineInterp(rows, "p50")(570)).toBe(40);
  });
});

describe("smooth", () => {
  it("applies 1-2-1 smoothing with clamped endpoints", () => {
    const rows: BaselineRow[] = [
      { hour: 0, p25: 0, p50: 0, p75: 0 },
      { hour: 1, p25: 40, p50: 40, p75: 40 },
      { hour: 2, p25: 0, p50: 0, p75: 0 },
    ];
    const out = smooth(rows);
    expect(out[1].p50).toBe(20); // 0.25*0 + 0.5*40 + 0.25*0
    expect(out[0].p50).toBe(10); // endpoint reuses itself: 0.25*0 + 0.5*0 + 0.25*40
  });

  it("leaves a flat series unchanged", () => {
    expect(smooth(flatBaseline(30))).toEqual(flatBaseline(30));
  });
});

describe("deviationFor", () => {
  it("returns null without a reading or baseline", () => {
    expect(deviationFor(null, 600, flatBaseline(60))).toBeNull();
    expect(deviationFor({ t: 600, min: 60 }, 600, [])).toBeNull();
  });

  it("classifies against the IQR", () => {
    const baseline = flatBaseline(60, 10); // IQR = 20
    expect(deviationFor({ t: 600, min: 60 }, 600, baseline)).toBe("typical");
    expect(deviationFor({ t: 600, min: 90 }, 600, baseline)).toBe("higher"); // z = 30/20 = 1.5
    expect(deviationFor({ t: 600, min: 30 }, 600, baseline)).toBe("lower");
  });
});

describe("buildProjection", () => {
  it("returns nothing without a reading or baseline", () => {
    expect(buildProjection(null, flatBaseline(60))).toEqual([]);
    expect(buildProjection({ t: 600, min: 60 }, [])).toEqual([]);
  });

  it("starts near the current deviation and decays toward the baseline", () => {
    const baseline = flatBaseline(60);
    const last = { t: 600, min: 120 }; // 60 above baseline
    const projected = buildProjection(last, baseline);

    expect(projected[0].t).toBe(600 + STEP_MIN);
    // First step keeps most of the deviation.
    expect(projected[0].min).toBeGreaterThan(100);
    // Hours later the projection has converged to the baseline median.
    const late = projected[projected.length - 1];
    expect(late.min).toBeGreaterThanOrEqual(60);
    expect(late.min).toBeLessThan(70);
  });

  it("keeps the uncertainty cone ordered and non-negative", () => {
    const projected = buildProjection({ t: 60, min: 5 }, flatBaseline(10, 40));
    for (const p of projected) {
      expect(p.lo).toBeGreaterThanOrEqual(0);
      expect(p.lo).toBeLessThanOrEqual(p.min);
      expect(p.hi).toBeGreaterThanOrEqual(p.min);
    }
  });

  it("steps in STEP_MIN increments to the end of the day", () => {
    const projected = buildProjection({ t: 600, min: 60 }, flatBaseline(60));
    const last = projected[projected.length - 1];
    expect(last.t).toBeLessThanOrEqual(1440 - STEP_MIN);
    expect(projected[1].t - projected[0].t).toBe(STEP_MIN);
  });
});
