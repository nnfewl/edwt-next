import { type LocationOrigin } from "./location-types";

const GPS_ORIGIN_SESSION_KEY = "edwt:gps-origin";

type ReverseGeocodeAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
};

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: ReverseGeocodeAddress;
};

function formatAccuracy(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "browser GPS";
  const rounded = Math.max(1, Math.round(value ?? 0));
  return `browser GPS +/- ${rounded}m`;
}

function normalizeRegion(value: string | null | undefined) {
  if (!value) return null;
  if (/^british columbia$/i.test(value)) return "BC";
  return value;
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(", ");
}

function labelFromReverseGeocode(payload: ReverseGeocodeResponse) {
  const address = payload.address;
  if (!address) return payload.display_name?.trim() || null;

  const street = joinParts([address.house_number, address.road ?? address.pedestrian ?? address.footway]);
  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.suburb ??
    address.neighbourhood;
  const region = normalizeRegion(address.state);

  return joinParts([street || address.neighbourhood || address.suburb, locality, region, address.postcode]) ||
    payload.display_name?.trim() ||
    null;
}

async function reverseGeocodeGpsLabel(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_000);

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en-CA");

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json() as ReverseGeocodeResponse;
    return labelFromReverseGeocode(payload);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function preciseGpsOrigin(lat: number, lng: number, accuracyMeters?: number | null, label = "Precise location"): LocationOrigin {
  return {
    lat,
    lng,
    label,
    source: "gps",
    accuracyLabel: formatAccuracy(accuracyMeters),
  };
}

export async function preciseGpsOriginWithLocationText(lat: number, lng: number, accuracyMeters?: number | null): Promise<LocationOrigin> {
  const label = await reverseGeocodeGpsLabel(lat, lng);
  return preciseGpsOrigin(lat, lng, accuracyMeters, label ?? "Precise location");
}

function isGpsOrigin(value: unknown): value is LocationOrigin {
  if (typeof value !== "object" || value === null) return false;
  const origin = value as Partial<LocationOrigin>;
  return (
    origin.source === "gps" &&
    typeof origin.lat === "number" &&
    Number.isFinite(origin.lat) &&
    typeof origin.lng === "number" &&
    Number.isFinite(origin.lng)
  );
}

export function readSessionGpsOrigin(): LocationOrigin | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(GPS_ORIGIN_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isGpsOrigin(parsed)) return null;
    const stored = parsed as LocationOrigin & { accuracyMeters?: unknown };
    const accuracyMeters =
      typeof stored.accuracyMeters === "number" && Number.isFinite(stored.accuracyMeters)
        ? stored.accuracyMeters
        : null;
    return preciseGpsOrigin(stored.lat, stored.lng, accuracyMeters, stored.label);
  } catch {
    return null;
  }
}

export function writeSessionGpsOrigin(origin: LocationOrigin) {
  if (typeof window === "undefined" || origin.source !== "gps") return;

  try {
    window.sessionStorage.setItem(
      GPS_ORIGIN_SESSION_KEY,
      JSON.stringify({
        lat: origin.lat,
        lng: origin.lng,
        label: origin.label,
        source: origin.source,
        accuracyMeters: Number(origin.accuracyLabel.match(/\d+/)?.[0] ?? NaN),
      }),
    );
  } catch {
    // Session storage can fail in hardened/private browser contexts.
  }
}
