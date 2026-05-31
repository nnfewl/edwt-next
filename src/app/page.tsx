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

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "EDWT",
    url: "https://edwt.ca",
    description:
      "Live wait times for emergency departments and urgent care centres across the Lower Mainland, BC. Updated every 60 seconds from official BC health authority data.",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://edwt.ca/?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "EDWT",
    url: "https://edwt.ca",
    applicationCategory: "HealthApplication",
    operatingSystem: "Any",
    description:
      "Free real-time emergency department and urgent care wait time tracker for the Lower Mainland, British Columbia. Shows live wait times, physician counts, and patient volumes for 12+ hospitals and UPCCs. Data sourced from the official edwaittimes.ca feed every 60 seconds.",
    featureList:
      "Live wait times, GPS distance sorting, Interactive map, Historical analytics, Progressive Web App, 60-second refresh",
    areaServed: {
      "@type": "GeoCircle",
      geoMidpoint: { "@type": "GeoCoordinates", latitude: 49.2, longitude: -122.9 },
      geoRadius: "80000",
    },
    provider: {
      "@type": "Organization",
      name: "EDWT",
      url: "https://edwt.ca",
    },
  },
];

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
