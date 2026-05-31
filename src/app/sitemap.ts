import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://edwt.ca";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "always", priority: 1 },
    { url: `${base}/map`, lastModified: new Date(), changeFrequency: "always", priority: 0.9 },
    { url: `${base}/analytics`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/llms.txt`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.3 },
    { url: `${base}/llms-full.txt`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.3 },
  ];
}
