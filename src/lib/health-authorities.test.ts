import { describe, expect, it } from "vitest";
import { healthAuthorityFor, HEALTH_AUTHORITIES } from "./health-authorities";

describe("healthAuthorityFor", () => {
  it("routes children's / women's by name override", () => {
    expect(healthAuthorityFor({ name: "BC Children's Hospital", address: "Vancouver" }).key).toBe("bcchildrens");
    expect(healthAuthorityFor({ name: "BC Women's Hospital", address: "Vancouver" }).key).toBe("bcwomens");
  });

  it("routes Providence sites by name override", () => {
    expect(healthAuthorityFor({ name: "St. Paul's", address: "1081 Burrard St" }).key).toBe("providencehealthcare");
    expect(healthAuthorityFor({ name: "Mount Saint Joseph", address: "3080 Prince Edward St" }).key).toBe("providencehealthcare");
  });

  it("routes VCH by city in the address", () => {
    expect(healthAuthorityFor({ name: "Richmond Hospital", address: "7000 Westminster Hwy, Richmond" }).key).toBe("vch");
    expect(healthAuthorityFor({ name: "Lions Gate", address: "231 E 15th St, North Vancouver" }).key).toBe("vch");
  });

  it("falls back to Fraser Health", () => {
    expect(healthAuthorityFor({ name: "Surrey Memorial", address: "13750 96 Ave, Surrey" }).key).toBe("fraserhealth");
  });

  it("exposes a favicon path + badge background for every authority", () => {
    for (const a of Object.values(HEALTH_AUTHORITIES)) {
      expect(a.faviconPath).toMatch(/^\/health-authorities\//);
      expect(a.badgeBackground).toMatch(/^#/);
    }
  });
});
