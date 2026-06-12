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
    <MapClientLazy
      facilities={facilities}
      initialOrigin={FALLBACK_LOCATION_ORIGIN}
    />
  );
}
