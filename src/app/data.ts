// Mock data for the public ER Now facilities list.
// Mirrors the prototype shape so a real Supabase-backed loader can swap in later
// without touching components — see `getFacilities()` at the bottom.

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
  phone: string;
  hours: string;
  lastUpdated: string;
  lat: number;
  lng: number;
  open: boolean;
  physiciansOnDuty: number;
  inWaitingRoom: number;
  history?: HistoryPoint[];
};

export const FACILITIES: Facility[] = [
  {
    id: "smh-ped",
    name: "Surrey Memorial Hospital",
    subtitle: "Pediatric Emergency",
    type: "Emergency",
    audience: "16 and under",
    waitMin: 45,
    waitText: "45m",
    distanceKm: 6.2,
    address: "13750 96 Ave, Surrey",
    phone: "604-581-2211",
    hours: "Open 24 / 7",
    lastUpdated: "2 min ago",
    lat: 49.18,
    lng: -122.84,
    open: true,
    physiciansOnDuty: 4,
    inWaitingRoom: 12,
  },
  {
    id: "cloverdale-upcc",
    name: "Cloverdale UPCC",
    subtitle: "Urgent & Primary Care",
    type: "UPCC",
    audience: "All ages",
    waitMin: 32,
    waitText: "32m",
    distanceKm: 8.5,
    address: "17700 56 Ave, Surrey",
    phone: "604-575-5306",
    hours: "8:00 a.m. — 10:00 p.m.",
    lastUpdated: "5 min ago",
    lat: 49.10,
    lng: -122.71,
    open: true,
    physiciansOnDuty: 2,
    inWaitingRoom: 6,
  },
  {
    id: "ridge-meadows",
    name: "Ridge Meadows Hospital",
    subtitle: "Emergency Department",
    type: "Emergency",
    audience: "All ages",
    waitMin: 106,
    waitText: "1h 46m",
    distanceKm: 27.1,
    address: "11666 Laity St, Maple Ridge",
    phone: "604-463-4111",
    hours: "Open 24 / 7",
    lastUpdated: "3 min ago",
    lat: 49.22,
    lng: -122.61,
    open: true,
    physiciansOnDuty: 3,
    inWaitingRoom: 18,
  },
  {
    id: "smh-adult",
    name: "Surrey Memorial Hospital",
    subtitle: "Adult Emergency",
    type: "Emergency",
    audience: "17+",
    waitMin: 135,
    waitText: "2h 15m",
    distanceKm: 6.2,
    address: "13750 96 Ave, Surrey",
    phone: "604-581-2211",
    hours: "Open 24 / 7",
    lastUpdated: "2 min ago",
    lat: 49.18,
    lng: -122.84,
    open: true,
    physiciansOnDuty: 6,
    inWaitingRoom: 41,
  },
  {
    id: "langley",
    name: "Langley Memorial Hospital",
    subtitle: "Emergency Department",
    type: "Emergency",
    audience: "All ages",
    waitMin: 174,
    waitText: "2h 54m",
    distanceKm: 15.4,
    address: "22051 Fraser Hwy, Langley",
    phone: "604-534-4121",
    hours: "Open 24 / 7",
    lastUpdated: "4 min ago",
    lat: 49.10,
    lng: -122.66,
    open: true,
    physiciansOnDuty: 4,
    inWaitingRoom: 29,
  },
  {
    id: "eagle-ridge",
    name: "Eagle Ridge Hospital",
    subtitle: "Emergency Department",
    type: "Emergency",
    audience: "All ages",
    waitMin: 202,
    waitText: "3h 22m",
    distanceKm: 22.7,
    address: "475 Guildford Way, Port Moody",
    phone: "604-461-2022",
    hours: "Open 24 / 7",
    lastUpdated: "6 min ago",
    lat: 49.28,
    lng: -122.83,
    open: true,
    physiciansOnDuty: 3,
    inWaitingRoom: 34,
  },
  {
    id: "royal-columbian",
    name: "Royal Columbian Hospital",
    subtitle: "Emergency Department",
    type: "Emergency",
    audience: "All ages",
    waitMin: 279,
    waitText: "4h 39m",
    distanceKm: 18.0,
    address: "330 E Columbia St, New Westminster",
    phone: "604-520-4253",
    hours: "Open 24 / 7",
    lastUpdated: "2 min ago",
    lat: 49.22,
    lng: -122.89,
    open: true,
    physiciansOnDuty: 7,
    inWaitingRoom: 58,
  },
  {
    id: "burnaby",
    name: "Burnaby Hospital",
    subtitle: "Emergency Department",
    type: "Emergency",
    audience: "All ages",
    waitMin: 351,
    waitText: "5h 51m",
    distanceKm: 25.2,
    address: "3935 Kincaid St, Burnaby",
    phone: "604-434-4211",
    hours: "Open 24 / 7",
    lastUpdated: "8 min ago",
    lat: 49.24,
    lng: -123.00,
    open: true,
    physiciansOnDuty: 5,
    inWaitingRoom: 47,
  },
  {
    id: "newton-upcc",
    name: "Surrey Newton UPCC",
    subtitle: "Urgent & Primary Care",
    type: "UPCC",
    audience: "All ages",
    waitMin: null,
    waitText: "Closed",
    distanceKm: 4.1,
    address: "13483 76 Ave, Surrey",
    phone: "604-590-6300",
    hours: "Opens 8:00 a.m.",
    lastUpdated: "—",
    lat: 49.14,
    lng: -122.84,
    open: false,
    physiciansOnDuty: 0,
    inWaitingRoom: 0,
  },
];

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

export type Trend = "rising" | "falling" | "steady";

export function trendFor(f: Facility): Trend {
  const hist = f.history ?? [];
  if (hist.length < 4) return "steady";
  const recent = hist.slice(-3).reduce((s, p) => s + p.min, 0) / 3;
  const prior = hist.slice(-6, -3).reduce((s, p) => s + p.min, 0) / 3;
  const delta = recent - prior;
  if (Math.abs(delta) < Math.max(8, prior * 0.06)) return "steady";
  return delta > 0 ? "rising" : "falling";
}

/**
 * Single seam for real data. Today: returns the mock list above. Tomorrow:
 * read latest readings + location metadata from Supabase (see src/db/schema.ts)
 * and project them into the Facility shape. Components stay untouched.
 */
export function getFacilities(): Facility[] {
  return FACILITIES;
}
