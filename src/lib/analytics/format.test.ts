import { describe, expect, it } from "vitest";
import { fmtMin, partOfDay, weekdayName, pctDelta } from "./format";

describe("fmtMin", () => {
  it("formats sub-hour values as minutes", () => {
    expect(fmtMin(25)).toBe("25m");
    expect(fmtMin(0)).toBe("0m");
  });
  it("formats hour+ values as Xh Ym, dropping a trailing 0m to '0m'", () => {
    expect(fmtMin(60)).toBe("1h 0m");
    expect(fmtMin(160)).toBe("2h 40m");
    expect(fmtMin(300)).toBe("5h 0m");
  });
  it("rounds fractional minutes", () => {
    expect(fmtMin(64.6)).toBe("1h 5m");
  });
});

describe("partOfDay", () => {
  it("buckets the hour into a natural-language window", () => {
    expect(partOfDay(3)).toBe("overnight");
    expect(partOfDay(9)).toBe("this morning");
    expect(partOfDay(14)).toBe("this afternoon");
    expect(partOfDay(19)).toBe("tonight");
  });
});

describe("weekdayName", () => {
  it("maps a 0=Sunday..6=Saturday index to a full name", () => {
    expect(weekdayName(0)).toBe("Sunday");
    expect(weekdayName(1)).toBe("Monday");
    expect(weekdayName(6)).toBe("Saturday");
  });
});

describe("pctDelta", () => {
  it("returns a signed rounded percentage vs a baseline of 1.0", () => {
    expect(pctDelta(1.35)).toBe(35);
    expect(pctDelta(0.8)).toBe(-20);
    expect(pctDelta(1.0)).toBe(0);
  });
});
