import { AutoRefresh } from "./auto-refresh";
import { getPublicFacilities } from "./facilities-db";
import { ERNowPageClient } from "./page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ERNowPage() {
  const facilities = await getPublicFacilities();

  return (
    <>
      <AutoRefresh />
      <ERNowPageClient facilities={facilities} />
    </>
  );
}
