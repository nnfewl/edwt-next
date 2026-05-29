import { client as sharedClient } from "../db/client";
import { type Facility, type HistoryPoint } from "./data";

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
  wait_history: unknown;
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseWaitHistory(value: unknown): HistoryPoint[] {
  const raw = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(raw)) return [];

  const points: HistoryPoint[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const minutes = Number(record.wait_time_minutes);
    const observedRaw = record.observed_at;
    const observedAt =
      observedRaw instanceof Date
        ? observedRaw
        : typeof observedRaw === "string"
          ? new Date(observedRaw)
          : null;

    if (!Number.isFinite(minutes) || !observedAt || Number.isNaN(observedAt.getTime())) continue;
    points.push({ observedAt: observedAt.toISOString(), min: Math.max(0, Math.round(minutes)) });
  }

  return points.slice(-12);
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

function formatWait(minutes: number | null, showWaitTimes: boolean | null, open: boolean): string {
  if (!open) return "Closed";
  if (minutes == null || showWaitTimes === false) return "No data";
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

const VANCOUVER_TZ = "America/Vancouver";

// Get hour/minute in a given timezone without locale-dependent string parsing.
function localHourMinute(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return { hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

// Day-of-week (Sun=0..Sat=6) in a given timezone — built from year/month/day so
// it doesn't depend on which ICU short-weekday string the runtime emits.
function localDayIndex(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const y = get("year");
  const m = get("month") - 1;
  const d = get("day");
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return -1;
  return new Date(Date.UTC(y, m, d)).getUTCDay();
}

// The source encodes each day's open/close as an RFC 2822 string anchored to
// 1970-01-01 GMT, where 16:00 GMT means "8 a.m. PST." Converting via the
// Vancouver timezone recovers the intended wall-clock minutes-of-day.
function operatingMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const { hour, minute } = localHourMinute(date, VANCOUVER_TZ);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function hoursInfo(row: DbFacilityRow): { label: string; open: boolean } {
  if (row.open247) return { label: "Open 24 / 7", open: true };
  if (!isOperatingHours(row.operating_hours)) return { label: "Hours vary", open: row.wait_time_minutes !== null };

  const now = new Date();
  const index = localDayIndex(now, VANCOUVER_TZ);
  const today = index >= 0 ? row.operating_hours.days?.[index] : undefined;
  const openMin = operatingMinutes(today?.open);
  const closeMinRaw = operatingMinutes(today?.close);

  if (openMin == null || closeMinRaw == null) return { label: "Hours vary", open: false };

  const closeMin = closeMinRaw <= openMin ? closeMinRaw + 24 * 60 : closeMinRaw;
  const { hour, minute } = localHourMinute(now, VANCOUVER_TZ);
  const nowMinRaw = hour * 60 + minute;
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

function toFacility(row: DbFacilityRow): Facility | null {
  if (row.latitude == null || row.longitude == null) return null;
  const hours = hoursInfo(row);
  const waitMin = !hours.open || row.show_wait_times === false ? null : row.wait_time_minutes;
  const history = waitMin != null ? parseWaitHistory(row.wait_history) : [];

  return {
    id: row.id,
    name: row.name,
    subtitle: subtitleFor(row),
    type: row.type === "upcc" ? "UPCC" : "Emergency",
    audience: audienceLabel(row.audience),
    waitMin,
    waitText: formatWait(row.wait_time_minutes, row.show_wait_times, hours.open),
    // Distance is computed on the client once the origin is known.
    distanceKm: 0,
    address: row.address ?? "Address not available",
    phone: row.phone ?? "",
    hours: hours.label,
    lastUpdated: formatAge(row.reading_created_at ?? row.observed_at),
    lat: row.latitude,
    lng: row.longitude,
    open: hours.open,
    physiciansOnDuty: 0,
    inWaitingRoom: 0,
    history,
  };
}

// 30-second module-level cache. The query is identical for every request (no
// per-user filtering), so a single in-process cache fans the result out to all
// concurrent renders without re-querying. Combined with the shared `client`
// pool in src/db/client.ts, this caps DB load at ~2 reads/minute regardless of
// how many tabs the AutoRefresh component fans out across.
const CACHE_TTL_MS = 30_000;
let cache: { at: number; data: Facility[] } | null = null;
let inflight: Promise<Facility[]> | null = null;

async function queryFacilities(): Promise<Facility[]> {
  const rows = await sharedClient<DbFacilityRow[]>`
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
    ), hourly_history as (
      select distinct on (location_id, date_trunc('hour', observed_at))
        location_id,
        observed_at,
        wait_time_minutes
      from wait_time_readings
      where observed_at >= now() - interval '12 hours'
        and has_wait_time = true
        and wait_time_minutes is not null
      order by location_id, date_trunc('hour', observed_at), observed_at desc
    ), history as (
      select
        location_id,
        jsonb_agg(
          jsonb_build_object(
            'observed_at', observed_at,
            'wait_time_minutes', wait_time_minutes
          )
          order by observed_at
        ) as wait_history
      from hourly_history
      group by location_id
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
      latest.elos_minutes,
      history.wait_history
    from locations l
    left join latest on latest.location_id = l.id
    left join history on history.location_id = l.id
    where l.status = 'published'
      and l.type in ('ed', 'upcc')
      and l.latitude is not null
      and l.longitude is not null
    order by l.name
  `;

  return rows
    .map(toFacility)
    .filter((facility): facility is Facility => facility !== null);
}

export async function getPublicFacilities(): Promise<Facility[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  // Coalesce concurrent callers onto a single in-flight query so a thundering
  // herd at cache-expiry still produces only one DB round-trip.
  if (!inflight) {
    inflight = queryFacilities()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
