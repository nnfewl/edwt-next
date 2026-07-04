// Shared health-authority registry + classifier. BC ER/UPCC facilities operate
// under a regional health authority rather than their own site, so both the map
// markers and the analytics badges show the operating authority's favicon.
// Classify by name override first (Children's / Women's / Providence sites),
// then by the city found in the address; Fraser Health is the largest-by-count
// fallback. Keep this DOM-free so it stays unit-testable and server-usable.

export const HEALTH_AUTHORITIES = {
  bcchildrens: { name: "BC Children's Hospital", faviconPath: "/health-authorities/bcchildrens.png", badgeBackground: "#ffffff" },
  bcwomens: { name: "BC Women's Hospital", faviconPath: "/health-authorities/bcwomens.png", badgeBackground: "#ffffff" },
  fraserhealth: { name: "Fraser Health", faviconPath: "/health-authorities/fraserhealth.ico", badgeBackground: "#ffffff" },
  providencehealthcare: { name: "Providence Health Care", faviconPath: "/health-authorities/providencehealthcare.ico", badgeBackground: "#ffffff" },
  vch: { name: "Vancouver Coastal Health", faviconPath: "/health-authorities/vch.png", badgeBackground: "#0078AE" },
} as const;

export type HealthAuthorityKey = keyof typeof HEALTH_AUTHORITIES;
export type HealthAuthority = { key: HealthAuthorityKey } & (typeof HEALTH_AUTHORITIES)[HealthAuthorityKey];

const VCH_PLACES = ["vancouver", "north vancouver", "west vancouver", "richmond", "sechelt", "gibsons", "squamish", "whistler", "pemberton", "powell river"];

export function authority(key: HealthAuthorityKey): HealthAuthority {
  return { key, ...HEALTH_AUTHORITIES[key] };
}

export function healthAuthorityFor(facility: { name: string; address: string | null }): HealthAuthority {
  const name = facility.name.toLowerCase();
  if (name.includes("children")) return authority("bcchildrens");
  if (name.includes("women")) return authority("bcwomens");
  if (
    name.includes("st. paul") || name.includes("st paul") || name.includes("saint paul") ||
    name.includes("mount saint joseph") || name.includes("mount st. joseph") || name.includes("mount st joseph")
  ) {
    return authority("providencehealthcare");
  }
  const haystack = ((facility.address ?? "") + " " + facility.name).toLowerCase();
  if (VCH_PLACES.some((place) => haystack.includes(place))) return authority("vch");
  return authority("fraserhealth");
}
