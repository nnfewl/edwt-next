import { describe, expect, it } from "vitest";
import { parseAddress } from "./address";

describe("parseAddress", () => {
  it("returns the fallback for missing addresses", () => {
    expect(parseAddress(null)).toEqual({
      address: "Address not available",
      addressStreet: "Address not available",
      addressCity: "",
    });
  });

  it("splits a standard street, city, BC postal address", () => {
    expect(parseAddress("920 West 10th Ave, Vancouver, BC V5Z 1M9")).toEqual({
      address: "920 West 10th Ave, Vancouver, BC V5Z 1M9",
      addressStreet: "920 West 10th Ave",
      addressCity: "Vancouver, BC V5Z 1M9",
    });
  });

  it("normalizes a comma after BC", () => {
    expect(parseAddress("13750 96 Ave, Surrey, BC, V3V 1Z2").addressCity).toBe("Surrey, BC V3V 1Z2");
  });

  it("splits on the last space when the city is not comma-separated", () => {
    expect(parseAddress("13750 96 Ave Surrey, BC V3V 1Z2")).toEqual({
      address: "13750 96 Ave Surrey, BC V3V 1Z2",
      addressStreet: "13750 96 Ave",
      addressCity: "Surrey, BC V3V 1Z2",
    });
  });

  it("keeps the whole address as street when BC is absent", () => {
    expect(parseAddress("475 Guildford Way, Port Moody")).toEqual({
      address: "475 Guildford Way, Port Moody",
      addressStreet: "475 Guildford Way, Port Moody",
      addressCity: "",
    });
  });

  it("does not treat BC inside a word as the province", () => {
    const parsed = parseAddress("12 Abcdef St, Kelowna");
    expect(parsed.addressCity).toBe("");
  });
});
