// Shared Facility shape + severity helpers for the public facilities list.
// Rows are produced by src/app/facilities-db.ts from the live database.

export type Facility = {
  id: string;
  name: string;
  subtitle: string;
  type: "Emergency" | "UPCC";
  audience: string;
  waitMin: number | null;
  waitText: string;
  distanceKm: number;
  address: string;
  addressStreet?: string;
  addressCity?: string;
  phone: string;
  website?: string;
  hours: string;
  /** "8:00 a.m." / "8:00 a.m. tomorrow" / "8:00 a.m. Mon" — set only while closed. */
  opensAt?: string;
  lastUpdated: string;
  /** Epoch ms of the latest reading; null when the facility has never reported. */
  observedAtMs: number | null;
  lat: number;
  lng: number;
  open: boolean;
  history?: HistoryPoint[];
};

// A reading older than this renders as "stale" instead of live. Deliberately
// looser than the ~minutely metro cadence: sparse rural EDs post roughly
// hourly and can go silent for a while overnight (see GAP_SPLIT_MIN).
export const STALE_READING_MS = 90 * 60_000;

export function isStaleReading(
  observedAtMs: number | null | undefined,
  nowMs: number,
): boolean {
  return observedAtMs != null && nowMs - observedAtMs > STALE_READING_MS;
}

export type Severity = "short" | "medium" | "long" | "closed";

export function severityFor(min: number | null): Severity {
  if (min == null) return "closed";
  if (min <= 60) return "short";
  if (min <= 180) return "medium";
  return "long";
}

export function severityLabel(min: number | null): string {
  if (min == null) return "No data";
  if (min <= 60) return "Short wait";
  if (min <= 180) return "Moderate wait";
  return "Long wait";
}

export function facilityWaitStatusLabel(facility: Pick<Facility, "open" | "waitMin">): string {
  if (!facility.open) return "Closed";
  return severityLabel(facility.waitMin);
}

export type HistoryPoint = { observedAt: string; min: number };
