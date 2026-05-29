import { type Facility } from "./data";
import { type LocationOrigin } from "./location-types";

export function distanceKmFromOrigin(
  origin: Pick<LocationOrigin, "lat" | "lng">,
  target: Pick<Facility, "lat" | "lng">,
): number {
  const earthKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(target.lat - origin.lat);
  const dLng = toRad(target.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(origin.lat)) *
      Math.cos(toRad(target.lat)) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

export function withOriginDistances(
  facilities: Facility[],
  origin: Pick<LocationOrigin, "lat" | "lng">,
): Facility[] {
  return facilities.map((facility) => ({
    ...facility,
    distanceKm: distanceKmFromOrigin(origin, facility),
  }));
}
