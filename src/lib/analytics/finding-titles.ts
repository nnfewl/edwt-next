// Deterministic finding-title templates — one per section, each with a neutral
// fallback branch. No LLM, no freeform text.
import { fmtMin, weekdayName } from "./format";

const plural = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);

export function heroContext(i: { medianMin: number; ratio: number; weekday: string; partOfDay: string }): string {
  const pct = Math.round((i.ratio - 1) * 100);
  if (Math.abs(pct) <= 5) {
    return `The median ER wait is ${fmtMin(i.medianMin)} — right about typical for a ${i.weekday} ${i.partOfDay}.`;
  }
  const dir = pct > 0 ? "above" : "below";
  return `The median ER wait is ${fmtMin(i.medianMin)} — about ${Math.abs(pct)}% ${dir} what's typical for a ${i.weekday} ${i.partOfDay}.`;
}

export function heroDrivers(i: { drivers: { name: string; wait: number }[]; upccUnderHour: boolean }): string {
  if (i.drivers.length < 2) return "No single facility stands out right now.";
  const [a, b] = i.drivers;
  const tail = i.upccUnderHour ? " UPCCs remain under an hour." : "";
  return `Driving it: ${a.name} (${fmtMin(a.wait)}) and ${b.name} (${fmtMin(b.wait)}).${tail}`;
}

export function section01(i: { top2Share: number; partOfDay: string }): string {
  if (i.top2Share > 0.4) return `Two hospitals are carrying most of ${i.partOfDay}'s pressure.`;
  return `Waits are spread fairly evenly across the region ${i.partOfDay}.`;
}

export function section02(i: { peakStart: string; peakEnd: string; morningDeltaMin: number }): string {
  if (i.morningDeltaMin >= 30) {
    return `Waits peak from ${i.peakStart}–${i.peakEnd}; mornings run about ${fmtMin(i.morningDeltaMin)} lighter.`;
  }
  return "The regional wait holds fairly steady through the day.";
}

export function section03(i: { roughestDow: number; calmestDow: number; deltaMin: number }): string {
  if (i.deltaMin >= 20) {
    return `${weekdayName(i.roughestDow)}s are the roughest day — ${weekdayName(i.calmestDow)}s run about ${fmtMin(i.deltaMin)} lighter.`;
  }
  return "Waits look about the same on every day of the week.";
}

export function section04(i: { gapMin: number; trend: "widening" | "narrowing" | "steady" }): string {
  if (i.gapMin >= 30) {
    const t = i.trend === "steady" ? "holding steady" : i.trend;
    return `An ER visit costs about ${fmtMin(i.gapMin)} more than urgent care — and the gap is ${t}.`;
  }
  return "ER and urgent-care waits are running close together right now.";
}

export function section05(i: { facilityName: string; totalMin: number }): string {
  if (i.totalMin > 0) {
    return `Waiting is only half the story — a full ${i.facilityName} visit runs about ${fmtMin(i.totalMin)}.`;
  }
  return "Length-of-stay estimates aren't available right now.";
}

export function section06(i: { steadyLongName: string | null; gambleName: string | null }): string {
  if (i.steadyLongName && i.gambleName) {
    return `${i.steadyLongName} runs long but steady — ${i.gambleName} is a coin flip.`;
  }
  return "Most facilities swing about the same amount from day to day.";
}

export function section07(i: { calmDays: number; windowDays: number }): string {
  if (i.windowDays >= 14) {
    return `Only ${i.calmDays} genuinely calm ${plural(i.calmDays, "day")} in the last ${i.windowDays}.`;
  }
  return "Not enough history yet to pick out the calm days.";
}

export function section08(i: { leaderName: string; weeksAtTop: number }): string {
  if (i.weeksAtTop >= 2) {
    return `${i.leaderName} has run the region's longest waits for ${i.weeksAtTop} straight weeks.`;
  }
  return "No facility has held the top spot for long.";
}

export function section09(i: { climberName: string; climbBy: number; sliderName: string | null }): string {
  if (i.climbBy >= 1 && i.sliderName) {
    return `${i.climberName} has climbed ${i.climbBy} ${plural(i.climbBy, "place")} in three weeks — ${i.sliderName} is sliding.`;
  }
  return "The weekly standings have barely shifted.";
}

export function section10(i: { recordWaitMin: number }): string {
  if (i.recordWaitMin >= 60) {
    return `This month's records: a ${Math.round(i.recordWaitMin / 60)}-hour wait, a golden-hour lull, and one hospital that barely moved.`;
  }
  return "A month of records — the extremes hiding inside the averages.";
}
