export type LocationSource = "ip" | "gps" | "fallback";

export type LocationOrigin = {
  lat: number;
  lng: number;
  label: string;
  source: LocationSource;
  accuracyLabel: string;
  accuracyMeters?: number | null;
};

export const FALLBACK_LOCATION_ORIGIN: LocationOrigin = {
  lat: 49.21,
  lng: -122.91,
  label: "Approx. Metro Vancouver",
  source: "fallback",
  accuracyLabel: "default Lower Mainland area",
};
