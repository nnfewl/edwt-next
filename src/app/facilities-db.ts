import postgres from "postgres";
import { type Facility } from "./data";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://edwt:edwt@localhost:5433/edwt";
const DEFAULT_ORIGIN = { lat: 49.14, lng: -122.84 };

type DbFacilityRow = {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  phone: string | null;
  audience: string | null;
  latitude: number | null;
  longitude: number | null;
  open247: boolean | null;
  show_wait_times: boolean | null;
  wait_time_fallback: string | null;
  operating_hours: unknown;
  observed_at: Date | null;
  reading_created_at: Date | null;
  wait_time_minutes: number | null;
  elos_minutes: number | null;
};

type HoursDay = {
  open?: string | null;
  close?: string | null;
};

type OperatingHours = {
  days?: HoursDay[];
};

function isOperatingHours(value: unknown): value is OperatingHours {
  return typeof value === "object" && value !== null && Array.isArray((value as OperatingHours).days);
}

function audienceLabel(value: string | null): string {
  if (value === "sixteenAndUnder") return "16 and under";
  if (value === "seventeenPlus") return "17+";
  return "All ages";
}

function subtitleFor(row: DbFacilityRow): string {
  if (row.type === "upcc") return "Urgent & Primary Care";
  if (/children/i.test(row.name) || row.audience === "sixteenAndUnder") return "Pediatric Emergency";
  if (row.audience === "seventeenPlus") return "Adult Emergency";
  return "Emergency Department";
}

function formatWait(minutes: number | null, showWaitTimes: boolean | null): string {
  if (minutes == null || showWaitTimes === false) return "No wait posted";
  if (minutes >= 60) return Math.floor(minutes / 60) + "h " + Math.round(minutes % 60) + "m";
  return Math.round(minutes) + "m";
}

function formatAge(value: Date | null): string {
  if (!value) return "not available";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return diffMin + " min ago";
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return hours + "h ago";
  return Math.round(hours / 24) + "d ago";
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function fakeDateMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function dayIndex(weekday: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function hoursInfo(row: DbFacilityRow): { label: string; open: boolean } {
  if (row.open247) return { label: "Open 24 / 7", open: true };
  if (!isOperatingHours(row.operating_hours)) return { label: "Hours vary", open: row.wait_time_minutes !== null };

  const now = localParts(new Date(), "America/Vancouver");
  const index = dayIndex(now.weekday);
  const today = index >= 0 ? row.operating_hours.days?.[index] : undefined;
  const openMin = fakeDateMinutes(today?.open);
  const closeMinRaw = fakeDateMinutes(today?.close);

  if (openMin == null || closeMinRaw == null) return { label: "Hours vary", open: false };

  const closeMin = closeMinRaw <= openMin ? closeMinRaw + 24 * 60 : closeMinRaw;
  const nowMinRaw = now.hour * 60 + now.minute;
  const nowMin = nowMinRaw < openMin && closeMin > 24 * 60 ? nowMinRaw + 24 * 60 : nowMinRaw;
  const open = nowMin >= openMin && nowMin < closeMin;
  const label = formatMinutes(openMin) + " - " + formatMinutes(closeMinRaw);
  return { label, open };
}

function formatMinutes(value: number): string {
  const hour24 = Math.floor(value / 60) % 24;
  const minute = value % 60;
  const suffix = hour24 >= 12 ? "p.m." : "a.m.";
  const hour12 = hour24 % 12 || 12;
  return hour12 + ":" + String(minute).padStart(2, "0") + " " + suffix;
}

function distanceKm(lat: number, lng: number): number {
  const earthKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat - DEFAULT_ORIGIN.lat);
  const dLng = toRad(lng - DEFAULT_ORIGIN.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(DEFAULT_ORIGIN.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function toFacility(row: DbFacilityRow): Facility | null {
  if (row.latitude == null || row.longitude == null) return null;
  const hours = hoursInfo(row);
  const waitMin = row.show_wait_times === false ? null : row.wait_time_minutes;

  return {
    id: row.id,
    name: row.name,
    subtitle: subtitleFor(row),
    type: row.type === "upcc" ? "UPCC" : "Emergency",
    audience: audienceLabel(row.audience),
    waitMin,
    waitText: formatWait(row.wait_time_minutes, row.show_wait_times),
    distanceKm: distanceKm(row.latitude, row.longitude),
    address: row.address ?? "Address not available",
    phone: row.phone ?? "",
    hours: hours.label,
    lastUpdated: formatAge(row.reading_created_at ?? row.observed_at),
    lat: row.latitude,
    lng: row.longitude,
    open: hours.open,
    physiciansOnDuty: 0,
    inWaitingRoom: 0,
  };
}

export async function getPublicFacilities(): Promise<Facility[]> {
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5 });

  try {
    const rows = await sql<DbFacilityRow[]>`
      with latest as (
        select distinct on (location_id)
          location_id,
          observed_at,
          reading_created_at,
          wait_time_minutes,
          elos_minutes,
          status
        from wait_time_readings
        order by location_id, observed_at desc
      )
      select
        l.id,
        l.name,
        l.type,
        l.address,
        l.phone,
        l.audience,
        l.latitude,
        l.longitude,
        l.open247 as "open247",
        l.show_wait_times,
        l.wait_time_fallback,
        l.operating_hours,
        latest.observed_at,
        latest.reading_created_at,
        latest.wait_time_minutes,
        latest.elos_minutes
      from locations l
      left join latest on latest.location_id = l.id
      where l.status = 'published'
        and l.type in ('ed', 'upcc')
        and l.latitude is not null
        and l.longitude is not null
      order by l.name
    `;

    const facilities = rows.map(toFacility).filter((facility): facility is Facility => facility !== null);
    return facilities;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
