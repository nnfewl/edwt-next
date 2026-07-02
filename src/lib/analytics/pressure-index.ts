// Hero pressure index: regional current median ÷ typical baseline → status word.

export const PRESSURE_STATUSES = ["Calm", "Typical", "Elevated", "Severe"] as const;
export type PressureStatus = (typeof PRESSURE_STATUSES)[number];

/** Ratio → status word. Bands: <0.8 Calm · 0.8–1.15 Typical · 1.15–1.6 Elevated · ≥1.6 Severe. */
export function pressureStatus(ratio: number): PressureStatus {
  if (ratio < 0.8) return "Calm";
  if (ratio < 1.15) return "Typical";
  if (ratio < 1.6) return "Elevated";
  return "Severe";
}

/** Zero-based gauge index (0..3) for the active status segment. */
export function pressureIndex(ratio: number): number {
  return PRESSURE_STATUSES.indexOf(pressureStatus(ratio));
}
