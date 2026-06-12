import type { Metadata } from "next";
import { AutoRefresh } from "../auto-refresh";
import { getPublicFacilities } from "../facilities-db";
import { getApproximateLocationOrigin } from "../location-origin";
import { MapClientLazy } from "./map-client-lazy";

export const metadata: Metadata = {
  title: "Facility Map",
  description:
    "Interactive map of emergency departments and urgent care centres in the Lower Mainland, BC with live wait times and directions.",
  alternates: { canonical: "/map" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MapPage() {
  const [initialOrigin, facilities] = await Promise.all([
    getApproximateLocationOrigin(),
    getPublicFacilities(),
  ]);

  return (
    <>
      <AutoRefresh />
      <MapClientLazy
        facilities={facilities}
        initialOrigin={initialOrigin}
      />
    </>
  );
}
