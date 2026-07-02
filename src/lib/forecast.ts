// Pure math for the facility "today" forecast: hourly percentile baselines,
// smoothing, and the decaying-deviation projection cone. Kept free of I/O so
// it can be unit-tested; the /api/facilities/[id]/today route wires it to SQL.

/** Decay constant (minutes) for anchoring the forecast to the current deviation. */
export const TAU_MIN = 150;
export const STEP_MIN = 15;

export type TodayPoint = { t: number; min: number };
export type ProjectedPoint = { t: number; min: number; lo: number; hi: number };
export type BaselineRow = { hour: number; p25: number; p50: number; p75: number };

/** Linear interpolation over hourly baseline rows (anchored at the half-hour). */
export function baselineInterp(rows: BaselineRow[], key: "p25" | "p50" | "p75") {
  return (t: number): number | null => {
    if (rows.length === 0) return null;
    const pts = rows.map((r) => ({ x: r.hour * 60 + 30, y: r[key] }));
    if (t <= pts[0].x) return pts[0].y;
    if (t >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 0; i < pts.length - 1; i++) {
      if (t >= pts[i].x && t <= pts[i + 1].x) {
        const f = (t - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + f * (pts[i + 1].y - pts[i].y);
      }
    }
    return pts[pts.length - 1].y;
  };
}

/**
 * Sparse facilities (hourly reporters) yield jagged hourly percentiles; a
 * light 1-2-1 pass keeps the forecast ridge from lurching bucket to bucket.
 */
export function smooth(rows: BaselineRow[]): BaselineRow[] {
  return rows.map((r, i) => {
    const prev = rows[i - 1] ?? r;
    const next = rows[i + 1] ?? r;
    const mix = (k: "p25" | "p50" | "p75") => 0.25 * prev[k] + 0.5 * r[k] + 0.25 * next[k];
    return { ...r, p25: mix("p25"), p50: mix("p50"), p75: mix("p75") };
  });
}

/** Classify the latest reading against the baseline IQR at the current time. */
export function deviationFor(
  last: TodayPoint | null,
  nowMin: number,
  baseline: BaselineRow[],
): "lower" | "typical" | "higher" | null {
  const typicalNow = baselineInterp(baseline, "p50")(nowMin);
  if (!last || typicalNow == null) return null;
  const p25At = baselineInterp(baseline, "p25");
  const p75At = baselineInterp(baseline, "p75");
  const iqr = Math.max(10, (p75At(nowMin) ?? 0) - (p25At(nowMin) ?? 0));
  const z = (last.min - typicalNow) / iqr;
  return z > 0.5 ? "higher" : z < -0.5 ? "lower" : "typical";
}

/**
 * Project the rest of the day: baseline median plus the current deviation
 * decaying with time constant TAU_MIN, wrapped in an IQR-derived uncertainty
 * cone that widens with horizon but is capped so noisy baselines can't
 * balloon it past the forecast itself.
 */
export function buildProjection(last: TodayPoint | null, baseline: BaselineRow[]): ProjectedPoint[] {
  const projected: ProjectedPoint[] = [];
  if (!last || baseline.length === 0) return projected;

  const p25At = baselineInterp(baseline, "p25");
  const p50At = baselineInterp(baseline, "p50");
  const p75At = baselineInterp(baseline, "p75");

  const anchorDev = last.min - (p50At(last.t) ?? last.min);
  for (let t = last.t + STEP_MIN; t <= 1440 - STEP_MIN; t += STEP_MIN) {
    const base = p50At(t);
    if (base == null) continue;
    const min = Math.max(0, base + anchorDev * Math.exp(-(t - last.t) / TAU_MIN));
    const hoursAhead = (t - last.t) / 60;
    const rawHalf =
      (Math.max(10, (p75At(t) ?? 0) - (p25At(t) ?? 0)) / 2) * (1 + 0.15 * hoursAhead);
    const half = Math.min(rawHalf, Math.max(20, min * 0.4), 90);
    projected.push({
      t,
      min: Math.round(min),
      lo: Math.max(0, Math.round(min - half)),
      hi: Math.round(min + half),
    });
  }
  return projected;
}
