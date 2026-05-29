import { headers } from "next/headers";
import {
  FALLBACK_LOCATION_ORIGIN,
  type LocationOrigin,
} from "./location-types";

function firstHeader(
  headerBag: Headers,
  names: string[],
): string | null {
  for (const name of names) {
    const value = headerBag.get(name);
    if (value) return value;
  }
  return null;
}

function parseCoordinate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function normalizeRegion(value: string | null): string | null {
  if (!value) return null;
  if (/^british columbia$/i.test(value)) return "BC";
  return value;
}

function labelFor(city: string | null, region: string | null): string {
  const cleanCity = city?.trim();
  const cleanRegion = normalizeRegion(region?.trim() ?? null);
  if (cleanCity && cleanRegion) return `Approx. ${cleanCity}, ${cleanRegion}`;
  if (cleanCity) return `Approx. ${cleanCity}`;
  if (cleanRegion) return `Approx. ${cleanRegion}`;
  return "Approx. current area";
}

function appEngineLatLng(value: string | null): { lat: number; lng: number } | null {
  if (!value) return null;
  const [latRaw, lngRaw] = value.split(",");
  const lat = parseCoordinate(latRaw ?? null);
  const lng = parseCoordinate(lngRaw ?? null);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

export async function getApproximateLocationOrigin(): Promise<LocationOrigin> {
  const headerBag = await headers();
  const appEngineOrigin = appEngineLatLng(headerBag.get("x-appengine-citylatlong"));
  const lat = appEngineOrigin?.lat ?? parseCoordinate(firstHeader(headerBag, [
    "x-vercel-ip-latitude",
    "cf-iplatitude",
    "x-geo-latitude",
  ]));
  const lng = appEngineOrigin?.lng ?? parseCoordinate(firstHeader(headerBag, [
    "x-vercel-ip-longitude",
    "cf-iplongitude",
    "x-geo-longitude",
  ]));

  if (lat == null || lng == null) return FALLBACK_LOCATION_ORIGIN;

  const city = decodeHeader(firstHeader(headerBag, [
    "x-vercel-ip-city",
    "cf-ipcity",
    "x-geo-city",
    "x-appengine-city",
  ]));
  const region = decodeHeader(firstHeader(headerBag, [
    "x-vercel-ip-country-region",
    "cf-region-code",
    "cf-region",
    "x-geo-region",
    "x-appengine-region",
  ]));

  return {
    lat,
    lng,
    label: labelFor(city, region),
    source: "ip",
    accuracyLabel: "approx. IP location",
  };
}
