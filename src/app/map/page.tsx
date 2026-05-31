import type { Metadata } from "next";
import { AutoRefresh } from "../auto-refresh";
import { getPublicFacilities } from "../facilities-db";
import { getApproximateLocationOrigin } from "../location-origin";
import { MapClient } from "./map-client";

export const metadata: Metadata = {
  title: "Facility Map",
  description:
    "Interactive map of emergency departments and urgent care centres in the Lower Mainland, BC with live wait times and directions.",
  alternates: { canonical: "/map" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MapPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = (await searchParams) ?? {};
  const [initialOrigin, facilities] = await Promise.all([
    getApproximateLocationOrigin(),
    getPublicFacilities(),
  ]);

  return (
    <>
      <AutoRefresh />
      <MapClient
        facilities={facilities}
        initialOrigin={initialOrigin}
        initialFacilityId={firstParam(params.facility)}
        routeRequested={firstParam(params.route) === "1"}
      />
    </>
  );
}
