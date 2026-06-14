import type { Metadata } from "next";
import { getPublicFacilities } from "../facilities-db";
import { FALLBACK_LOCATION_ORIGIN } from "../location-types";
import { MapClientLazy } from "./map-client-lazy";

export const metadata: Metadata = {
  title: "Facility Map",
  description:
    "Interactive map of emergency departments and urgent care centres in the Lower Mainland, BC with live wait times and directions.",
  alternates: { canonical: "/map" },
};

export const revalidate = 30;

export default async function MapPage() {
  const facilities = await getPublicFacilities();

  return (
    <>
      <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://basemaps.cartocdn.com" />
      <link rel="preconnect" href="https://tiles.basemaps.cartocdn.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://tiles.basemaps.cartocdn.com" />
      <MapClientLazy
        facilities={facilities}
        initialOrigin={FALLBACK_LOCATION_ORIGIN}
      />
    </>
  );
}
