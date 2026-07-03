# Analytics Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/analytics` as a public, story-driven dashboard — a hero pressure index, a stat strip, and ten numbered sections that each lead with a data-derived finding sentence — replacing the current ops-telemetry-heavy page.

**Architecture:** Static charts are hand-rolled SVG **server components** (they arrive in the initial HTML) built on `d3-scale` + `d3-shape`; the few interactive pieces (week-day selector, paginated lists) are small `"use client"` components that slice an already-fetched payload. One server-side `Promise.all` query batch in `src/app/analytics/analytics-data.ts` feeds every section (30s in-process cache + inflight coalescing, ISR `revalidate = 60`). All finding titles are deterministic template functions in `src/lib/analytics/` (no LLM) with a neutral fallback per branch, unit-tested in vitest.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4 + a scoped `styles.css` design system, `postgres.js` raw SQL, `d3-scale`/`d3-shape`, vitest.

**Visual source of truth:** `docs/plans/mockups/analytics-redesign-mockup.html` (Sage palette only in production). Each chart task cites the exact mockup renderer function + line range it ports. The mockup is committed — treat its SVG geometry math as the reference implementation, translated faithfully into React.

**Design spec:** `docs/plans/analytics-redesign.md` — read it before starting.

---

## Prerequisites (do these before / alongside implementation)

### P0. Retention rollup applied on Supabase — **HARD PREREQUISITE, needs explicit user go-ahead**

Section 07 ("The month") grows with `wait_time_hourly`, and prod hits its 500 MB Supabase cap around **2026-07-30**, at which point ingestion stops. The rollup is reviewed and ready in `docs/plans/retention-rollup.md` ("Apply runbook" section). The prod steps (migrate, backfill, schedule `rollup-hourly` + `prune-readings-daily`, flip `USE_HOURLY_ROLLUP=1`) **must not be run without the user's explicit approval** — they touch the production database.

**This plan does not execute P0.** Sections that read ≤30 days work against the local Docker DB during development regardless of the rollup. Section 07 and any future long-horizon toggle depend on `wait_time_hourly` being populated. Flag this to the user at kickoff and get a go/no-go on the prod rollup steps before the section 07 task (Task 18) is considered production-complete.

### P1. Dependencies (Task 1 handles this in-repo)

Add `d3-scale`, `d3-shape`, `@types/d3-scale`, `@types/d3-shape`. Remove `chart.js` (this page is its only consumer).

### P2. Assets already present

Health-authority favicons exist in `public/health-authorities/` (`fraserhealth.ico`, `vch.png`, `providencehealthcare.ico`, `bcchildrens.png`, `bcwomens.ico`, `reachcentre.ico`). No new assets needed.

---

## File Structure

**New — pure logic (vitest-tested), `src/lib/`:**
- `src/lib/health-authorities.ts` — shared HA registry + `healthAuthorityFor({ name, address })`. Extracted from `map-client.tsx` so map markers and analytics badges share one source. Test: `src/lib/health-authorities.test.ts`.
- `src/lib/analytics/format.ts` — `fmtMin`, `partOfDay`, `weekdayName`, pct helpers. Test: `format.test.ts`.
- `src/lib/analytics/pressure-index.ts` — `pressureStatus(ratio)` + threshold constants. Test: `pressure-index.test.ts`.
- `src/lib/analytics/paginate.ts` — `paginate(items, page, size)` + `pageCount`. Test: `paginate.test.ts`.
- `src/lib/analytics/finding-titles.ts` — one pure function per section returning its finding sentence, each with a neutral fallback. Test: `finding-titles.test.ts`.

**New — data layer:**
- `src/app/analytics/analytics-data.ts` — row types, the `Promise.all` query batch, 30s cache + inflight coalescing, deadline guard. Exports `getAnalytics(): Promise<AnalyticsResult>` and a normalized `AnalyticsView` shape consumed by `page.tsx`.

**New — charts, `src/app/analytics/charts/`:**
- `chart-theme.ts` — Sage color tokens, severity/heat ramps, d3 scale + Catmull-Rom path helpers, shared SVG formatters.
- `HABadge.tsx` — server component: favicon-in-ring badge (22px, 1px border).
- `Pager.tsx` — `"use client"` numbered-pill pager (shared by the paginated lists).
- `PressureHero.tsx` · `StatStrip.tsx` · `RankedBars.tsx` (client) · `HourHeatmap.tsx` · `DayProfile.tsx` · `WeekTiles.tsx` (client) · `GapTrend.tsx` · `WaitDistribution.tsx` · `VisitCost.tsx` (client) · `SwingScatter.tsx` · `MonthCalendar.tsx` · `LeagueTable.tsx` (client) · `BumpChart.tsx` · `RecordsBoard.tsx`.

**Modified:**
- `src/app/layout.tsx` — add `Fraunces` via `next/font/google` (`--font-fraunces`).
- `src/app/analytics/page.tsx` — rewritten to compose the new sections; data fetching moves to `analytics-data.ts`.
- `src/app/analytics/styles.css` — replaced with the Sage design system ported from the mockup `<style>` block.
- `src/app/analytics/loading.tsx` — skeleton updated to the new layout (hero + strip + section stubs).
- `src/app/map/map-client.tsx` — import `healthAuthorityFor`/registry from the shared lib instead of its local copy.
- `package.json` — deps updated (Task 1).

**Deleted:**
- `src/app/analytics/analytics-charts.tsx` — the chart.js consumer; superseded by the SVG chart components.

---

## Conventions used throughout

- **TDD for pure logic only.** `src/lib/analytics/*` and `health-authorities.ts` are test-first (write failing test → run → implement → pass → commit). SVG chart components are visual; they are written directly and verified in the browser pass (Task 22). This matches the spec's Testing section (unit-test pure functions; SQL against local Docker DB; visual browser pass).
- **Facility name normalization:** the same UPCC regex used in `facilities-db.ts` (`toFacility`) applies to display names.
- **Colors in SVG** use the hex constants from `chart-theme.ts` (self-contained, no CSS-var timing risk); structural page chrome uses CSS custom properties from `styles.css`.
- **Commit strategy (grouped):** commits are grouped **per phase**, not per task — one logical commit at each phase boundary (≈5 total), created by the controller after the phase's tasks pass review. The `git commit` step shown inside each task is **superseded**: implementers stage/leave changes in the working tree and do **not** run git. Ignore the per-task commit messages; use phase-level messages instead (e.g. `feat(analytics): foundation — pure logic, theme, shared components`).
- **Run the local DB first** for any SQL work: `pnpm db:up` (Docker Postgres on 5433). It has been backfilled from prod (41 locations, ~690k readings, May 26–Jul 2). Seed/verify against it, never prod, during development.

---

## Phase 1 — Foundation (pure logic, theme, shared UI)

### Task 1: Swap chart dependencies

**Files:**
- Modify: `package.json`

> **Sequencing:** only *add* deps here. `chart.js` stays until Task 24 removes it alongside deleting its sole consumer `analytics-charts.tsx` — removing it now would break `tsc`/build on this commit (CI runs per commit), since `analytics-charts.tsx` still imports it.

- [ ] **Step 1: Add the new chart deps**

```bash
pnpm add d3-scale d3-shape
pnpm add -D @types/d3-scale @types/d3-shape
```

- [ ] **Step 2: Verify install + typecheck baseline**

Run: `pnpm install && pnpm exec tsc --noEmit`
Expected: install succeeds; tsc still passes (chart.js + analytics-charts.tsx still present and valid at this point).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(analytics): add d3-scale/d3-shape"
```

---

### Task 2: Shared health-authority module

Extract the HA registry + classifier from `map-client.tsx` into `src/lib/` so the analytics badges and the map markers share one implementation. The classifier keys off name + address only (no DOM), so it is trivially testable.

**Files:**
- Create: `src/lib/health-authorities.ts`
- Test: `src/lib/health-authorities.test.ts`
- Modify: `src/app/map/map-client.tsx:62-115` (import from the lib, delete the local copy)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/health-authorities.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/health-authorities.test.ts`
Expected: FAIL — cannot find module `./health-authorities`.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/health-authorities.ts
// Shared health-authority registry + classifier. BC ER/UPCC facilities operate
// under a regional health authority rather than their own site, so both the map
// markers and the analytics badges show the operating authority's favicon.
// Classify by name override first (Children's / Women's / Providence sites),
// then by the city found in the address; Fraser Health is the largest-by-count
// fallback. Keep this DOM-free so it stays unit-testable and server-usable.

export const HEALTH_AUTHORITIES = {
  bcchildrens: { name: "BC Children's Hospital", faviconPath: "/health-authorities/bcchildrens.png", badgeBackground: "#ffffff" },
  bcwomens: { name: "BC Women's Hospital", faviconPath: "/health-authorities/bcwomens.ico", badgeBackground: "#ffffff" },
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/health-authorities.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Refactor map-client.tsx to use the shared module**

In `src/app/map/map-client.tsx`: delete the local `HEALTH_AUTHORITIES` const (lines ~62-68), the `HealthAuthorityKey`/`HealthAuthority` types (~70,72), the `VCH_PLACES` const (~88), the `authority()` helper (~90-92), and the `healthAuthorityFor(facility: Facility)` function (~102-115). Add to the import block near the top of the file:

```ts
import { HEALTH_AUTHORITIES, authority, healthAuthorityFor, type HealthAuthority, type HealthAuthorityKey } from "@/lib/health-authorities";
```

The existing call sites (`healthAuthorityFor(facility)`, `markerImageId(key, ...)`, `HEALTH_AUTHORITIES[...]`) keep working because `Facility` structurally satisfies `{ name, address }`.

- [ ] **Step 6: Verify the map still typechecks and lints**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run src/lib/health-authorities.test.ts`
Expected: tsc passes; tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/health-authorities.ts src/lib/health-authorities.test.ts src/app/map/map-client.tsx
git commit -m "refactor: extract shared health-authorities module"
```

---

### Task 3: Analytics formatters

**Files:**
- Create: `src/lib/analytics/format.ts`
- Test: `src/lib/analytics/format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/format.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/format.test.ts`
Expected: FAIL — cannot find module `./format`.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/analytics/format.ts
// Pure formatters shared by the analytics finding-titles and SVG charts.

/** Minutes → "Xm" or "Xh Ym" (mockup `fmtMin`). */
export function fmtMin(v: number): string {
  if (v >= 60) {
    const m = Math.round(v % 60);
    return `${Math.floor(v / 60)}h ${m}m`;
  }
  return `${Math.round(v)}m`;
}

/** Natural-language window for a 24h clock hour (Vancouver local). */
export function partOfDay(hour: number): string {
  if (hour < 6) return "overnight";
  if (hour < 12) return "this morning";
  if (hour < 17) return "this afternoon";
  return "tonight";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** 0=Sunday..6=Saturday → full weekday name. */
export function weekdayName(index: number): string {
  return WEEKDAYS[((index % 7) + 7) % 7];
}

/** Ratio vs typical (1.0) → signed integer percent, e.g. 1.35 → 35. */
export function pctDelta(ratio: number): number {
  return Math.round((ratio - 1) * 100);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/format.ts src/lib/analytics/format.test.ts
git commit -m "feat(analytics): add shared formatters"
```

---

### Task 4: Pressure-index classification

**Files:**
- Create: `src/lib/analytics/pressure-index.ts`
- Test: `src/lib/analytics/pressure-index.test.ts`

- [ ] **Step 1: Write the failing test**

Thresholds from the spec: `<0.8 Calm`, `0.8–1.15 Typical`, `1.15–1.6 Elevated`, `>1.6 Severe`. Boundaries are inclusive-low (`>=`).

```ts
// src/lib/analytics/pressure-index.test.ts
import { describe, expect, it } from "vitest";
import { pressureStatus, PRESSURE_STATUSES } from "./pressure-index";

describe("pressureStatus", () => {
  it("classifies each band by ratio", () => {
    expect(pressureStatus(0.5)).toBe("Calm");
    expect(pressureStatus(0.79)).toBe("Calm");
    expect(pressureStatus(0.8)).toBe("Typical");
    expect(pressureStatus(1.0)).toBe("Typical");
    expect(pressureStatus(1.15)).toBe("Elevated");
    expect(pressureStatus(1.59)).toBe("Elevated");
    expect(pressureStatus(1.6)).toBe("Severe");
    expect(pressureStatus(3)).toBe("Severe");
  });

  it("orders the status words calm→severe for the gauge", () => {
    expect(PRESSURE_STATUSES).toEqual(["Calm", "Typical", "Elevated", "Severe"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/pressure-index.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/analytics/pressure-index.ts
// Hero pressure index: regional current median ÷ typical baseline → status word.

export const PRESSURE_STATUSES = ["Calm", "Typical", "Elevated", "Severe"] as const;
export type PressureStatus = (typeof PRESSURE_STATUSES)[number];

/** Ratio → status word. Bands: <0.8 Calm · 0.8–1.15 Typical · 1.15–1.6 Elevated · ≥1.6 Severe. */
export function pressureStatus(ratio: number): PressureStatus {
  if (ratio < 0.8) return "Calm";
  if (ratio < 1.15) return "Typical";
  if (ratio < 1.6) return "Elevated";
  return "Severe";
}

/** Zero-based gauge index (0..3) for the active status segment. */
export function pressureIndex(ratio: number): number {
  return PRESSURE_STATUSES.indexOf(pressureStatus(ratio));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/pressure-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/pressure-index.ts src/lib/analytics/pressure-index.test.ts
git commit -m "feat(analytics): add pressure-index classification"
```

---

### Task 5: Pagination helper

**Files:**
- Create: `src/lib/analytics/paginate.ts`
- Test: `src/lib/analytics/paginate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/paginate.test.ts
import { describe, expect, it } from "vitest";
import { paginate, pageCount, PAGE_SIZE } from "./paginate";

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i);

  it("defaults to a page size of 10", () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it("slices the requested page", () => {
    expect(paginate(items, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(items, 2)).toEqual([20, 21, 22]);
  });

  it("clamps out-of-range pages to empty without throwing", () => {
    expect(paginate(items, 99)).toEqual([]);
    expect(paginate(items, -1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("counts pages, with a floor of 1", () => {
    expect(pageCount(23)).toBe(3);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/paginate.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/analytics/paginate.ts
// Pure client-side pagination over an already-fetched payload (10 per page).

export const PAGE_SIZE = 10;

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): T[] {
  const start = Math.max(0, page) * size;
  return items.slice(start, start + size);
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/paginate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/paginate.ts src/lib/analytics/paginate.test.ts
git commit -m "feat(analytics): add pagination helper"
```

---

### Task 6: Finding-title templates

This is the heart of the redesign: every section title is a deterministic sentence computed from scalar inputs, each with a neutral fallback. Keeping the functions scalar-in / string-out makes every branch trivially testable; the data layer (Task 7) computes the scalars.

**Files:**
- Create: `src/lib/analytics/finding-titles.ts`
- Test: `src/lib/analytics/finding-titles.test.ts`

**The finalized rule table** (referenced by the section tasks):

| Fn | Inputs | Finding (primary) | Fallback |
|----|--------|-------------------|----------|
| `heroContext` | `medianMin, ratio, weekday, partOfDay` | "The median ER wait is **{fmtMin}** — about **{pct}% {above\|below}** what's typical for a {weekday} {partOfDay}." | ratio within ±5%: "…is **{fmtMin}** — right about typical for a {weekday} {partOfDay}." |
| `heroDrivers` | `drivers[{name,wait}], upccUnderHour` | "Driving it: **{A}** and **{B}**.{ UPCCs remain under an hour.}" | no drivers: "No single facility stands out right now." |
| `section01` | `top2Share, partOfDay` | "Two hospitals are carrying most of {partOfDay}'s pressure." (share > 0.4) | "Waits are spread fairly evenly across the region {partOfDay}." |
| `section02` | `peakStart, peakEnd, morningDeltaMin` | "Waits peak from {peakStart}–{peakEnd}; mornings run about {fmtMin} lighter." (delta ≥ 30) | "The regional wait holds fairly steady through the day." |
| `section03` | `roughestDow, calmestDow, deltaMin` | "{Roughest}s are the roughest day — {Calmest}s run about {fmtMin} lighter." (delta ≥ 20) | "Waits look about the same on every day of the week." |
| `section04` | `gapMin, trend` | "An ER visit costs about {fmtMin} more than urgent care — and the gap is {widening\|narrowing\|holding steady}." (gap ≥ 30) | "ER and urgent-care waits are running close together right now." |
| `section05` | `facilityName, totalMin` | "Waiting is only half the story — a full {facility} visit runs about {fmtMin}." (totalMin > 0) | "Length-of-stay estimates aren't available right now." |
| `section06` | `steadyLongName, gambleName` | "{Steady} runs long but steady — {Gamble} is a coin flip." (both present) | "Most facilities swing about the same amount from day to day." |
| `section07` | `calmDays, windowDays` | "Only {calmDays} genuinely calm day{s} in the last {windowDays}." (windowDays ≥ 14) | "Not enough history yet to pick out the calm days." |
| `section08` | `leaderName, weeksAtTop` | "{Leader} has run the region's longest waits for {weeksAtTop} straight weeks." (weeksAtTop ≥ 2) | "No facility has held the top spot for long." |
| `section09` | `climberName, climbBy, sliderName` | "{Climber} has climbed {climbBy} place{s} in three weeks — {Slider} is sliding." (climbBy ≥ 1 && slider) | "The weekly standings have barely shifted." |
| `section10` | `recordWaitMin` | "This month's records: a {roundHours}-hour wait, a golden-hour lull, and one hospital that barely moved." (recordWaitMin ≥ 60) | "A month of records — the extremes hiding inside the averages." |

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/finding-titles.test.ts
import { describe, expect, it } from "vitest";
import {
  heroContext, heroDrivers, section01, section02, section03, section04,
  section05, section06, section07, section08, section09, section10,
} from "./finding-titles";

describe("heroContext", () => {
  it("states the median and signed deviation", () => {
    expect(heroContext({ medianMin: 160, ratio: 1.35, weekday: "Wednesday", partOfDay: "tonight" }))
      .toBe("The median ER wait is 2h 40m — about 35% above what's typical for a Wednesday tonight.");
    expect(heroContext({ medianMin: 90, ratio: 0.8, weekday: "Sunday", partOfDay: "this morning" }))
      .toBe("The median ER wait is 1h 30m — about 20% below what's typical for a Sunday this morning.");
  });
  it("uses the neutral phrasing within ±5%", () => {
    expect(heroContext({ medianMin: 120, ratio: 1.03, weekday: "Monday", partOfDay: "this afternoon" }))
      .toBe("The median ER wait is 2h 0m — right about typical for a Monday this afternoon.");
  });
});

describe("heroDrivers", () => {
  it("names the top two drivers and the UPCC clause", () => {
    expect(heroDrivers({ drivers: [{ name: "Surrey Memorial", wait: 300 }, { name: "Royal Columbian", wait: 260 }], upccUnderHour: true }))
      .toBe("Driving it: Surrey Memorial (5h 0m) and Royal Columbian (4h 20m). UPCCs remain under an hour.");
  });
  it("omits the UPCC clause when a UPCC is over an hour", () => {
    expect(heroDrivers({ drivers: [{ name: "A", wait: 200 }, { name: "B", wait: 190 }], upccUnderHour: false }))
      .toBe("Driving it: A (3h 20m) and B (3h 10m).");
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/finding-titles.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/analytics/finding-titles.ts
// Deterministic finding-title templates — one per section, each with a neutral
// fallback branch. No LLM, no freeform text. See the rule table in
// docs/plans/analytics-redesign-implementation.md (Task 6).
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/finding-titles.test.ts`
Expected: PASS (all branches + fallbacks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/finding-titles.ts src/lib/analytics/finding-titles.test.ts
git commit -m "feat(analytics): add finding-title templates"
```

---

### Task 7: Chart theme

The shared SVG toolkit: Sage tokens, severity/heat ramps, d3 scale + Catmull-Rom helpers, and re-exported formatters.

**Files:**
- Create: `src/app/analytics/charts/chart-theme.ts`

- [ ] **Step 1: Write the module** (no test — these are constants + thin d3 wrappers, exercised by the chart tasks and the browser pass)

```ts
// src/app/analytics/charts/chart-theme.ts
import { scaleLinear } from "d3-scale";
import { line as d3line, curveCatmullRom } from "d3-shape";

export { fmtMin } from "@/lib/analytics/format";

// Sage palette — production ships this only (the mockup's other palettes are a
// mock-only lab). Values mirror PALETTES.sage in the mockup.
export const SAGE = {
  ink: "#171a18", ink2: "#3b403d", muted: "#71766f", faint: "#9aa098",
  line: "#e5e9e4", surface: "#ffffff", bg: "#f4f6f2", card2: "#fafbf8", track: "#eef1ec",
  primary: "#0f766e", primarySoft: "#e2efec",
  hot: "#b5462d", good: "#15803d", rose: "#be123c",
  grid: "#eef1ec", tick: "#9aa098",
  band: "rgba(15,118,110,0.09)", todayFillTop: 0.2,
} as const;

// Warm severity ramp shared by all charts (spec §Visual design).
export function severityColor(v: number): string {
  return v >= 300 ? "#8f2a22" : v >= 240 ? "#b5462d" : v >= 180 ? "#cf6a3c" : v >= 120 ? "#dd8a4d" : v >= 60 ? "#d9a44a" : "#84a86a";
}

// Heatmap ramp (green → honey → apricot → terracotta → coral → brick).
export const HEAT = ["#e4f2ef", "#b8ddd4", "#e9c78d", "#e89b73", "#d66d5b", "#b94a45"];
export function heatColor(v: number): string {
  return HEAT[v >= 300 ? 5 : v >= 240 ? 4 : v >= 180 ? 3 : v >= 120 ? 2 : v >= 60 ? 1 : 0];
}

// Distribution segment ramp (< 1h → 4h+).
export const DIST = ["#84a86a", "#d9a44a", "#dd8a4d", "#cf6a3c", "#b5462d"];

/** Linear scale factory (thin d3-scale wrapper). */
export function linear(domain: [number, number], range: [number, number]) {
  return scaleLinear().domain(domain).range(range);
}

/** Smooth Catmull-Rom path through [x,y] points (replaces the mockup's hand-rolled spline). */
export function smoothPath(points: [number, number][]): string {
  return d3line().curve(curveCatmullRom.alpha(0.5))(points) ?? "";
}

/** Straight polyline path through [x,y] points. */
export function linePath(points: [number, number][]): string {
  return d3line()(points) ?? "";
}

/** 24h clock-hour label, e.g. 0→"12am", 12→"noon", 18→"6pm". */
export function hourLabel(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/analytics/charts/chart-theme.ts
git commit -m "feat(analytics): add chart theme + d3 helpers"
```

---

### Task 8: HABadge + Pager shared components

**Files:**
- Create: `src/app/analytics/charts/HABadge.tsx`
- Create: `src/app/analytics/charts/Pager.tsx`

- [ ] **Step 1: Write HABadge (server component)**

Ports the mockup `.ha` badge (line 131-136 CSS, `haChip` line 611-615). `next/image` is avoided here — these are tiny favicons already in `/public`, and a plain `<img>` keeps the badge a pure server component with no layout shift.

```tsx
// src/app/analytics/charts/HABadge.tsx
import { healthAuthorityFor } from "@/lib/health-authorities";

/** Favicon-in-ring badge — same treatment as the /map markers. 22px default. */
export function HABadge({ name, address = null, size = 22 }: { name: string; address?: string | null; size?: number }) {
  const a = healthAuthorityFor({ name, address });
  const logo = Math.round(size * (14 / 22));
  return (
    <span
      className="ha"
      style={{ width: size, height: size, background: a.badgeBackground }}
      title={a.name}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.faviconPath} alt={a.name} width={logo} height={logo} />
    </span>
  );
}
```

- [ ] **Step 2: Write Pager (client component)**

Ports the mockup pager (CSS line 116-125, JS `pager()` line 599-604). Numbered pills; hides itself when there is only one page.

```tsx
// src/app/analytics/charts/Pager.tsx
"use client";
import { pageCount } from "@/lib/analytics/paginate";

export function Pager({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  return (
    <div className="pager">
      {Array.from({ length: pages }, (_, p) => (
        <button
          key={p}
          type="button"
          className={`pg${p === page ? " active" : ""}`}
          aria-label={`Page ${p + 1}`}
          aria-current={p === page ? "page" : undefined}
          onClick={() => onPage(p)}
        >
          {p + 1}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/charts/HABadge.tsx src/app/analytics/charts/Pager.tsx
git commit -m "feat(analytics): add HABadge + Pager components"
```

---

## Phase 2 — Data derivations & query layer

### Task 9: Derivation helpers

Pure functions that turn query results into the scalar inputs the finding-titles need. Extracted so the tricky bits (share, peak window, trend, streaks, movers) are unit-tested rather than buried in SQL/JSX. Satisfies the spec's "baseline aggregation helpers" testing requirement.

**Files:**
- Create: `src/lib/analytics/derive.ts`
- Test: `src/lib/analytics/derive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/derive.test.ts
import { describe, expect, it } from "vitest";
import {
  percentile, top2Share, peakWindow, dowExtremes, gapTrend,
  countCalmDays, steadyAndGamble, weeksAtTop, standingsMovers,
} from "./derive";

describe("percentile", () => {
  it("linearly interpolates", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("top2Share", () => {
  it("is the fraction of total positive delta held by the top two", () => {
    expect(top2Share([62, 48, 12, 25])).toBeCloseTo(110 / 147, 5);
  });
  it("is 0 when nothing is above baseline", () => {
    expect(top2Share([-5, -2, 0])).toBe(0);
  });
});

describe("peakWindow", () => {
  it("finds the 85%-of-max run and the morning gap", () => {
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      min: h >= 18 && h <= 20 ? 200 : h >= 6 && h <= 11 ? 80 : 120,
    }));
    expect(peakWindow(hourly)).toEqual({ peakStartHour: 18, peakEndHour: 20, morningDeltaMin: 120 });
  });
});

describe("dowExtremes", () => {
  it("picks roughest and calmest weekday", () => {
    expect(dowExtremes([{ dow: 1, min: 185 }, { dow: 6, min: 132 }, { dow: 0, min: 145 }]))
      .toEqual({ roughestDow: 1, calmestDow: 6, deltaMin: 53 });
  });
});

describe("gapTrend", () => {
  it("classifies the trend from first third vs last third", () => {
    expect(gapTrend([50, 60, 70, 80, 90])).toEqual({ gapMin: 90, trend: "widening" });
    expect(gapTrend([90, 80, 70, 60, 50])).toEqual({ gapMin: 50, trend: "narrowing" });
    expect(gapTrend([70, 72, 68, 71, 69])).toEqual({ gapMin: 69, trend: "steady" });
  });
});

describe("countCalmDays", () => {
  it("counts days below p25 of daily medians", () => {
    expect(countCalmDays([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe(3);
  });
});

describe("steadyAndGamble", () => {
  it("names the long-but-steady standout and the biggest gamble", () => {
    const f = [
      { name: "Richmond", median: 160, stddev: 14 },
      { name: "Eagle Ridge", median: 130, stddev: 64 },
      { name: "Surrey", median: 225, stddev: 52 },
    ];
    expect(steadyAndGamble(f, 150)).toEqual({ steadyLongName: "Richmond", gambleName: "Eagle Ridge" });
  });
});

describe("weeksAtTop", () => {
  it("counts the current leader's trailing streak", () => {
    expect(weeksAtTop(["A", "A", "B", "B", "B"])).toEqual({ leaderName: "B", weeksAtTop: 3 });
  });
});

describe("standingsMovers", () => {
  it("finds the biggest climber and slider", () => {
    expect(standingsMovers([
      { name: "Surrey", ranks: [1, 1, 1, 1] },
      { name: "Burnaby", ranks: [5, 3, 3, 3] },
      { name: "Langley", ranks: [4, 5, 6, 6] },
    ])).toEqual({ climberName: "Burnaby", climbBy: 2, sliderName: "Langley" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/derive.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/analytics/derive.ts
// Pure derivations turning query results into finding-title scalar inputs.

export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Share of total above-baseline pressure held by the two biggest contributors. */
export function top2Share(deltas: number[]): number {
  const pos = deltas.map((d) => Math.max(0, d));
  const total = pos.reduce((s, d) => s + d, 0);
  if (total <= 0) return 0;
  const top2 = [...pos].sort((a, b) => b - a).slice(0, 2).reduce((s, d) => s + d, 0);
  return top2 / total;
}

export type HourMedian = { hour: number; min: number };
export function peakWindow(hourly: HourMedian[]): { peakStartHour: number; peakEndHour: number; morningDeltaMin: number } {
  if (hourly.length === 0) return { peakStartHour: 0, peakEndHour: 0, morningDeltaMin: 0 };
  const max = Math.max(...hourly.map((h) => h.min));
  const peak = hourly.filter((h) => h.min >= max * 0.85).map((h) => h.hour);
  const morning = hourly.filter((h) => h.hour >= 6 && h.hour <= 11).map((h) => h.min);
  const morningMin = morning.length ? Math.min(...morning) : max;
  return { peakStartHour: Math.min(...peak), peakEndHour: Math.max(...peak), morningDeltaMin: Math.round(max - morningMin) };
}

export type DowMedian = { dow: number; min: number };
export function dowExtremes(dows: DowMedian[]): { roughestDow: number; calmestDow: number; deltaMin: number } {
  if (dows.length === 0) return { roughestDow: 0, calmestDow: 0, deltaMin: 0 };
  const roughest = dows.reduce((a, b) => (b.min > a.min ? b : a));
  const calmest = dows.reduce((a, b) => (b.min < a.min ? b : a));
  return { roughestDow: roughest.dow, calmestDow: calmest.dow, deltaMin: Math.round(roughest.min - calmest.min) };
}

export function gapTrend(gaps: number[]): { gapMin: number; trend: "widening" | "narrowing" | "steady" } {
  if (gaps.length === 0) return { gapMin: 0, trend: "steady" };
  const gapMin = Math.round(gaps[gaps.length - 1]);
  const third = Math.max(1, Math.floor(gaps.length / 3));
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const diff = avg(gaps.slice(-third)) - avg(gaps.slice(0, third));
  const trend = diff > 10 ? "widening" : diff < -10 ? "narrowing" : "steady";
  return { gapMin, trend };
}

export function countCalmDays(dailyMedians: number[]): number {
  if (dailyMedians.length === 0) return 0;
  const p25 = percentile(dailyMedians, 0.25);
  return dailyMedians.filter((m) => m < p25).length;
}

export type FacilitySwing = { name: string; median: number; stddev: number };
export function steadyAndGamble(facilities: FacilitySwing[], regionalMedian: number): { steadyLongName: string | null; gambleName: string | null } {
  if (facilities.length < 2) return { steadyLongName: null, gambleName: null };
  const gamble = facilities.reduce((a, b) => (b.stddev > a.stddev ? b : a));
  const long = facilities.filter((f) => f.median >= regionalMedian && f.name !== gamble.name);
  const steadyLong = long.length ? long.reduce((a, b) => (b.stddev < a.stddev ? b : a)) : null;
  return { steadyLongName: steadyLong?.name ?? null, gambleName: gamble.name };
}

export function weeksAtTop(leadersByWeek: string[]): { leaderName: string; weeksAtTop: number } {
  if (leadersByWeek.length === 0) return { leaderName: "", weeksAtTop: 0 };
  const leaderName = leadersByWeek[leadersByWeek.length - 1];
  let streak = 0;
  for (let i = leadersByWeek.length - 1; i >= 0 && leadersByWeek[i] === leaderName; i--) streak++;
  return { leaderName, weeksAtTop: streak };
}

export type RankSeries = { name: string; ranks: number[] }; // rank 1 = longest wait (top)
export function standingsMovers(series: RankSeries[]): { climberName: string; climbBy: number; sliderName: string | null } {
  let climber = { name: "", by: 0 };
  let slider = { name: "", by: 0 };
  for (const s of series) {
    if (s.ranks.length < 2) continue;
    const move = s.ranks[0] - s.ranks[s.ranks.length - 1]; // positive = climbed toward top
    if (move > climber.by) climber = { name: s.name, by: move };
    if (-move > slider.by) slider = { name: s.name, by: -move };
  }
  return { climberName: climber.name, climbBy: climber.by, sliderName: slider.by > 0 ? slider.name : null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/derive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/derive.ts src/lib/analytics/derive.test.ts
git commit -m "feat(analytics): add data derivation helpers"
```

---

### Task 10: Data layer — query batch + view shaping

Rewrite the analytics data access into its own module. It runs one `Promise.all` batch (the existing pattern), shapes rows into an `AnalyticsView` (arrays for charts + scalars for finding-titles), and keeps the 30s cache, inflight coalescing, and deadline guard.

**Files:**
- Create: `src/app/analytics/analytics-data.ts`

Reference the existing query idioms in the current `src/app/analytics/page.tsx:168-550` (DISTINCT ON latest, `percentile_cont`, `date_bin`, `USE_HOURLY_ROLLUP` gate, the cache/inflight/deadline scaffolding) and the 28-day hour+dow baseline in `src/app/api/facilities/[id]/today/route.ts:62-77`. All `≤30d` sections read `wait_time_readings`; the month calendar reads `wait_time_hourly` when `USE_HOURLY_ROLLUP=1` (falls back to raw otherwise).

> **SQL is validated against the local Docker DB, never prod.** Run `pnpm db:up` first. After writing each query, sanity-check it with `rtk proxy psql "$(grep DATABASE_URL .env | cut -d= -f2-)" -c "<query>"` against local before wiring it in.

- [ ] **Step 1: Define the view types and row types**

```ts
// src/app/analytics/analytics-data.ts
import { client as sharedClient } from "../../db/client";
import { VANCOUVER_TZ } from "@/lib/local-time";
import {
  top2Share, peakWindow, dowExtremes, gapTrend, countCalmDays,
  steadyAndGamble, weeksAtTop, standingsMovers, percentile,
} from "@/lib/analytics/derive";

const TZ = VANCOUVER_TZ;

export type FacilityNow = {
  name: string; address: string | null; type: string;
  wait: number | null; elos: number | null; baseline: number | null;
};
export type HeatCell = { name: string; type: string; hour: number; avgWait: number | null };
export type DayShape = { dow: number; median: number | null };
export type GapPoint = { day: string; ed: number | null; upcc: number | null };
export type DistBucket = { bucket: string; order: number; readings: number };
export type CalendarDay = { date: string; median: number | null };
export type LeagueRow = { name: string; type: string; median: number | null; eveningPeak: number | null; spark: number[]; trend7d: number | null };
export type ScatterPoint = { name: string; median: number; stddev: number; readings: number };
export type BumpRow = { name: string; ranks: number[] };
export type RecordTile = { emoji: string; title: string; value: string; sub: string };

export type AnalyticsView = {
  // hero
  status: string; ratio: number; regionalMedian: number; heroContext: string; heroDrivers: string;
  heroToday: { hour: number; min: number }[]; heroTypical: { hour: number; p25: number; p50: number; p75: number }[];
  // stat strip
  shortest: { name: string; min: number } | null; longest: { name: string; min: number } | null;
  reporting: { open: number; total: number }; quietWindow: string;
  // sections
  facilitiesNow: FacilityNow[]; section01: string;
  heat: HeatCell[]; profile: { hour: number; min: number }[]; bestWindow: string; section02: string;
  week: DayShape[]; section03: string;
  gap: GapPoint[]; distribution: DistBucket[]; section04: string;
  visit: FacilityNow[]; section05: string;
  scatter: ScatterPoint[]; section06: string;
  calendar: CalendarDay[]; section07: string;
  league: LeagueRow[]; section08: string;
  bump: BumpRow[]; section09: string;
  records: RecordTile[]; moonNote: string; section10: string;
};

export type AnalyticsResult = { view?: AnalyticsView; error?: string };
```

- [ ] **Step 2: Write the query batch**

Add the `queryAnalytics()` function. Each query is annotated with the section(s) it feeds. (Full SQL — validate each against local before moving on.)

```ts
async function runQueries() {
  const sql = sharedClient;
  const useRollup = process.env.USE_HOURLY_ROLLUP === "1";

  // Current hour + weekend flag drive the per-facility baseline join.
  return Promise.all([
    // [0] Latest reading per facility + its own 28d hour+dow baseline median. Feeds hero, 01, 05.
    sql<{ name: string; address: string | null; type: string; wait: number | null; elos: number | null; baseline: number | null; open: boolean }[]>`
      with latest as (
        select distinct on (location_id)
          location_id, wait_time_minutes as wait, elos_minutes as elos, observed_at
        from wait_time_readings
        order by location_id, observed_at desc
      ), baseline as (
        select
          location_id,
          percentile_cont(0.5) within group (order by wait_time_minutes) as baseline
        from wait_time_readings
        where has_wait_time = true and wait_time_minutes is not null
          and observed_at >= now() - interval '28 days'
          and extract(hour from observed_at at time zone ${TZ}) = extract(hour from now() at time zone ${TZ})
          and (extract(isodow from observed_at at time zone ${TZ}) >= 6) = (extract(isodow from now() at time zone ${TZ}) >= 6)
        group by location_id
      )
      select l.name, l.address, l.type, latest.wait, latest.elos, baseline.baseline,
             coalesce(l.open247, true) as open
      from locations l
      join latest on latest.location_id = l.id
      left join baseline on baseline.location_id = l.id
      where l.status = 'published' and l.type in ('ed', 'upcc')
      order by latest.wait desc nulls last, l.name
    `,
    // [1] Regional today-by-hour median (ED only). Feeds hero curve.
    sql<{ hour: number; min: number }[]>`
      select extract(hour from observed_at at time zone ${TZ})::int as hour,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as min
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ}
      group by 1 order by 1
    `,
    // [2] Regional typical curve p25/p50/p75 by hour (28d, ED only). Feeds hero band + 02 profile.
    sql<{ hour: number; p25: number; p50: number; p75: number }[]>`
      select extract(hour from observed_at at time zone ${TZ})::int as hour,
             percentile_cont(0.25) within group (order by wait_time_minutes)::float as p25,
             percentile_cont(0.5)  within group (order by wait_time_minutes)::float as p50,
             percentile_cont(0.75) within group (order by wait_time_minutes)::float as p75
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '30 days'
      group by 1 order by 1
    `,
    // [3] Facility × hour averages, top-8 busiest EDs, 30d. Feeds 02 heatmap.
    sql<{ name: string; type: string; hour: number; avgWait: number | null }[]>`
      with top8 as (
        select location_id from wait_time_readings
        where wait_time_minutes is not null and observed_at >= now() - interval '30 days'
        group by location_id having count(*) >= 50
        order by avg(wait_time_minutes) desc limit 8
      )
      select l.name, l.type,
             extract(hour from w.observed_at at time zone ${TZ})::int as hour,
             round(avg(w.wait_time_minutes)::numeric, 1)::float as "avgWait"
      from top8 t join wait_time_readings w on w.location_id = t.location_id
      join locations l on l.id = t.location_id
      where w.wait_time_minutes is not null and w.observed_at >= now() - interval '30 days'
      group by l.name, l.type, 3 order by avg(w.wait_time_minutes) over (partition by l.name) desc, l.name, 3
    `,
    // [4] Day-of-week regional medians, 30d, ED only. Feeds 03.
    sql<{ dow: number; median: number | null }[]>`
      select extract(dow from observed_at at time zone ${TZ})::int as dow,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '30 days'
      group by 1 order by 1
    `,
    // [5] Daily median by care type, 30d. Feeds 04 gap trend.
    sql<{ day: string; type: string; median: number | null }[]>`
      select to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day, l.type,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type in ('ed','upcc') and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '30 days'
      group by 1, 2 order by 1, 2
    `,
    // [6] ED wait distribution buckets, 30d. Feeds 04 distribution bar.
    sql<{ bucket: string; order: number; readings: number }[]>`
      select case when wait_time_minutes < 60 then '<1h' when wait_time_minutes < 120 then '1-2h'
                  when wait_time_minutes < 180 then '2-3h' when wait_time_minutes < 240 then '3-4h' else '4h+' end as bucket,
             case when wait_time_minutes < 60 then 1 when wait_time_minutes < 120 then 2
                  when wait_time_minutes < 180 then 3 when wait_time_minutes < 240 then 4 else 5 end as "order",
             count(*)::int as readings
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and w.wait_time_minutes is not null and observed_at >= now() - interval '30 days'
      group by 1, 2 order by 2
    `,
    // [7] Median + stddev + evening peak (17-22) + 30d daily sparkline, per facility, 30d. Feeds 06, 08.
    sql<{ name: string; type: string; median: number | null; stddev: number | null; evening: number | null; readings: number; spark: number[]; recent7: number | null; prior7: number | null }[]>`
      with daily as (
        select location_id, to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
               percentile_cont(0.5) within group (order by wait_time_minutes)::float as med,
               observed_at
        from wait_time_readings
        where has_wait_time = true and wait_time_minutes is not null and observed_at >= now() - interval '30 days'
        group by location_id, day, observed_at
      )
      select l.name, l.type,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median,
             round(stddev_samp(w.wait_time_minutes)::numeric, 1)::float as stddev,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)
               filter (where extract(hour from w.observed_at at time zone ${TZ}) between 17 and 22)::float as evening,
             count(*)::int as readings,
             (select coalesce(array_agg(round(med)::int order by day), '{}')
                from (select to_char(w2.observed_at at time zone ${TZ}, 'YYYY-MM-DD') as day,
                             percentile_cont(0.5) within group (order by w2.wait_time_minutes) as med
                      from wait_time_readings w2 where w2.location_id = l.id and w2.has_wait_time
                        and w2.observed_at >= now() - interval '30 days'
                      group by 1 order by 1) s) as spark,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)
               filter (where w.observed_at >= now() - interval '7 days')::float as recent7,
             percentile_cont(0.5) within group (order by w.wait_time_minutes)
               filter (where w.observed_at >= now() - interval '14 days' and w.observed_at < now() - interval '7 days')::float as prior7
      from locations l join wait_time_readings w on w.location_id = l.id
      where w.has_wait_time = true and w.wait_time_minutes is not null and w.observed_at >= now() - interval '30 days'
      group by l.id, l.name, l.type having count(*) >= 50
      order by median desc nulls last
    `,
    // [8] Regional daily median (ED), 30d. Feeds 07 calendar + 10 calmest/roughest.
    sql<{ date: string; median: number | null }[]>`
      ${useRollup
        ? sql`
          select to_char(bucket at time zone ${TZ}, 'YYYY-MM-DD') as date,
                 round((sum(avg_wait_minutes * reported_count) / nullif(sum(reported_count),0))::numeric,1)::float as median
          from wait_time_hourly h join locations l on l.id = h.location_id
          where l.type = 'ed' and h.avg_wait_minutes is not null and bucket >= now() - interval '30 days'
          group by 1 order by 1`
        : sql`
          select to_char(observed_at at time zone ${TZ}, 'YYYY-MM-DD') as date,
                 percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
          from wait_time_readings w join locations l on l.id = w.location_id
          where l.type = 'ed' and w.has_wait_time = true and w.wait_time_minutes is not null
            and observed_at >= now() - interval '30 days'
          group by 1 order by 1`}
    `,
    // [9] Weekly per-facility median (ED), last 4 ISO weeks. Feeds 08 weeks-at-top, 09 bump.
    sql<{ name: string; week: number; median: number | null }[]>`
      select l.name,
             floor(extract(epoch from (now() - observed_at)) / 604800)::int as week,
             percentile_cont(0.5) within group (order by wait_time_minutes)::float as median
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and w.has_wait_time = true and w.wait_time_minutes is not null
        and observed_at >= now() - interval '28 days'
      group by l.name, 2
    `,
    // [10] Record wait + timestamp (ED), 30d. Feeds 10.
    sql<{ name: string; wait: number; at: Date }[]>`
      select l.name, w.wait_time_minutes as wait, w.observed_at as at
      from wait_time_readings w join locations l on l.id = w.location_id
      where l.type = 'ed' and w.wait_time_minutes is not null and observed_at >= now() - interval '30 days'
      order by w.wait_time_minutes desc, w.observed_at desc limit 1
    `,
  ]);
}
```

- [ ] **Step 3: Write the view shaper**

Turns rows + derivations + finding-titles into the `AnalyticsView`. Weekly ranks (query [9]) are transformed to per-week rank arrays (rank 1 = longest) for `weeksAtTop`/`standingsMovers`/the bump chart. `week` counts backwards (0 = this week); reverse to oldest→newest.

```ts
import {
  heroContext as fHeroContext, heroDrivers as fHeroDrivers,
  section01 as f01, section02 as f02, section03 as f03, section04 as f04,
  section05 as f05, section06 as f06, section07 as f07, section08 as f08,
  section09 as f09, section10 as f10,
} from "@/lib/analytics/finding-titles";
import { pressureStatus } from "@/lib/analytics/pressure-index";
import { partOfDay, weekdayName, fmtMin } from "@/lib/analytics/format";
import { hourLabel } from "./charts/chart-theme";

function shapeView(rows: Awaited<ReturnType<typeof runQueries>>): AnalyticsView {
  const [nowRows, todayRows, typicalRows, heatRows, dowRows, gapRows, distRows, facRows, dailyRows, weeklyRows, recordRows] = rows;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
  const dow = new Date(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)).getUTCDay();
  const pod = partOfDay(hour);

  const openEds = nowRows.filter((r) => r.type === "ed" && r.wait != null && r.open);
  const regionalMedian = openEds.length ? percentile(openEds.map((r) => r.wait as number), 0.5) : 0;
  const baselineMedian = (() => {
    const bs = openEds.map((r) => r.baseline).filter((b): b is number => b != null);
    return bs.length ? percentile(bs, 0.5) : regionalMedian;
  })();
  const ratio = baselineMedian > 0 ? regionalMedian / baselineMedian : 1;

  const drivers = openEds
    .filter((r) => r.baseline != null)
    .map((r) => ({ name: r.name, wait: r.wait as number, delta: (r.wait as number) - (r.baseline as number) }))
    .sort((a, b) => b.delta - a.delta);
  const upccUnderHour = nowRows.filter((r) => r.type === "upcc" && r.wait != null).every((r) => (r.wait as number) < 60);

  const facilitiesNow: FacilityNow[] = nowRows.map((r) => ({ name: r.name, address: r.address, type: r.type, wait: r.wait, elos: r.elos, baseline: r.baseline }));

  const profile = typicalRows.map((r) => ({ hour: r.hour, min: Math.round(r.p50) }));
  const pk = peakWindow(profile);
  const shortH = hour % 12 || 12;
  const peakStart = String(pk.peakStartHour % 12 || 12);
  const peakEnd = hourLabel(pk.peakEndHour);
  const bestHour = profile.length ? profile.reduce((a, b) => (b.min < a.min ? b : a)).hour : 9;

  const dowMedians = dowRows.filter((r) => r.median != null).map((r) => ({ dow: r.dow, min: r.median as number }));
  const de = dowExtremes(dowMedians);

  const days = Array.from(new Set(gapRows.map((r) => r.day))).sort();
  const gap = days.map((day) => ({
    day,
    ed: gapRows.find((r) => r.day === day && r.type === "ed")?.median ?? null,
    upcc: gapRows.find((r) => r.day === day && r.type === "upcc")?.median ?? null,
  }));
  const gaps = gap.filter((g) => g.ed != null && g.upcc != null).map((g) => (g.ed as number) - (g.upcc as number));
  const gt = gapTrend(gaps);

  const worst = openEds[0] ?? null;
  const worstElos = worst ? (nowRows.find((r) => r.name === worst.name)?.elos ?? 0) : 0;
  const visitTotal = worst && worst.wait != null ? (worst.wait as number) + (worstElos ?? 0) : 0;

  const swing = facRows.filter((r) => r.median != null && r.stddev != null).map((r) => ({ name: r.name, median: r.median as number, stddev: r.stddev as number }));
  const sg = steadyAndGamble(swing, regionalMedian);

  const dailyMedians = dailyRows.filter((r) => r.median != null).map((r) => r.median as number);
  const calmDays = countCalmDays(dailyMedians);

  // weekly ranks: 0 = this week … 3 = 4 weeks ago; per week rank 1 = longest median.
  const weeks = [3, 2, 1, 0];
  const names = Array.from(new Set(weeklyRows.map((r) => r.name)));
  const rankByWeek = weeks.map((wk) => {
    const wkRows = weeklyRows.filter((r) => r.week === wk && r.median != null).sort((a, b) => (b.median as number) - (a.median as number));
    return new Map(wkRows.map((r, i) => [r.name, i + 1] as const));
  });
  const bump: BumpRow[] = names
    .map((name) => ({ name, ranks: rankByWeek.map((m) => m.get(name)).filter((r): r is number => r != null) }))
    .filter((s) => s.ranks.length === 4);
  const leadersByWeek = rankByWeek.map((m) => [...m.entries()].find(([, r]) => r === 1)?.[0] ?? "").filter(Boolean);
  const wt = weeksAtTop(leadersByWeek);
  const mv = standingsMovers(bump);

  const league: LeagueRow[] = facRows.map((r) => ({
    name: r.name, type: r.type, median: r.median, eveningPeak: r.evening, spark: r.spark ?? [],
    trend7d: r.recent7 != null && r.prior7 != null ? Math.round((r.recent7 as number) - (r.prior7 as number)) : null,
  }));

  const scatter: ScatterPoint[] = facRows.filter((r) => r.median != null && r.stddev != null)
    .map((r) => ({ name: r.name, median: r.median as number, stddev: r.stddev as number, readings: r.readings }));

  const calendar: CalendarDay[] = dailyRows.map((r) => ({ date: r.date, median: r.median }));

  // records + full-moon note (moon dates: small constant table; see Task 20)
  const record = recordRows[0] ?? null;
  const records = buildRecords(record, facRows, dailyRows, TZ);
  const moonNote = buildMoonNote(dailyRows);

  const shortest = [...nowRows].filter((r) => r.wait != null).sort((a, b) => (a.wait as number) - (b.wait as number))[0] ?? null;
  const longest = openEds[0] ?? null;

  return {
    status: pressureStatus(ratio), ratio, regionalMedian: Math.round(regionalMedian),
    heroContext: fHeroContext({ medianMin: Math.round(regionalMedian), ratio, weekday: weekdayName(dow), partOfDay: pod }),
    heroDrivers: fHeroDrivers({ drivers: drivers.slice(0, 2).map((d) => ({ name: d.name, wait: d.wait })), upccUnderHour }),
    heroToday: todayRows.map((r) => ({ hour: r.hour, min: Math.round(r.min) })),
    heroTypical: typicalRows,
    shortest: shortest ? { name: shortest.name, min: shortest.wait as number } : null,
    longest: longest ? { name: longest.name, min: longest.wait as number } : null,
    reporting: { open: nowRows.filter((r) => r.wait != null).length, total: nowRows.length },
    quietWindow: `${hourLabel(bestHour)}–${hourLabel((bestHour + 2) % 24)}`,
    facilitiesNow, section01: f01({ top2Share: top2Share(drivers.map((d) => d.delta)), partOfDay: pod }),
    heat: heatRows, profile, bestWindow: `Best time to go: ${hourLabel(bestHour)}–${hourLabel((bestHour + 2) % 24)}`,
    section02: f02({ peakStart, peakEnd, morningDeltaMin: pk.morningDeltaMin }),
    week: dowRows, section03: f03(de),
    gap, distribution: distRows, section04: f04(gt),
    visit: facilitiesNow.filter((r) => r.wait != null), section05: f05({ facilityName: worst?.name ?? "", totalMin: visitTotal }),
    scatter, section06: f06(sg),
    calendar, section07: f07({ calmDays, windowDays: dailyMedians.length }),
    league, section08: f08(wt),
    bump, section09: f09(mv),
    records, moonNote, section10: f10({ recordWaitMin: record?.wait ?? 0 }),
  };
}
```

`buildRecords` and `buildMoonNote` are small helpers defined in this file; their content (record tile array + full-moon date-join note) is specified in Task 21 (RecordsBoard). For this task, stub them (`const buildRecords = (...args: unknown[]): RecordTile[] => []; const buildMoonNote = (...args: unknown[]): string => "";`) so the module typechecks and runs; fill them in Task 21.

- [ ] **Step 4: Add the cache, inflight coalescing, and deadline guard**

Copy the scaffolding shape from the current `page.tsx:555-591` (rename to view types):

```ts
const CACHE_TTL_MS = 30_000;
let cache: { at: number; result: AnalyticsResult } | null = null;
let inflight: Promise<AnalyticsResult> | null = null;
const DEADLINE_MS = 45_000;

async function queryAnalytics(): Promise<AnalyticsResult> {
  try {
    const rows = await runQueries();
    return { view: shapeView(rows) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown database error" };
  }
}

function withDeadline(p: Promise<AnalyticsResult>): Promise<AnalyticsResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "Analytics queries timed out." }), DEADLINE_MS);
    p.then((r) => { clearTimeout(timer); resolve(r); }, (e) => { clearTimeout(timer); resolve({ error: e instanceof Error ? e.message : "Unknown database error" }); });
  });
}

export async function getAnalytics(): Promise<AnalyticsResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  if (!inflight) {
    inflight = queryAnalytics().then((r) => { if (!r.error) cache = { at: Date.now(), result: r }; return r; }).finally(() => { inflight = null; });
  }
  return withDeadline(inflight);
}
```

- [ ] **Step 5: Typecheck + smoke-test against the local DB**

Run: `pnpm db:up` then `pnpm exec tsc --noEmit`
Expected: tsc passes.

Then verify the batch runs end-to-end against local data with a throwaway script:

```bash
pnpm exec tsx -e "import('./src/app/analytics/analytics-data.ts').then(m=>m.getAnalytics()).then(r=>console.log(r.error ?? Object.keys(r.view!)))"
```
Expected: prints the `AnalyticsView` keys (no error). If a query errors, fix its SQL against local before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/app/analytics/analytics-data.ts
git commit -m "feat(analytics): add data layer (query batch + view shaping)"
```

---

## Phase 3 — Section components (SVG charts + interactive bits)

Each chart is written directly (no unit test — visual) and verified in the Task 26 browser pass. Ports cite the mockup renderer they translate. All colors come from `chart-theme.ts`. Structural markup class names match the mockup so the styles from Task 23 apply unchanged.

### Task 11: PressureHero + StatStrip

**Files:**
- Create: `src/app/analytics/charts/PressureHero.tsx`
- Create: `src/app/analytics/charts/StatStrip.tsx`

Ports mockup `renderHero` (lines 621-660), hero markup (322-342), and `.strip`/`.stat` (337-342). Server components. Curve smoothing uses `smoothPath` (Catmull-Rom) instead of the mockup's hand-rolled spline.

- [ ] **Step 1: Write PressureHero**

```tsx
// src/app/analytics/charts/PressureHero.tsx
import { SAGE, severityColor, smoothPath, linear, hourLabel, fmtMin } from "./chart-theme";
import { PRESSURE_STATUSES, pressureIndex } from "@/lib/analytics/pressure-index";

type Pt = { hour: number; min: number };
type Band = { hour: number; p25: number; p50: number; p75: number };

const BAND_LO = [0, 0.8, 1.15, 1.6];
const BAND_HI = [0.8, 1.15, 1.6, 2.2];

export function PressureHero({
  status, ratio, context, drivers, today, typical,
}: { status: string; ratio: number; context: string; drivers: string; today: Pt[]; typical: Band[] }) {
  const W = 660, H = 235, padL = 40, padR = 16, padT = 16, padB = 26, maxY = 300;
  const x = linear([0, 23], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const active = pressureIndex(ratio);
  const frac = Math.min(1, Math.max(0, (ratio - BAND_LO[active]) / (BAND_HI[active] - BAND_LO[active])));

  const bandTop = typical.map((t) => [x(t.hour), y(Math.min(t.p75, maxY))] as [number, number]);
  const bandBottom = typical.slice().reverse().map((t) => [x(t.hour), y(Math.min(t.p25, maxY))] as [number, number]);
  const bandPath = smoothPath(bandTop) + "L" + smoothPath(bandBottom).slice(1) + "Z";
  const typicalPath = smoothPath(typical.map((t) => [x(t.hour), y(Math.min(t.p50, maxY))]));
  const todayPts = today.map((p) => [x(p.hour), y(Math.min(p.min, maxY))] as [number, number]);
  const todayPath = smoothPath(todayPts);
  const last = todayPts[todayPts.length - 1];

  return (
    <section className="hero">
      <div>
        <div className="hero-label">ER pressure right now</div>
        <div className="hero-status">{status}</div>
        <p className="hero-context" dangerouslySetInnerHTML={{ __html: context.replace(/`([^`]+)`/g, "<b>$1</b>") }} />
        <div className="gauge">
          {PRESSURE_STATUSES.map((_, i) => (
            <i key={i} className={i <= active ? `on-${i + 1}` : ""}>
              {i === active ? <span className="needle" style={{ left: `${frac * 100}%` }} /> : null}
            </i>
          ))}
        </div>
        <div className="gauge-labels">
          {PRESSURE_STATUSES.map((s, i) => <span key={s} className={i === active ? "active" : ""}>{s}</span>)}
        </div>
        <p className="hero-drivers">{drivers}</p>
      </div>
      <div className="hero-chart-wrap">
        <div className="chart-title">Today, hour by hour <small>· dashed line = a typical {new Date().toLocaleDateString("en-CA", { weekday: "long", timeZone: "America/Vancouver" })} · band = usual range</small></div>
        <svg id="hero-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Regional ER wait today versus the typical range">
          <defs>
            <linearGradient id="todayFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SAGE.hot} stopOpacity={SAGE.todayFillTop} />
              <stop offset="100%" stopColor={SAGE.hot} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[60, 120, 180, 240].map((m) => (
            <g key={m}>
              <line x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke={SAGE.grid} />
              <text x={padL - 8} y={y(m) + 4} fontSize={11} fill={SAGE.tick} textAnchor="end" fontWeight={700}>{m / 60}h</text>
            </g>
          ))}
          {[0, 6, 12, 18, 23].map((h) => (
            <text key={h} x={x(h)} y={H - 7} fontSize={11} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{hourLabel(h)}</text>
          ))}
          <path d={bandPath} fill={SAGE.band} />
          <path d={typicalPath} fill="none" stroke={SAGE.primary} strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" opacity={0.9} />
          {last && <path d={`${todayPath} L ${last[0]} ${y(0)} L ${todayPts[0][0]} ${y(0)} Z`} fill="url(#todayFill)" />}
          <path d={todayPath} fill="none" stroke={SAGE.hot} strokeWidth={3.5} strokeLinecap="round" />
          {last && (
            <>
              <circle cx={last[0]} cy={last[1]} r={5} fill={SAGE.hot} stroke={SAGE.surface} strokeWidth={2} />
              <text x={last[0] - 10} y={last[1] - 13} fontSize={12.5} fontWeight={800} fill={SAGE.hot} textAnchor="end">now · {fmtMin(today[today.length - 1].min)}</text>
            </>
          )}
        </svg>
      </div>
    </section>
  );
}
```

> Note: `heroContext`/`heroDrivers` from the data layer emit plain sentences. To bold the key figures, wrap the emphasized spans in backticks inside the finding-title templates (e.g. `` `2h 40m` ``) — the hero renders those as `<b>`. If you prefer no markup, drop the `dangerouslySetInnerHTML` and render `{context}` directly. Decide during implementation and keep the finding-titles tests in sync (adjust expected strings if backticks are added).

- [ ] **Step 2: Write StatStrip**

```tsx
// src/app/analytics/charts/StatStrip.tsx
import { fmtMin } from "./chart-theme";

type Stat = { name: string; min: number } | null;

export function StatStrip({
  shortest, longest, reporting, quietWindow,
}: { shortest: Stat; longest: Stat; reporting: { open: number; total: number }; quietWindow: string }) {
  return (
    <div className="strip">
      <div className="stat">
        <div className="v good">{shortest ? fmtMin(shortest.min) : "—"}</div>
        <div className="k">Shortest wait now{shortest ? ` · ${shortest.name}` : ""}</div>
      </div>
      <div className="stat">
        <div className="v warn">{longest ? fmtMin(longest.min) : "—"}</div>
        <div className="k">Longest wait now{longest ? ` · ${longest.name}` : ""}</div>
      </div>
      <div className="stat">
        <div className="v">{reporting.open} / {reporting.total}</div>
        <div className="k">Facilities reporting</div>
      </div>
      <div className="stat">
        <div className="v">{quietWindow}</div>
        <div className="k">Usually the quietest window</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/charts/PressureHero.tsx src/app/analytics/charts/StatStrip.tsx
git commit -m "feat(analytics): add PressureHero + StatStrip"
```

---

### Task 12: Section 01 — RankedBars

Ports `renderRank` (mockup 662-674), `.rank-row` CSS (151-162), and `haLegend`. Client component (numbered-pill pagination over the full payload). Delta chip compares the latest wait to the facility's own hour+dow baseline.

**Files:**
- Create: `src/app/analytics/charts/RankedBars.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/analytics/charts/RankedBars.tsx
"use client";
import { useState } from "react";
import { severityColor, fmtMin } from "./chart-theme";
import { paginate } from "@/lib/analytics/paginate";
import { HABadge } from "./HABadge";
import { Pager } from "./Pager";
import { HEALTH_AUTHORITIES } from "@/lib/health-authorities";

type Row = { name: string; address: string | null; type: string; wait: number | null; baseline: number | null };

const MAX = 320;

export function RankedBars({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0);
  const ranked = rows.filter((r) => r.wait != null);
  const slice = paginate(ranked, page);

  return (
    <div className="card">
      {slice.map((r) => {
        const v = r.wait as number;
        const d = r.baseline != null ? v - r.baseline : 0;
        const cls = Math.abs(d) < 10 ? "flat" : d > 0 ? "up" : "down";
        const dTxt = Math.abs(d) < 10 ? "≈ usual" : `${d > 0 ? "+" : "−"}${fmtMin(Math.abs(d))} vs usual`;
        return (
          <div className="rank-row" key={r.name}>
            <div className="rank-name">
              <HABadge name={r.name} address={r.address} />
              <span className="nm">{r.name}</span>
              <span className="rank-tag">{r.type === "upcc" ? "UPCC" : "ED"}</span>
            </div>
            <div className="rank-track">
              <div className="rank-fill" style={{ width: `${(v / MAX) * 100}%`, background: severityColor(v) }} />
            </div>
            <div className="rank-end">
              <span className="rank-val">{fmtMin(v)}</span>
              <span className={`delta ${cls}`}>{dTxt}</span>
            </div>
          </div>
        );
      })}
      <Pager total={ranked.length} page={page} onPage={setPage} />
      <div className="ha-legend">
        {Object.values(HEALTH_AUTHORITIES).map((a) => (
          <span key={a.name}>
            <span className="ha" style={{ background: a.badgeBackground }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.faviconPath} alt="" width={12} height={12} />
            </span>
            {a.name}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/RankedBars.tsx
git commit -m "feat(analytics): add section 01 RankedBars"
```

---

### Task 13: Section 02 — HourHeatmap + DayProfile

Ports `renderHeat` (mockup 676-692), `.heat-grid` CSS (189-200), `renderProfile` (694-702), `.profile-bars` CSS (164-168), and the best-window callout. Server components. Heatmap tooltips use native SVG-free `title` attributes on cells (no client JS needed).

**Files:**
- Create: `src/app/analytics/charts/HourHeatmap.tsx`
- Create: `src/app/analytics/charts/DayProfile.tsx`

- [ ] **Step 1: Write HourHeatmap**

```tsx
// src/app/analytics/charts/HourHeatmap.tsx
import { heatColor, HEAT, fmtMin } from "./chart-theme";
import { HABadge } from "./HABadge";

type Cell = { name: string; type: string; hour: number; avgWait: number | null };

export function HourHeatmap({ cells }: { cells: Cell[] }) {
  const names = Array.from(new Set(cells.map((c) => c.name)));
  const byKey = new Map(cells.map((c) => [`${c.name}|${c.hour}`, c.avgWait] as const));
  return (
    <div className="card">
      <div className="card-mini-title">Average wait by hour, per facility <small>busiest first · hover for exact values</small></div>
      <div className="scrollx">
        <div className="heat-grid">
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="heat-hour-label">{h % 6 === 0 ? (h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`) : ""}</div>
          ))}
          {names.map((name) => (
            <FacilityRow key={name} name={name} byKey={byKey} />
          ))}
        </div>
      </div>
      <div className="legend"><span><span className="legend-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>&lt;1h → 5h+</span></div>
    </div>
  );
}

function FacilityRow({ name, byKey }: { name: string; byKey: Map<string, number | null> }) {
  return (
    <>
      <div className="heat-name"><HABadge name={name} size={18} />{name}</div>
      {Array.from({ length: 24 }, (_, h) => {
        const v = byKey.get(`${name}|${h}`);
        return <div key={h} className="heat-cell" style={{ background: v != null ? heatColor(v) : "var(--track)" }} title={v != null ? `${name} · ${h}:00 — avg ${fmtMin(v)}` : `${name} · ${h}:00 — no data`} />;
      })}
    </>
  );
}
```

- [ ] **Step 2: Write DayProfile**

```tsx
// src/app/analytics/charts/DayProfile.tsx
import { SAGE, severityColor, fmtMin } from "./chart-theme";

type Pt = { hour: number; min: number };

export function DayProfile({ profile, bestWindow, bestHours }: { profile: Pt[]; bestWindow: string; bestHours: [number, number] }) {
  const max = Math.max(1, ...profile.map((p) => p.min));
  return (
    <div className="card">
      <div className="card-mini-title">The regional day curve <small>median wait by hour, all ERs</small></div>
      <div className="profile-bars">
        {profile.map((p) => {
          const isBest = p.hour >= bestHours[0] && p.hour <= bestHours[1];
          return <div key={p.hour} className="pbar" style={{ height: `${(p.min / max) * 100}%`, background: isBest ? SAGE.primary : severityColor(p.min), opacity: isBest ? 1 : 0.85 }} title={`${p.hour}:00 — median ${fmtMin(p.min)}`} />;
        })}
      </div>
      <div className="profile-axis"><span>12am</span><span>6am</span><span>noon</span><span>6pm</span><span>11pm</span></div>
      <div className="best-window">✓ {bestWindow}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/HourHeatmap.tsx src/app/analytics/charts/DayProfile.tsx
git commit -m "feat(analytics): add section 02 heatmap + day profile"
```

---

### Task 14: Section 03 — WeekTiles

Ports `renderWeek` (mockup 714-733), `renderWeekDetail` (735-783), `.week-grid`/`.day-cell` CSS (170-187). Client component (day selector). Tiles come from the 7 day-of-week medians; the detail curve shows the selected weekday's **typical** hourly curve (p25/p50/p75 band + median), and for **today** overlays the actual-so-far plus a decay projection toward typical (mirrors mockup lines 762-772).

**Scope note (surface to the user):** The mockup shows a past weekday's *actual* curve. Production has the per-day-of-week *typical* curve (from a new query below), which every day renders; today additionally overlays true actual-so-far + projection. Rendering each past calendar day's *specific-date* actual needs a second last-7-days×hour query and per-date wiring — deferred to a follow-up to keep v1 shippable. Past days are labeled "usual {Day}" so the chart never claims an actual it doesn't have. If the user wants full past-actuals in v1, add query `[12]` (regional ED hourly median for `observed_at >= now() - interval '7 days'` grouped by date+hour) and select the matching date per past tile.

- [ ] **Step 1: Extend the data layer for per-dow typical curves**

In `src/app/analytics/analytics-data.ts`, append query `[11]` to `runQueries()`:

```ts
// [11] Per-dow × hour typical p25/p50/p75 (28d, ED). Feeds 03 week detail.
sql<{ dow: number; hour: number; p25: number; p50: number; p75: number }[]>`
  select extract(dow from observed_at at time zone ${TZ})::int as dow,
         extract(hour from observed_at at time zone ${TZ})::int as hour,
         percentile_cont(0.25) within group (order by wait_time_minutes)::float as p25,
         percentile_cont(0.5)  within group (order by wait_time_minutes)::float as p50,
         percentile_cont(0.75) within group (order by wait_time_minutes)::float as p75
  from wait_time_readings w join locations l on l.id = w.location_id
  where l.type = 'ed' and w.has_wait_time = true and w.wait_time_minutes is not null
    and observed_at >= now() - interval '28 days'
  group by 1, 2 order by 1, 2
`,
```

Add to `AnalyticsView`: `weekTypical: { dow: number; hour: number; p25: number; p50: number; p75: number }[];` and `todayDow: number;`. In `shapeView`, destructure the extra row (`..., weeklyRows, recordRows, weekTypicalRows] = rows;`) and set `weekTypical: weekTypicalRows, todayDow: dow`.

- [ ] **Step 2: Write WeekTiles**

```tsx
// src/app/analytics/charts/WeekTiles.tsx
"use client";
import { useState } from "react";
import { SAGE, linear, linePath, hourLabel } from "./chart-theme";
import { weekdayName, fmtMin } from "@/lib/analytics/format";

type DayMedian = { dow: number; median: number | null };
type Band = { dow: number; hour: number; p25: number; p50: number; p75: number };
type Pt = { hour: number; min: number };

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekTiles({ week, typical, today, todayDow }: { week: DayMedian[]; typical: Band[]; today: Pt[]; todayDow: number }) {
  const [sel, setSel] = useState(todayDow);
  const medianOf = (dow: number) => week.find((d) => d.dow === dow)?.median ?? null;

  return (
    <div className="card">
      <div className="week-grid">
        {ORDER.map((dow) => {
          const med = medianOf(dow);
          const curve = typical.filter((t) => t.dow === dow).sort((a, b) => a.hour - b.hour);
          const isToday = dow === todayDow;
          const stroke = isToday ? SAGE.hot : SAGE.primary;
          const W = 90, H = 30, maxP = 195;
          const pts = curve.map((c) => [(c.hour / 23) * W, H - Math.min(0.95, c.p50 / maxP) * H * 0.92] as [number, number]);
          const path = pts.length ? linePath(pts) : "";
          return (
            <div key={dow} role="button" tabIndex={0} aria-label={`Show ${weekdayName(dow)} curve`}
              className={`day-cell${isToday ? " today" : ""}${dow === sel ? " selected" : ""}`}
              onClick={() => setSel(dow)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSel(dow); }}>
              <div className="day-name">{SHORT[dow]}{isToday ? " ·" : ""}</div>
              <div className="day-val">{med != null ? fmtMin(med) : "—"}</div>
              <svg className="day-spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={30} preserveAspectRatio="none">
                {path && <path d={`${path} L ${W},${H} L 0,${H} Z`} fill={stroke} opacity={0.13} />}
                {path && <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} />}
              </svg>
            </div>
          );
        })}
      </div>
      <WeekDetail sel={sel} typical={typical} today={today} todayDow={todayDow} />
    </div>
  );
}

function WeekDetail({ sel, typical, today, todayDow }: { sel: number; typical: Band[]; today: Pt[]; todayDow: number }) {
  const W = 980, H = 210, padL = 40, padR = 16, padT = 12, padB = 26, maxY = 300;
  const x = linear([0, 23], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const curve = typical.filter((t) => t.dow === sel).sort((a, b) => a.hour - b.hour);
  const isToday = sel === todayDow;

  const p50 = curve.map((c) => [x(c.hour), y(Math.min(c.p50, maxY))] as [number, number]);
  const band = curve.map((c) => [x(c.hour), y(Math.min(c.p75, maxY))] as [number, number])
    .concat(curve.slice().reverse().map((c) => [x(c.hour), y(Math.min(c.p25, maxY))] as [number, number]));
  const actual = isToday ? today.map((p) => [x(p.hour), y(Math.min(p.min, maxY))] as [number, number]) : [];

  // projection: decay from the last actual point toward the typical median.
  const proj: [number, number][] = [];
  if (isToday && actual.length && curve.length) {
    const li = today[today.length - 1].hour;
    const dev = today[today.length - 1].min - (curve.find((c) => c.hour === li)?.p50 ?? today[today.length - 1].min);
    for (const c of curve.filter((c) => c.hour > li)) proj.push([x(c.hour), y(Math.min(c.p50 + dev * Math.exp(-(c.hour - li) / 3), maxY))]);
  }

  return (
    <>
      <div className="week-detail-head">
        <span className="week-detail-title">{weekdayName(sel)}{isToday ? " — today" : ""}</span>
        <span className="week-detail-note">{isToday ? "— actual so far · ┄ projected · band = usual range" : `usual ${weekdayName(sel)} range`}</span>
      </div>
      <svg id="week-detail" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${weekdayName(sel)} wait curve`}>
        {[60, 120, 180, 240].map((m) => (
          <g key={m}>
            <line x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke={SAGE.grid} />
            <text x={padL - 8} y={y(m) + 4} fontSize={11} fill={SAGE.tick} textAnchor="end" fontWeight={700}>{m / 60}h</text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 7} fontSize={11} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{hourLabel(h)}</text>)}
        {band.length > 0 && <polygon points={band.map((p) => p.join(",")).join(" ")} fill={SAGE.band} />}
        <polyline points={p50.map((p) => p.join(",")).join(" ")} fill="none" stroke={SAGE.primary} strokeWidth={isToday ? 2 : 3} strokeDasharray={isToday ? "1 7" : "none"} strokeLinecap="round" opacity={0.95} />
        {actual.length > 0 && <polyline points={actual.map((p) => p.join(",")).join(" ")} fill="none" stroke={SAGE.hot} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
        {proj.length > 0 && <polyline points={proj.map((p) => p.join(",")).join(" ")} fill="none" stroke={SAGE.hot} strokeWidth={2.5} strokeDasharray="4 6" strokeLinecap="round" opacity={0.75} />}
      </svg>
    </>
  );
}
```

- [ ] **Step 3: Typecheck against local data**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. If the `[11]` destructure count mismatches, re-check the `runQueries` return tuple order.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/charts/WeekTiles.tsx src/app/analytics/analytics-data.ts
git commit -m "feat(analytics): add section 03 WeekTiles + per-dow typical query"
```

---

### Task 15: Section 04 — GapTrend + WaitDistribution

Ports `renderGap` (mockup 785-809), `renderDist` (811-831), `.dist-bar`/`.dist-seg` CSS (206-209). Server components. The histogram reuses the 5 distribution buckets (query `[6]`) with a "tonight" marker at the bucket holding the current regional median.

**Files:**
- Create: `src/app/analytics/charts/GapTrend.tsx`
- Create: `src/app/analytics/charts/WaitDistribution.tsx`

- [ ] **Step 1: Write GapTrend**

```tsx
// src/app/analytics/charts/GapTrend.tsx
import { SAGE, linear, linePath, fmtMin } from "./chart-theme";

type GapPoint = { day: string; ed: number | null; upcc: number | null };

export function GapTrend({ gap }: { gap: GapPoint[] }) {
  const W = 620, H = 240, padL = 40, padR = 14, padT = 14, padB = 26, maxY = 240;
  const days = gap.length;
  const x = linear([0, Math.max(1, days - 1)], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const ed = gap.map((g, i) => [x(i), y(Math.min(g.ed ?? 0, maxY))] as [number, number]);
  const upcc = gap.map((g, i) => [x(i), y(Math.min(g.upcc ?? 0, maxY))] as [number, number]);
  const li = days - 1;
  const gapNow = days ? Math.round((gap[li].ed ?? 0) - (gap[li].upcc ?? 0)) : 0;
  const tick = (i: number) => gap[i]?.day ? new Date(gap[i].day + "T00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "";

  return (
    <div className="card">
      <div className="card-mini-title">30-day trend <small>daily median wait</small></div>
      <svg id="gap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="ED vs urgent-care daily median trend">
        {[60, 120, 180].map((m) => (
          <g key={m}>
            <line x1={padL} y1={y(m)} x2={W - padR} y2={y(m)} stroke={SAGE.grid} />
            <text x={padL - 8} y={y(m) + 4} fontSize={11} fill={SAGE.tick} textAnchor="end" fontWeight={700}>{m / 60}h</text>
          </g>
        ))}
        {[0, Math.floor(days / 3), Math.floor((2 * days) / 3), li].filter((v, i, a) => a.indexOf(v) === i && v >= 0).map((d) => (
          <text key={d} x={x(d)} y={H - 7} fontSize={11} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{tick(d)}</text>
        ))}
        <polyline points={ed.map((p) => p.join(",")).join(" ")} fill="none" stroke={SAGE.hot} strokeWidth={3} strokeLinejoin="round" />
        <polyline points={upcc.map((p) => p.join(",")).join(" ")} fill="none" stroke={SAGE.primary} strokeWidth={3} strokeLinejoin="round" />
        {days > 0 && (
          <>
            <line x1={x(li)} y1={ed[li][1]} x2={x(li)} y2={upcc[li][1]} stroke={SAGE.hot} strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={x(li) - 6} y={(ed[li][1] + upcc[li][1]) / 2 + 4} fontSize={12.5} fontWeight={800} fill={SAGE.hot} textAnchor="end">gap: {fmtMin(gapNow)}</text>
          </>
        )}
      </svg>
      <div className="legend">
        <span><i style={{ background: SAGE.hot }} />Emergency departments</span>
        <span><i style={{ background: SAGE.primary }} />Urgent &amp; primary care</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write WaitDistribution**

```tsx
// src/app/analytics/charts/WaitDistribution.tsx
import { SAGE, DIST } from "./chart-theme";

type Bucket = { bucket: string; order: number; readings: number };

export function WaitDistribution({ buckets, regionalMedian }: { buckets: Bucket[]; regionalMedian: number }) {
  const ordered = [...buckets].sort((a, b) => a.order - b.order);
  const total = ordered.reduce((s, b) => s + b.readings, 0) || 1;
  const segs = ordered.map((b) => ({ ...b, pct: Math.round((b.readings / total) * 100) }));
  // tonight marker: which bucket holds the current regional median
  const markerOrder = regionalMedian < 60 ? 1 : regionalMedian < 120 ? 2 : regionalMedian < 180 ? 3 : regionalMedian < 240 ? 4 : 5;

  const W = 340, H = 150, padB = 22, padT = 18;
  const maxB = Math.max(1, ...ordered.map((b) => b.readings));
  const bw = W / Math.max(1, ordered.length);

  return (
    <div className="card dist-card">
      <div className="card-mini-title">What a visit looked like <small>share of posted ER waits, past 30 days</small></div>
      <div className="dist-bar">
        {segs.map((s, i) => <div key={s.bucket} className="dist-seg" style={{ flex: s.pct, background: DIST[i % DIST.length] }} title={`${s.bucket}: ${s.pct}%`}>{s.pct >= 6 ? `${s.pct}%` : ""}</div>)}
      </div>
      <div className="dist-labels">{segs.map((s) => <span key={s.bucket} style={{ flex: s.pct }}>{s.bucket}</span>)}</div>
      <svg id="dist-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tonight's wait vs the usual spread">
        <text x={0} y={11} fontSize={11.5} fontWeight={800} fill={SAGE.ink2}>Tonight&apos;s waits vs the usual spread</text>
        {ordered.map((b, i) => {
          const h = (b.readings / maxB) * (H - padB - padT);
          return <rect key={b.bucket} x={i * bw + 3} y={H - padB - h} width={bw - 6} height={h} rx={4} fill={SAGE.primary} opacity={0.3} />;
        })}
        <line x1={(markerOrder - 0.5) * bw} y1={padT} x2={(markerOrder - 0.5) * bw} y2={H - padB} stroke={SAGE.hot} strokeWidth={2.5} strokeDasharray="4 4" />
        <text x={(markerOrder - 0.5) * bw + 6} y={padT + 10} fontSize={11} fontWeight={800} fill={SAGE.hot}>tonight</text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/GapTrend.tsx src/app/analytics/charts/WaitDistribution.tsx
git commit -m "feat(analytics): add section 04 gap trend + distribution"
```

---

### Task 16: Section 05 — VisitCost

Ports `renderVisit` (mockup 858-874), `.visit-row` CSS (224-230). Client component (pagination). Stacked wait + ELOS bar per facility.

**Files:**
- Create: `src/app/analytics/charts/VisitCost.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/analytics/charts/VisitCost.tsx
"use client";
import { useState } from "react";
import { severityColor, fmtMin } from "./chart-theme";
import { paginate } from "@/lib/analytics/paginate";
import { HABadge } from "./HABadge";
import { Pager } from "./Pager";

type Row = { name: string; address: string | null; wait: number | null; elos: number | null };

export function VisitCost({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0);
  const withWait = rows.filter((r) => r.wait != null);
  const max = Math.max(1, ...withWait.map((r) => (r.wait ?? 0) + (r.elos ?? 0))) * 1.02;
  const slice = paginate(withWait, page);

  return (
    <div className="card">
      {slice.map((r) => {
        const w = r.wait ?? 0, e = r.elos ?? 0;
        return (
          <div className="visit-row" key={r.name}>
            <div className="visit-name"><HABadge name={r.name} address={r.address} /><span className="nm">{r.name}</span></div>
            <div className="visit-track">
              <div className="visit-wait" style={{ width: `${(w / max) * 100}%`, background: severityColor(w) }} title={`waiting: ${fmtMin(w)}`} />
              <div className="visit-elos" style={{ width: `${(e / max) * 100}%`, background: severityColor(w) }} title={`treatment (est.): ${fmtMin(e)}`} />
            </div>
            <div className="visit-total">{fmtMin(w + e)}<small>{fmtMin(w)} wait · {e ? fmtMin(e) : "—"} care</small></div>
          </div>
        );
      })}
      <Pager total={withWait.length} page={page} onPage={setPage} />
      <div className="legend" style={{ marginTop: 14 }}>
        <span><i style={{ background: severityColor(200) }} />time waiting</span>
        <span><i style={{ background: severityColor(200), opacity: 0.38 }} />estimated time in care (ELOS)</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/VisitCost.tsx
git commit -m "feat(analytics): add section 05 VisitCost"
```

---

### Task 17: Section 06 — SwingScatter

Ports `renderScatter` (mockup 876-913), `#scatter-chart` CSS (233). Server component. Quadrant scatter: median (x) vs stddev/"swing" (y), bubble radius ∝ √readings.

**Files:**
- Create: `src/app/analytics/charts/SwingScatter.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/analytics/charts/SwingScatter.tsx
import { SAGE, severityColor, linear, fmtMin } from "./chart-theme";

type Pt = { name: string; median: number; stddev: number; readings: number };

export function SwingScatter({ points }: { points: Pt[] }) {
  const W = 720, H = 340, padL = 46, padR = 18, padT = 20, padB = 40;
  const maxX = 250, maxY = 80, midX = 140, midY = 36;
  const x = linear([0, maxX], [padL, W - padR]);
  const y = linear([0, maxY], [H - padB, padT]);
  const ql = (tx: number, ty: number, txt: string, anchor: "start" | "end") => (
    <text x={tx} y={ty} fontSize={10.5} fontWeight={800} fill={SAGE.faint} textAnchor={anchor} style={{ textTransform: "uppercase" }} letterSpacing="0.08">{txt}</text>
  );

  return (
    <div className="card">
      <svg id="scatter-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Median wait vs swing, per facility">
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill={SAGE.card2} rx={10} />
        <line x1={x(midX)} y1={padT} x2={x(midX)} y2={H - padB} stroke={SAGE.grid} strokeWidth={1.5} />
        <line x1={padL} y1={y(midY)} x2={W - padR} y2={y(midY)} stroke={SAGE.grid} strokeWidth={1.5} />
        {ql(padL + 10, padT + 16, "SHORT BUT JUMPY", "start")}
        {ql(W - padR - 10, padT + 16, "LONG & UNPREDICTABLE", "end")}
        {ql(padL + 10, H - padB - 8, "SHORT & STEADY", "start")}
        {ql(W - padR - 10, H - padB - 8, "LONG BUT STEADY", "end")}
        {[60, 120, 180, 240].map((m) => <text key={m} x={x(m)} y={H - padB + 16} fontSize={10.5} fill={SAGE.tick} textAnchor="middle" fontWeight={700}>{m / 60}h</text>)}
        <text x={(padL + W - padR) / 2} y={H - 6} fontSize={11} fill={SAGE.muted} textAnchor="middle" fontWeight={750}>median wait →</text>
        <text x={14} y={(padT + H - padB) / 2} fontSize={11} fill={SAGE.muted} textAnchor="middle" fontWeight={750} transform={`rotate(-90 14 ${(padT + H - padB) / 2})`}>typical swing →</text>
        {points.map((p) => {
          const r = 6 + Math.sqrt(p.readings) / 40;
          return (
            <g key={p.name}>
              <circle cx={x(Math.min(p.median, maxX))} cy={y(Math.min(p.stddev, maxY))} r={r} fill={severityColor(p.median)} opacity={0.82} stroke={SAGE.surface} strokeWidth={1.5}>
                <title>{p.name} — median {fmtMin(p.median)}, swings ±{fmtMin(p.stddev)}</title>
              </circle>
              <text x={x(Math.min(p.median, maxX))} y={y(Math.min(p.stddev, maxY)) - r - 5} fontSize={10.5} fontWeight={750} fill={SAGE.ink2} textAnchor="middle">{p.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/SwingScatter.tsx
git commit -m "feat(analytics): add section 06 SwingScatter"
```

---

### Task 18: Section 07 — MonthCalendar

Ports `renderCalendar` (mockup 915-930), `.cal-wrap`/`.cal-day` CSS (236-239). Server component. One square per day colored by the regional daily median. **Reads `wait_time_hourly` when `USE_HOURLY_ROLLUP=1`** (query `[8]` already handles the fallback) — this is the section that grows with the rollup (prerequisite P0).

**Files:**
- Create: `src/app/analytics/charts/MonthCalendar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/analytics/charts/MonthCalendar.tsx
import { HEAT, fmtMin } from "./chart-theme";

type Day = { date: string; median: number | null };

// Calendar-specific ramp thresholds (mockup renderCalendar `heat`).
function calColor(v: number): string {
  return HEAT[v >= 210 ? 5 : v >= 185 ? 4 : v >= 160 ? 3 : v >= 135 ? 2 : v >= 110 ? 1 : 0];
}

export function MonthCalendar({ days }: { days: Day[] }) {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
  return (
    <div className="card">
      <div className="cal-wrap">
        {days.map((d) => {
          const dayNum = Number(d.date.slice(-2));
          const label = new Date(d.date + "T00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
          return (
            <div key={d.date} className={`cal-day${d.date === todayIso ? " is-today" : ""}`}
              style={{ background: d.median != null ? calColor(d.median) : "var(--track)" }}
              title={`${label} — median ${d.median != null ? fmtMin(d.median) : "no data"}`}>{dayNum}</div>
          );
        })}
      </div>
      <div className="legend"><span><span className="legend-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>calmer → rougher</span></div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/MonthCalendar.tsx
git commit -m "feat(analytics): add section 07 MonthCalendar"
```

---

### Task 19: Section 08 — LeagueTable

Ports `renderLeague` (mockup 833-856), table CSS (211-221), `.trend-*`/`.pill` (218-221). Client component (pagination). Columns: facility, type, 30-day median, evening peak, 30-day sparkline, 7-day trend arrow.

**Files:**
- Create: `src/app/analytics/charts/LeagueTable.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/analytics/charts/LeagueTable.tsx
"use client";
import { useState } from "react";
import { SAGE, fmtMin } from "./chart-theme";
import { paginate } from "@/lib/analytics/paginate";
import { HABadge } from "./HABadge";
import { Pager } from "./Pager";

type Row = { name: string; type: string; median: number | null; eveningPeak: number | null; spark: number[]; trend7d: number | null };

function Spark({ values, up }: { values: number[]; up: boolean }) {
  const W = 110, H = 26;
  if (values.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} />;
  const max = Math.max(...values), min = Math.min(...values), span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <polyline points={pts} fill="none" stroke={up ? SAGE.hot : SAGE.primary} strokeWidth={1.8} strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

export function LeagueTable({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0);
  const slice = paginate(rows, page);
  const arrow = (t: number | null) => {
    if (t == null || Math.abs(t) < 5) return <span className="trend-flat">→</span>;
    return t > 0 ? <span className="trend-up">▲</span> : <span className="trend-down">▼</span>;
  };

  return (
    <div className="card">
      <div className="scrollx">
        <table className="league-table">
          <thead><tr><th>Facility</th><th>Type</th><th>30-day median</th><th>Evening peak</th><th>Last 30 days</th><th>7-day trend</th></tr></thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.name}>
                <td><HABadge name={r.name} size={18} />{r.name}</td>
                <td><span className={`pill ${r.type === "ed" ? "pill-ed" : "pill-upcc"}`}>{r.type === "ed" ? "ED" : "UPCC"}</span></td>
                <td className="num">{fmtMin(r.median ?? 0)}</td>
                <td>{r.eveningPeak != null ? fmtMin(r.eveningPeak) : "—"}</td>
                <td><Spark values={r.spark} up={(r.trend7d ?? 0) > 0} /></td>
                <td>{arrow(r.trend7d)} {r.trend7d != null && Math.abs(r.trend7d) >= 5 ? `${r.trend7d > 0 ? "+" : "−"}${fmtMin(Math.abs(r.trend7d))}` : "±"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager total={rows.length} page={page} onPage={setPage} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/LeagueTable.tsx
git commit -m "feat(analytics): add section 08 LeagueTable"
```

---

### Task 20: Section 09 — BumpChart

Ports `renderBump` (mockup 932-967). Server component. Weekly rank lines (rank 1 = longest at top); the climber and slider (from `standingsMovers`) are highlighted.

**Files:**
- Create: `src/app/analytics/charts/BumpChart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/analytics/charts/BumpChart.tsx
import { SAGE, linear } from "./chart-theme";

type Row = { name: string; ranks: number[] };

export function BumpChart({ rows, climber, slider }: { rows: Row[]; climber: string; slider: string | null }) {
  const W = 860, H = 320, padL = 150, padR = 150, padT = 26, padB = 20;
  const n = Math.max(...rows.map((r) => r.ranks.length), 1);
  const maxRank = Math.max(...rows.flatMap((r) => r.ranks), 1);
  const x = linear([0, n - 1], [padL, W - padR]);
  const y = linear([1, maxRank], [padT, H - padB]);
  const labels = ["4 wks ago", "3 wks ago", "2 wks ago", "this week"].slice(-n);

  return (
    <div className="scrollx">
      <svg id="bump-chart" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", aspectRatio: "860/320" }} role="img" aria-label="Weekly wait-time standings">
        {labels.map((label, w) => (
          <g key={w}>
            <text x={x(w)} y={14} fontSize={10.5} fill={SAGE.tick} textAnchor="middle" fontWeight={750}>{label}</text>
            <line x1={x(w)} y1={padT} x2={x(w)} y2={H - padB} stroke={SAGE.grid} />
          </g>
        ))}
        {rows.map((r) => {
          const isClimber = r.name === climber, isSlider = r.name === slider;
          const highlight = isClimber || isSlider;
          const color = isClimber ? SAGE.hot : isSlider ? "#d97706" : SAGE.faint;
          const pts = r.ranks.map((rank, w) => `${x(w)},${y(rank)}`).join(" ");
          const delta = r.ranks[0] - r.ranks[r.ranks.length - 1];
          const badge = delta > 0 ? ` ▲${delta}` : delta < 0 ? ` ▼${-delta}` : "";
          return (
            <g key={r.name}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth={highlight ? 3.5 : 2} strokeLinejoin="round" opacity={highlight ? 1 : 0.55} />
              {r.ranks.map((rank, w) => <circle key={w} cx={x(w)} cy={y(rank)} r={highlight ? 5 : 3.5} fill={color} stroke={SAGE.surface} strokeWidth={1.5} />)}
              <text x={padL - 12} y={y(r.ranks[0]) + 4} fontSize={11.5} fontWeight={highlight ? 800 : 700} fill={highlight ? SAGE.ink : SAGE.muted} textAnchor="end">{r.name}</text>
              <text x={W - padR + 12} y={y(r.ranks[r.ranks.length - 1]) + 4} fontSize={11.5} fontWeight={highlight ? 800 : 700} fill={highlight ? SAGE.ink : SAGE.muted}>{r.name.split(" ")[0]}{badge}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`

```bash
git add src/app/analytics/charts/BumpChart.tsx
git commit -m "feat(analytics): add section 09 BumpChart"
```

---

### Task 21: Section 10 — RecordsBoard + records/moon helpers

Ports `renderRecords` (mockup 969-983), `.rec-grid`/`.rec` CSS (242-252). Server component. This task also **replaces the `buildRecords`/`buildMoonNote` stubs** in `analytics-data.ts` with real implementations (computed server-side so the tile strings ship in the HTML).

**Files:**
- Create: `src/app/analytics/charts/RecordsBoard.tsx`
- Modify: `src/app/analytics/analytics-data.ts` (replace the stubs + add `FULL_MOONS`)

- [ ] **Step 1: Implement buildRecords + buildMoonNote in analytics-data.ts**

Replace the Task 10 stubs with:

```ts
// 2026 full-moon dates (America/Vancouver), verify against an ephemeris before shipping.
const FULL_MOONS = ["2026-05-01", "2026-05-31", "2026-06-29", "2026-07-29", "2026-08-28", "2026-09-26", "2026-10-26"];

function buildRecords(
  record: { name: string; wait: number; at: Date } | null,
  facRows: { name: string; stddev: number | null }[],
  dailyRows: { date: string; median: number | null }[],
  typical: { hour: number; p50: number }[],
): RecordTile[] {
  const dfmt = (d: string) => new Date(d + "T00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
  const withStd = facRows.filter((f) => f.stddev != null) as { name: string; stddev: number }[];
  const metro = withStd.length ? withStd.reduce((a, b) => (b.stddev < a.stddev ? b : a)) : null;
  const coaster = withStd.length ? withStd.reduce((a, b) => (b.stddev > a.stddev ? b : a)) : null;
  const withMed = dailyRows.filter((d) => d.median != null) as { date: string; median: number }[];
  const calm = withMed.length ? withMed.reduce((a, b) => (b.median < a.median ? b : a)) : null;
  const rough = withMed.length ? withMed.reduce((a, b) => (b.median > a.median ? b : a)) : null;
  const golden = typical.length ? typical.reduce((a, b) => (b.p50 < a.p50 ? b : a)) : null;

  const tiles: RecordTile[] = [];
  if (record) tiles.push({ emoji: "🏆", title: "Longest wait recorded", value: fmtMin(record.wait), sub: `${record.name} · ${new Date(record.at).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` });
  if (golden) tiles.push({ emoji: "🌅", title: "The golden hour", value: `${hourLabel(golden.hour)}`, sub: `${fmtMin(golden.p50)} median — the quietest window` });
  if (metro) tiles.push({ emoji: "📏", title: "The metronome", value: metro.name, sub: `swung just ±${fmtMin(metro.stddev)} all month` });
  if (coaster) tiles.push({ emoji: "🎢", title: "The rollercoaster", value: coaster.name, sub: `±${fmtMin(coaster.stddev)} — pack a book, or get lucky` });
  if (calm) tiles.push({ emoji: "😌", title: "Calmest day", value: dfmt(calm.date), sub: `regional median ${fmtMin(calm.median)}` });
  if (rough) tiles.push({ emoji: "🔥", title: "Roughest day", value: dfmt(rough.date), sub: `regional median ${fmtMin(rough.median)}` });
  return tiles;
}

function buildMoonNote(dailyRows: { date: string; median: number | null }[]): string {
  const withMed = dailyRows.filter((d) => d.median != null) as { date: string; median: number }[];
  if (withMed.length === 0) return "";
  const mean = withMed.reduce((s, d) => s + d.median, 0) / withMed.length;
  const moons = withMed.filter((d) => FULL_MOONS.includes(d.date));
  if (moons.length === 0) return "";
  const avgDelta = Math.round(moons.reduce((s, d) => s + (d.median - mean), 0) / moons.length);
  const dir = avgDelta === 0 ? "right on" : avgDelta > 0 ? `+${avgDelta}m vs` : `${avgDelta}m vs`;
  const caveat = moons.length < 3 ? " (This one gets better as history accumulates.)" : "";
  return `Full-moon check 🌕 — ER folklore says full moons bring chaos. Full moons in this window ran ${dir} the monthly average.${caveat}`;
}
```

Wire them in `shapeView`: `const records = buildRecords(record, facRows, dailyRows, typicalRows.map((t) => ({ hour: t.hour, p50: t.p50 })));` and `const moonNote = buildMoonNote(dailyRows);`.

- [ ] **Step 2: Write RecordsBoard**

```tsx
// src/app/analytics/charts/RecordsBoard.tsx
type Tile = { emoji: string; title: string; value: string; sub: string };

export function RecordsBoard({ tiles, moonNote }: { tiles: Tile[]; moonNote: string }) {
  return (
    <div className="card">
      <div className="rec-grid">
        {tiles.map((t) => (
          <div className="rec" key={t.title}>
            <div className="rec-emoji">{t.emoji}</div>
            <div className="rec-title">{t.title}</div>
            <div className="rec-value">{t.value}</div>
            <div className="rec-sub">{t.sub}</div>
          </div>
        ))}
      </div>
      {moonNote && <p className="rec-myth">{moonNote}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + smoke-test the data layer end to end**

Run: `pnpm exec tsc --noEmit`
Then re-run the smoke test from Task 10 Step 5 and confirm `records` is a non-empty array against local data.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/charts/RecordsBoard.tsx src/app/analytics/analytics-data.ts
git commit -m "feat(analytics): add section 10 RecordsBoard + records/moon helpers"
```

---

## Phase 4 — Page assembly, styles, cleanup

### Task 22: Add Fraunces font + rewrite page.tsx

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/analytics/page.tsx` (full rewrite)

- [ ] **Step 1: Add Fraunces to the root layout**

In `src/app/layout.tsx`, extend the font import and add the CSS variable to `<html>`:

```ts
import { Fraunces, Geist_Mono, Manrope } from "next/font/google";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"] });
```

Then add `${fraunces.variable}` to the `<html className=...>` template (alongside `manrope.variable` and `geistMono.variable`).

- [ ] **Step 2: Rewrite page.tsx to compose the new sections**

```tsx
// src/app/analytics/page.tsx
import type { Metadata } from "next";
import { AutoRefresh } from "../auto-refresh";
import { getAnalytics } from "./analytics-data";
import { PressureHero } from "./charts/PressureHero";
import { StatStrip } from "./charts/StatStrip";
import { RankedBars } from "./charts/RankedBars";
import { HourHeatmap } from "./charts/HourHeatmap";
import { DayProfile } from "./charts/DayProfile";
import { WeekTiles } from "./charts/WeekTiles";
import { GapTrend } from "./charts/GapTrend";
import { WaitDistribution } from "./charts/WaitDistribution";
import { VisitCost } from "./charts/VisitCost";
import { SwingScatter } from "./charts/SwingScatter";
import { MonthCalendar } from "./charts/MonthCalendar";
import { LeagueTable } from "./charts/LeagueTable";
import { BumpChart } from "./charts/BumpChart";
import { RecordsBoard } from "./charts/RecordsBoard";
import "./styles.css";

export const metadata: Metadata = {
  title: "Wait-Time Analytics",
  description: "The story of ER pressure across the Lower Mainland — live wait times, daily and weekly rhythms, records, and trends.",
  alternates: { canonical: "/analytics" },
};

export const revalidate = 60;
export const maxDuration = 15;

const SUB = {
  s01: "Latest posted wait at each facility, and how it compares to that facility's usual level for this hour.",
  s02: "The region's daily cycle over the past 30 days — and each facility's own version of it.",
  s03: "Median ER wait by day of week, past 30 days. Click a day to see its full curve.",
  s04: "Median wait by care type, past 30 days. UPCCs treat non-life-threatening conditions walk-in.",
  s05: "Current wait plus the facility's own estimated length of stay (ELOS) — the closest thing to a door-to-discharge estimate.",
  s06: "Each facility's 30-day median wait against how much it typically swings. Right = longer, up = less predictable.",
  s07: "Each square is one day, colored by the region's median ER wait. This view keeps growing as history accumulates.",
  s08: "30-day median per facility, its evening peak, the last 30 days as a sparkline, and whether the last week improved.",
  s09: "Weekly ranking by median wait, longest at the top. Like league standings, but you want to be at the bottom.",
  s10: "The superlatives of the last 30 days — the extremes hiding inside the averages.",
};

function Eyebrow({ n, label }: { n: string; label: string }) {
  return <div className="sec-eyebrow"><span>{n}</span>{label}</div>;
}

export default async function AnalyticsPage() {
  const result = await getAnalytics();
  if (result.error || !result.view) {
    throw new Error(`Analytics data unavailable: ${result.error ?? "No data returned"}`);
  }
  const v = result.view;
  const now = new Date().toLocaleString("en-CA", { timeZone: "America/Vancouver", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  const bestHours: [number, number] = [Number(v.quietWindow.split("–")[0]) || 9, (Number(v.quietWindow.split("–")[0]) || 9) + 2];

  return (
    <div className="analytics-root">
      <AutoRefresh intervalMs={300_000} />
      <main className="page">
        <div className="masthead">
          <span className="kicker">Live wait-time analytics · Lower Mainland BC</span>
          <time>{now} PT</time>
        </div>

        <PressureHero status={v.status} ratio={v.ratio} context={v.heroContext} drivers={v.heroDrivers} today={v.heroToday} typical={v.heroTypical} />
        <StatStrip shortest={v.shortest} longest={v.longest} reporting={v.reporting} quietWindow={v.quietWindow} />

        <section className="block">
          <Eyebrow n="01" label="Right now" />
          <h2 className="finding">{v.section01}</h2>
          <p className="finding-sub">{SUB.s01}</p>
          <RankedBars rows={v.facilitiesNow} />
        </section>

        <section className="block">
          <Eyebrow n="02" label="The rhythm" />
          <h2 className="finding">{v.section02}</h2>
          <p className="finding-sub">{SUB.s02}</p>
          <div className="duo">
            <HourHeatmap cells={v.heat} />
            <DayProfile profile={v.profile} bestWindow={v.bestWindow} bestHours={bestHours} />
          </div>
        </section>

        <section className="block">
          <Eyebrow n="03" label="The week" />
          <h2 className="finding">{v.section03}</h2>
          <p className="finding-sub">{SUB.s03}</p>
          <WeekTiles week={v.week} typical={v.weekTypical} today={v.heroToday} todayDow={v.todayDow} />
        </section>

        <section className="block">
          <Eyebrow n="04" label="ER vs urgent care" />
          <h2 className="finding">{v.section04}</h2>
          <p className="finding-sub">{SUB.s04}</p>
          <div className="duo">
            <GapTrend gap={v.gap} />
            <WaitDistribution buckets={v.distribution} regionalMedian={v.regionalMedian} />
          </div>
        </section>

        <section className="block">
          <Eyebrow n="05" label="The full visit" />
          <h2 className="finding">{v.section05}</h2>
          <p className="finding-sub">{SUB.s05}</p>
          <VisitCost rows={v.visit} />
        </section>

        <section className="block">
          <Eyebrow n="06" label="Steady or a gamble" />
          <h2 className="finding">{v.section06}</h2>
          <p className="finding-sub">{SUB.s06}</p>
          <SwingScatter points={v.scatter} />
        </section>

        <section className="block">
          <Eyebrow n="07" label="The month" />
          <h2 className="finding">{v.section07}</h2>
          <p className="finding-sub">{SUB.s07}</p>
          <MonthCalendar days={v.calendar} />
        </section>

        <section className="block">
          <Eyebrow n="08" label="The long game" />
          <h2 className="finding">{v.section08}</h2>
          <p className="finding-sub">{SUB.s08}</p>
          <LeagueTable rows={v.league} />
        </section>

        <section className="block">
          <Eyebrow n="09" label="The standings race" />
          <h2 className="finding">{v.section09}</h2>
          <p className="finding-sub">{SUB.s09}</p>
          <div className="card"><BumpChart rows={v.bump} climber={v.section09.includes("climbed") ? v.bump.find((b) => v.section09.startsWith(b.name))?.name ?? "" : ""} slider={null} /></div>
        </section>

        <section className="block">
          <Eyebrow n="10" label="Records & oddities" />
          <h2 className="finding">{v.section10}</h2>
          <p className="finding-sub">{SUB.s10}</p>
          <RecordsBoard tiles={v.records} moonNote={v.moonNote} />
        </section>

        <p className="about">
          <b>About this data.</b> Wait times are the figures each facility posts publicly, collected every minute from the official edwaittimes.ca feed. &ldquo;Typical&rdquo; ranges are per-facility medians for the same hour and day-of-week over the past 28 days. Posted waits are estimates made by the facilities themselves — sicker patients are always seen first. Facilities that don&apos;t publish wait times are excluded from regional numbers, not counted as zero.
        </p>
      </main>
    </div>
  );
}
```

> The BumpChart `climber`/`slider` wiring above is a stopgap. Prefer passing the movers explicitly: add `moverClimber: string` and `moverSlider: string | null` to `AnalyticsView` (set them in `shapeView` from the `mv` object already computed), and render `<BumpChart rows={v.bump} climber={v.moverClimber} slider={v.moverSlider} />`. Do this cleanly rather than parsing the finding sentence.

- [ ] **Step 3: Add the mover fields to the view (clean BumpChart wiring)**

In `analytics-data.ts`: add `moverClimber: string; moverSlider: string | null;` to `AnalyticsView`, and in `shapeView`'s return add `moverClimber: mv.climberName, moverSlider: mv.sliderName`. Then simplify the section 09 block in `page.tsx` to `<div className="card"><BumpChart rows={v.bump} climber={v.moverClimber} slider={v.moverSlider} /></div>`.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/analytics/page.tsx src/app/analytics/analytics-data.ts
git commit -m "feat(analytics): assemble redesigned page + Fraunces font"
```

---

### Task 23: Port the Sage design system into styles.css

Replace `src/app/analytics/styles.css` with the mockup's stylesheet, Sage-only and scoped to `.analytics-root`.

**Files:**
- Modify: `src/app/analytics/styles.css` (full replacement)

- [ ] **Step 1: Write the token block**

Start the file with the Sage tokens (from mockup `:root` lines 10-22, sans the palette-switcher comment), scoped to the page root, and wire the fonts:

```css
/* Analytics page — Sage design system (ported from the approved mockup). */
.analytics-root {
  --ink: #171a18; --ink2: #3b403d; --muted: #71766f; --faint: #9aa098;
  --line: #e5e9e4; --surface: #ffffff; --bg: #f4f6f2; --card2: #fafbf8;
  --primary: #0f766e; --primary-soft: #e2efec;
  --hot: #b5462d; --good: #15803d; --warnc: #d97706; --rose: #be123c;
  --sev1: #7fb89b; --sev2: #d9a44a; --sev3: #cf7f43; --sev4: #b5462d;
  --shadow-sm: 0 1px 2px rgba(23,26,24,0.04), 0 4px 16px rgba(23,26,24,0.05);
  --shadow-md: 0 2px 4px rgba(23,26,24,0.05), 0 12px 40px rgba(23,26,24,0.09);
  --wash1: rgba(15,118,110,0.07); --wash2: rgba(181,70,45,0.045);
  --hero-grad-a: #c47b1a; --hero-grad-b: #b5462d; --track: #eef1ec;

  min-height: 100vh;
  color: var(--ink);
  font-family: var(--font-manrope), Manrope, system-ui, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(1200px 500px at 75% -100px, var(--wash1), transparent 60%),
    radial-gradient(900px 420px at 8% 220px, var(--wash2), transparent 65%),
    var(--bg);
}
.analytics-root * { box-sizing: border-box; }
```

- [ ] **Step 2: Port the structural rules from the mockup verbatim**

Copy the mockup CSS rules from `docs/plans/mockups/analytics-redesign-mockup.html` lines **54-311** into `styles.css` **after** the token block, with these three mechanical transforms and these deletions. The mockup is committed, so this is a faithful copy, not a guess.

**Prefix every selector with `.analytics-root `** so the rules stay scoped (e.g. `.hero {` → `.analytics-root .hero {`, `.rank-row {` → `.analytics-root .rank-row {`, media-query bodies included). Class names already match the components built in Phase 3.

**Font transforms:**
- `.hero-status` and `.finding` (and `.sec-eyebrow span`): replace `font-family: Fraunces, Georgia, serif;` → `font-family: var(--font-fraunces), Fraunces, Georgia, serif;`
- `svg text { font-family: Manrope… }` → `.analytics-root svg text { font-family: var(--font-manrope), Manrope, system-ui, sans-serif; }`

**Delete (mock-only, not shipped):**
- `.swatchbar*` rules (mockup 39-52) — the palette switcher.
- `body[data-dark] .cal-day` (mockup 239) and any other `[data-dark]` rule — no dark mode.
- The `@media (max-width: 860px) { .swatchbar … }` line inside the breakpoint (mockup 263).

Keep everything else verbatim: `.masthead`, `.kicker`, `.hero*`, `.gauge*`, `.strip`/`.stat`, `.block`/`.sec-eyebrow`/`.finding*`, `.card`/`.duo`, `.pager`, `.ha*`, entrance-motion keyframes + `prefers-reduced-motion`, `.rank-*`, `.profile-*`/`.best-window`, `.week-*`/`.day-*`, `.heat-*`/`.legend*`, `.dist-*`, table rules, `.visit-*`, `#scatter-chart`, `.cal-*`, `.rec*`, `.about`, and both `@media` blocks (860px, 640px).

- [ ] **Step 3: Verify the page styles render (dev server)**

Run: `pnpm db:up && pnpm dev` and open `http://localhost:3000/analytics`.
Expected: the page renders in Sage with the hero, strip, and ten sections laid out as in the mockup (data may be sparse on local DB — that's fine; check layout + fonts, not values).

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/styles.css
git commit -m "style(analytics): Sage design system ported from mockup"
```

---

### Task 24: Loading skeleton + delete the old chart module

**Files:**
- Modify: `src/app/analytics/loading.tsx`
- Delete: `src/app/analytics/analytics-charts.tsx`

- [ ] **Step 1: Replace loading.tsx with a matching skeleton**

Rewrite `loading.tsx` to a lightweight skeleton that mirrors the new layout (hero block + 4-up strip + a few section stubs) using the `.analytics-root`/`.page` shells and neutral placeholder boxes. Keep it a server component with no data access. It only needs to avoid layout shift — reuse the `.hero`, `.strip`/`.stat`, and `.card` shells with empty content and a subtle pulse (add a `.skeleton` rule to `styles.css` if desired).

```tsx
// src/app/analytics/loading.tsx
import "./styles.css";

export default function Loading() {
  return (
    <div className="analytics-root">
      <main className="page">
        <div className="masthead"><span className="kicker">Live wait-time analytics · Lower Mainland BC</span></div>
        <section className="hero" aria-hidden="true"><div style={{ minHeight: 220 }} /><div style={{ minHeight: 220 }} /></section>
        <div className="strip" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="stat" style={{ minHeight: 64 }} />)}</div>
        {Array.from({ length: 4 }, (_, i) => (
          <section className="block" key={i} aria-hidden="true">
            <div className="sec-eyebrow"><span>0{i + 1}</span>Loading…</div>
            <div className="card" style={{ minHeight: 180 }} />
          </section>
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old chart.js consumer and remove the dep**

```bash
git rm src/app/analytics/analytics-charts.tsx
pnpm remove chart.js
```

- [ ] **Step 3: Verify nothing imports the deleted module or chart.js**

Run: `grep -rn "analytics-charts\|chart.js\|chartjs" src/`
Expected: no matches.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (chart.js is now gone and nothing references it).

```bash
git add src/app/analytics/loading.tsx src/app/analytics/analytics-charts.tsx package.json pnpm-lock.yaml
git commit -m "chore(analytics): new loading skeleton, remove chart.js"
```

---

## Phase 5 — Verification

### Task 25: Full test + lint + typecheck + build

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `pnpm test`
Expected: PASS. The new suites — `health-authorities`, `format`, `pressure-index`, `paginate`, `finding-titles`, `derive` — plus the existing 36 all green. Total should be the prior 36 plus the new tests.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. (The `<img>` badges carry `eslint-disable-next-line @next/next/no-img-element`; confirm no other warnings slipped in.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Production build**

Run: `pnpm build`
Expected: build succeeds; `/analytics` compiles as a dynamic route (ISR `revalidate = 60`). Confirm no chart.js in the bundle and no server-only import leaked into a client component.

- [ ] **Step 5: Commit any fixes**

If steps 1-4 surfaced fixes, commit them:

```bash
git add -A
git commit -m "fix(analytics): resolve verification findings"
```

If nothing changed, skip.

---

### Task 26: Visual browser pass (desktop + 375px)

Per the spec's Testing section and the acceptance criteria. The user tests mobile on a real device — **serve on the LAN, do not fake a mobile viewport.** (`python3 -m http.server` binds `0.0.0.0`; for the Next dev server use `pnpm dev` and browse `http://10.0.0.165:3000/analytics` from the phone.)

**Files:** none (verification only)

- [ ] **Step 1: Serve for LAN access**

Run: `pnpm db:up && pnpm dev` (Next binds all interfaces by default). Note the LAN IP `10.0.0.165`.

- [ ] **Step 2: Desktop pass**

Open `http://localhost:3000/analytics`. Verify against `docs/plans/mockups/analytics-redesign-mockup.html` (serve the mockup folder over HTTP so badges load): hero status word + gauge needle in the right band, curve + typical band, stat strip, all ten sections present with finding-sentence titles, Sage palette, Fraunces on hero/findings, Manrope elsewhere, health-authority badges (favicon-in-ring, symmetric). Confirm interactions: RankedBars/VisitCost/LeagueTable pagination pills, WeekTiles day selector updates the detail curve, heatmap/scatter/calendar native tooltips.

- [ ] **Step 3: 375px pass on the real device**

Load `http://10.0.0.165:3000/analytics` on the phone. Overflow audit: hero stacks, strip → 2-up, `.duo` stacks, heatmap/league/bump scroll sideways (`.scrollx`), rank/visit rows switch to name-over-bar layout, calendar reflows to 6 columns. Nothing overflows the viewport horizontally except the intentional `.scrollx` regions.

- [ ] **Step 4: Empty-state pass**

The local Docker DB likely has thin history — good for exercising fallbacks. Confirm: finding titles fall back to neutral phrasing where data is thin (e.g. section 09 with <2 weeks → "The weekly standings have barely shifted."); charts render without crashing on empty arrays (no NaN geometry); the moon note is omitted when no full moon falls in the window. If any section throws or renders NaN, fix the guard in that component and re-verify.

- [ ] **Step 5: Reduced-motion check**

With OS "reduce motion" on, confirm the rise-in/grow animations are disabled (the `@media (prefers-reduced-motion: reduce)` rule ported in Task 23).

- [ ] **Step 6: Record the pass**

No commit needed unless fixes were made. If the browser pass surfaced tweaks, commit them with a `fix(analytics): …` message describing the visual fix.

---

## Self-Review (performed against the spec)

**1. Spec coverage** — every spec element maps to a task:
- Hero pressure index (definition, status word, gauge, drivers, today-vs-typical curve) → Tasks 4, 7, 11 (+ data layer Task 10 queries [0][1][2]).
- Stat strip (4 BANs) → Task 11 + data layer.
- Sections 01-10 → Tasks 12-21, each with its finding-title (Task 6) and query (Task 10).
- Finding-title templates finalized (rule table) with fallbacks → Task 6.
- Palette Sage + severity ramp + fonts + badges + motion + pagination → Tasks 7, 8, 23.
- Charts hand-rolled SVG + d3-scale/d3-shape; chart.js removed; static = server, interactive = client → Tasks 1, 7, 11-24.
- Data layer single Promise.all batch + 30s cache + inflight + ISR 60 + rollup-aware section 07 → Task 10 (+ [8] rollup gate, [11] in Task 14).
- Error & empty states (page-level throw pattern kept; per-section fallbacks) → Tasks 10, 22, 26 Step 4.
- Testing (unit for pure logic, SQL against local, visual pass) → Tasks 2-6, 9 (unit), 10 (SQL), 26 (visual).
- Prerequisites (rollup P0, deps, assets) → Prerequisites section + Tasks 1, 18.
- Deferred items (archive explorer, dark mode, i18n, pop-culture) → excluded; noted in spec, not implemented.

**2. Placeholder scan** — one deliberate stub (`buildRecords`/`buildMoonNote` in Task 10) is explicitly filled in Task 21; the one intentional scope deferral (per-date past-day actuals in section 03) is surfaced to the user in Task 14 with the exact follow-up query. No "TBD"/"add error handling"/"similar to Task N" placeholders; every code step shows complete code.

**3. Type consistency** — `AnalyticsView` field names are consistent across the data layer (Task 10), the per-dow extension (Task 14), the mover fields (Task 22), and every consuming component. `healthAuthorityFor({ name, address })`, `paginate`, `pageCount`, `PAGE_SIZE`, `fmtMin`, `severityColor`, `heatColor`, `smoothPath`, `linear`, `hourLabel` keep one signature throughout. Finding-title function names (`section01`..`section10`, `heroContext`, `heroDrivers`) match between Task 6 and the data layer imports.

**Known non-blocking follow-ups (surface, don't silently ship):**
- Section 03 past-date actuals (Task 14 scope note).
- `FULL_MOONS` constant needs an ephemeris check before production (Task 21).
- Section 07 depends on the P0 rollup being live for its long-horizon growth.

---

## Execution Handoff

Plan complete and saved to `docs/plans/analytics-redesign-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
2. **Inline Execution** — execute tasks in this session with checkpoints for review. REQUIRED SUB-SKILL: superpowers:executing-plans.

Before Phase 3 chart work begins, get the user's go/no-go on Prerequisite **P0** (the production Supabase rollup) — it is the DB-cap deadline (~2026-07-30) and section 07's growth dependency.
