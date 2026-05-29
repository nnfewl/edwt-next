import { AutoRefresh } from "./auto-refresh";
import { getPublicFacilities } from "./facilities-db";
import { getApproximateLocationOrigin } from "./location-origin";
import { ERNowPageClient } from "./page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ERNowPage() {
  // Two reads, parallelized. Distance is computed on the client once the GPS
  // override (if any) settles, so the DB query no longer takes origin.
  const [initialOrigin, facilities] = await Promise.all([
    getApproximateLocationOrigin(),
    getPublicFacilities(),
  ]);

  return (
    <>
      <AutoRefresh />
      <ERNowPageClient facilities={facilities} initialOrigin={initialOrigin} />
    </>
  );
}
