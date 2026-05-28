import { AutoRefresh } from "../auto-refresh";
import { getPublicFacilities } from "../facilities-db";
import { MapClient } from "./map-client";

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
  const facilities = await getPublicFacilities();

  return (
    <>
      <AutoRefresh />
      <MapClient
        facilities={facilities}
        initialFacilityId={firstParam(params.facility)}
        routeRequested={firstParam(params.route) === "1"}
      />
    </>
  );
}
