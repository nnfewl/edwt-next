export type LocationSource = "ip" | "gps" | "fallback";

export type LocationOrigin = {
  lat: number;
  lng: number;
  label: string;
  source: LocationSource;
  accuracyLabel: string;
};

export const FALLBACK_LOCATION_ORIGIN: LocationOrigin = {
  lat: 49.14,
  lng: -122.84,
  label: "Approx. Surrey, BC",
  source: "fallback",
  accuracyLabel: "default Lower Mainland area",
};
