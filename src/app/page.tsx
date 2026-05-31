import type { Metadata } from "next";
import { AutoRefresh } from "./auto-refresh";
import { getPublicFacilities } from "./facilities-db";
import { getApproximateLocationOrigin } from "./location-origin";
import { ERNowPageClient } from "./page-client";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "EDWT",
  url: "https://edwt.ca",
  description:
    "Live wait times for emergency departments and urgent care centres across the Lower Mainland, BC.",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://edwt.ca/?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default async function ERNowPage() {
  // Two reads, parallelized. Distance is computed on the client once the GPS
  // override (if any) settles, so the DB query no longer takes origin.
  const [initialOrigin, facilities] = await Promise.all([
    getApproximateLocationOrigin(),
    getPublicFacilities(),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AutoRefresh />
      <ERNowPageClient facilities={facilities} initialOrigin={initialOrigin} />
    </>
  );
}
