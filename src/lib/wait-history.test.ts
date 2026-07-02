import { describe, expect, it } from "vitest";
import { parseWaitHistory } from "./wait-history";

describe("parseWaitHistory", () => {
  it("returns [] for non-array input", () => {
    expect(parseWaitHistory(null)).toEqual([]);
    expect(parseWaitHistory("not json")).toEqual([]);
    expect(parseWaitHistory({})).toEqual([]);
  });

  it("parses rows with ISO strings or Date instances", () => {
    const iso = "2026-07-02T10:00:00.000Z";
    expect(
      parseWaitHistory([
        { observed_at: iso, wait_time_minutes: 45 },
        { observed_at: new Date(iso), wait_time_minutes: 50 },
      ]),
    ).toEqual([
      { observedAt: iso, min: 45 },
      { observedAt: iso, min: 50 },
    ]);
  });

  it("accepts a JSON string payload", () => {
    const raw = JSON.stringify([{ observed_at: "2026-07-02T10:00:00.000Z", wait_time_minutes: 30 }]);
    expect(parseWaitHistory(raw)).toHaveLength(1);
  });

  it("skips malformed entries and clamps negatives", () => {
    const rows = parseWaitHistory([
      null,
      { observed_at: "invalid", wait_time_minutes: 10 },
      { observed_at: "2026-07-02T10:00:00.000Z", wait_time_minutes: "abc" },
      { observed_at: "2026-07-02T10:00:00.000Z", wait_time_minutes: -5 },
    ]);
    expect(rows).toEqual([{ observedAt: "2026-07-02T10:00:00.000Z", min: 0 }]);
  });

  it("keeps only the last 12 points", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      observed_at: `2026-07-02T${String(i).padStart(2, "0")}:00:00.000Z`,
      wait_time_minutes: i,
    }));
    const rows = parseWaitHistory(many);
    expect(rows).toHaveLength(12);
    expect(rows[0].min).toBe(8);
  });
});
