import { describe, expect, it } from "vitest";
import {
  heroContext, heroDrivers, section01, section02, section03, section04,
  section05, section06, section07, section08, section09, section10,
} from "./finding-titles";

describe("heroContext", () => {
  it("states the median and signed deviation with ** emphasis spans", () => {
    expect(heroContext({ medianMin: 160, ratio: 1.35, weekday: "Wednesday", partOfDay: "tonight" }))
      .toBe("The median ER wait is **2h 40m** — about **35% above** what's typical for a Wednesday tonight.");
    expect(heroContext({ medianMin: 90, ratio: 0.8, weekday: "Sunday", partOfDay: "this morning" }))
      .toBe("The median ER wait is **1h 30m** — about **20% below** what's typical for a Sunday this morning.");
  });
  it("uses the neutral phrasing within ±5%", () => {
    expect(heroContext({ medianMin: 120, ratio: 1.03, weekday: "Monday", partOfDay: "this afternoon" }))
      .toBe("The median ER wait is **2h 0m** — right about typical for a Monday this afternoon.");
  });
});

describe("heroDrivers", () => {
  it("names the top two drivers and the UPCC clause", () => {
    expect(heroDrivers({ drivers: [{ name: "Surrey Memorial", wait: 300, delta: 62 }, { name: "Royal Columbian", wait: 260, delta: 48 }], upccUnderHour: true }))
      .toBe("Driving it: **Surrey Memorial (5h 0m)** and **Royal Columbian (4h 20m)**. UPCCs remain under an hour.");
  });
  it("omits the UPCC clause when a UPCC is over an hour", () => {
    expect(heroDrivers({ drivers: [{ name: "A", wait: 200, delta: 30 }, { name: "B", wait: 190, delta: 12 }], upccUnderHour: false }))
      .toBe("Driving it: **A (3h 20m)** and **B (3h 10m)**.");
  });
  it("says nothing is driving when every ED is at or below usual", () => {
    expect(heroDrivers({ drivers: [{ name: "A", wait: 96, delta: 0 }, { name: "B", wait: 167, delta: -39 }], upccUnderHour: false }))
      .toBe("Nothing is driving it — every ED is at or below its usual level.");
  });
  it("falls back when there are no drivers", () => {
    expect(heroDrivers({ drivers: [], upccUnderHour: true })).toBe("No single facility stands out right now.");
  });
});

describe("section01", () => {
  it("headlines concentration above the 40% share threshold", () => {
    expect(section01({ top2Share: 0.55, partOfDay: "tonight" }))
      .toBe("Two hospitals are carrying most of tonight's pressure.");
  });
  it("falls back to even spread at or below threshold", () => {
    expect(section01({ top2Share: 0.4, partOfDay: "this afternoon" }))
      .toBe("Waits are spread fairly evenly across the region this afternoon.");
  });
});

describe("section02", () => {
  it("describes the peak window and morning gap", () => {
    expect(section02({ peakStart: "5", peakEnd: "10pm", morningDeltaMin: 120 }))
      .toBe("Waits peak from 5–10pm; mornings run about 2h 0m lighter.");
  });
  it("falls back when the day is flat", () => {
    expect(section02({ peakStart: "5", peakEnd: "10pm", morningDeltaMin: 20 }))
      .toBe("The regional wait holds fairly steady through the day.");
  });
});

describe("section03", () => {
  it("contrasts roughest and calmest weekday", () => {
    expect(section03({ roughestDow: 1, calmestDow: 6, deltaMin: 55 }))
      .toBe("Mondays are the roughest day — Saturdays run about 55m lighter.");
  });
  it("falls back when days are similar", () => {
    expect(section03({ roughestDow: 1, calmestDow: 6, deltaMin: 10 }))
      .toBe("Waits look about the same on every day of the week.");
  });
});

describe("section04", () => {
  it("states the ER premium and gap trend", () => {
    expect(section04({ gapMin: 120, trend: "widening" }))
      .toBe("An ER visit costs about 2h 0m more than urgent care — and the gap is widening.");
    expect(section04({ gapMin: 95, trend: "steady" }))
      .toBe("An ER visit costs about 1h 35m more than urgent care — and the gap is holding steady.");
  });
  it("falls back when the gap is small", () => {
    expect(section04({ gapMin: 20, trend: "narrowing" }))
      .toBe("ER and urgent-care waits are running close together right now.");
  });
});

describe("section05", () => {
  it("names the full-visit total for the worst facility", () => {
    expect(section05({ facilityName: "Surrey Memorial", totalMin: 540 }))
      .toBe("Waiting is only half the story — a full Surrey Memorial visit runs about 9h 0m.");
  });
  it("falls back with no ELOS data", () => {
    expect(section05({ facilityName: "Surrey Memorial", totalMin: 0 }))
      .toBe("Length-of-stay estimates aren't available right now.");
  });
});

describe("section06", () => {
  it("contrasts the steady-but-long and the gamble", () => {
    expect(section06({ steadyLongName: "Richmond", gambleName: "Eagle Ridge" }))
      .toBe("Richmond runs long but steady — Eagle Ridge is a coin flip.");
  });
  it("falls back when neither extreme is present", () => {
    expect(section06({ steadyLongName: null, gambleName: "Eagle Ridge" }))
      .toBe("Most facilities swing about the same amount from day to day.");
  });
});

describe("section07", () => {
  it("counts the calm days", () => {
    expect(section07({ calmDays: 4, windowDays: 30 }))
      .toBe("Only 4 genuinely calm days in the last 30.");
    expect(section07({ calmDays: 1, windowDays: 30 }))
      .toBe("Only 1 genuinely calm day in the last 30.");
  });
  it("falls back with too little history", () => {
    expect(section07({ calmDays: 0, windowDays: 9 }))
      .toBe("Not enough history yet to pick out the calm days.");
  });
});

describe("section08", () => {
  it("names the persistent leader", () => {
    expect(section08({ leaderName: "Surrey Memorial", weeksAtTop: 3 }))
      .toBe("Surrey Memorial has run the region's longest waits for 3 straight weeks.");
  });
  it("falls back with no durable leader", () => {
    expect(section08({ leaderName: "Surrey Memorial", weeksAtTop: 1 }))
      .toBe("No facility has held the top spot for long.");
  });
});

describe("section09", () => {
  it("highlights the climber and slider", () => {
    expect(section09({ climberName: "Burnaby", climbBy: 2, sliderName: "Langley" }))
      .toBe("Burnaby has climbed 2 places in three weeks — Langley is sliding.");
    expect(section09({ climberName: "Burnaby", climbBy: 1, sliderName: "Langley" }))
      .toBe("Burnaby has climbed 1 place in three weeks — Langley is sliding.");
  });
  it("falls back when nothing moved", () => {
    expect(section09({ climberName: "Burnaby", climbBy: 0, sliderName: "Langley" }))
      .toBe("The weekly standings have barely shifted.");
    expect(section09({ climberName: "Burnaby", climbBy: 2, sliderName: null }))
      .toBe("The weekly standings have barely shifted.");
  });
});

describe("section10", () => {
  it("summarizes the record wait in whole hours", () => {
    expect(section10({ recordWaitMin: 525 }))
      .toBe("This month's records: a 9-hour wait, a golden-hour lull, and one hospital that barely moved.");
  });
  it("falls back with no notable record", () => {
    expect(section10({ recordWaitMin: 40 }))
      .toBe("A month of records — the extremes hiding inside the averages.");
  });
});
