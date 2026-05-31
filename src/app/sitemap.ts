import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://edwt.ca";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "always", priority: 1 },
    { url: `${base}/map`, lastModified: new Date(), changeFrequency: "always", priority: 0.9 },
    { url: `${base}/analytics`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
  ];
}
