import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AutoRefresh } from "./auto-refresh";
import { getPublicFacilities } from "./facilities-db";
import { getApproximateLocationOrigin } from "./location-origin";
import { ERNowPageClient } from "./page-client";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ERNowPage() {
  // Three reads, parallelized. Distance is computed on the client once the GPS
  // override (if any) settles, so the DB query no longer takes origin.
  const [initialOrigin, facilities, t] = await Promise.all([
    getApproximateLocationOrigin(),
    getPublicFacilities(),
    getTranslations("metadata"),
  ]);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "EDWT",
      url: "https://edwt.ca",
      description: t("jsonLdWebsiteDesc"),
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
      description: t("jsonLdAppDesc"),
      featureList: t("jsonLdFeatureList"),
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
