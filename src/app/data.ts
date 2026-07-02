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
  lastUpdated: string;
  lat: number;
  lng: number;
  open: boolean;
  history?: HistoryPoint[];
};

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
