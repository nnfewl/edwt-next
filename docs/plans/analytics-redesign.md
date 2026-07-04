# Analytics Page Redesign — Design Spec

**Date:** 2026-07-02
**Status:** Approved design, pending implementation plan
**Branch:** `redesign/analytics` (merges into `dev`)
**Mockup:** `docs/plans/mockups/analytics-redesign-mockup.html` (serve the folder over HTTP;
health-authority icons load relatively). The interactive mockup is the visual source of
truth — this doc records the decisions and the data contracts behind it.

## Problem

The current `/analytics` shows 16 datasets across 6 charts, 4 tables, 8 stat cards and
method notes, mixing visitor insight with ops telemetry (poll cadence, freshness,
coverage). Nothing answers "so what?" — it reads as noise. User verdict: "too much
information, doesn't give much insight."

## Goal & audience

**Audience (decided):** the data-curious public — journalists, policy watchers, health
nerds. The page tells the story of ER pressure in the region.

**Design principle:** every section leads with a *finding stated as a sentence*, not a
topic label. Titles are deterministic templates filled from the data (no LLM, no
freeform generation), each with a neutral fallback when the data is unremarkable.
Research basis: dashboard-storytelling and COVID-dashboard literature (context-embedded
metrics, 5–7 items max, takeaway titles, methodology-as-footnote for trust).

## Page structure

Hero + stat strip + 10 numbered sections. All facility lists show the health-authority
badge (favicon-in-ring, same assets as `/map` markers, `public/health-authorities/`).

| # | Section | Visualization | Data window |
|---|---------|---------------|-------------|
| — | **Hero: pressure index** | Status word (Calm/Typical/Elevated/Severe) + gauge + today-vs-typical-band curve | live + 28d baseline |
| — | **Stat strip** | 4 BANs: shortest/longest wait now, facilities reporting, quietest window | live + 30d |
| 01 | **Right now** | Ranked horizontal bars + "vs usual" delta chips, paginated | live + per-facility hour-of-week baseline |
| 02 | **The rhythm** | Facility×hour heatmap (top 8) + regional 24h profile with best-time-to-go callout | 30d |
| 03 | **The week** | 7 day tiles (median + shape sparkline) + click-to-detail day curve; past days = actual, today = actual+projection, future = projected from history | 30d |
| 04 | **ER vs urgent care** | 2-line 30d trend with gap annotation + wait-distribution segmented bar + tonight-vs-usual histogram | 30d |
| 05 | **The full visit** | Stacked bars: wait + ELOS = door-to-discharge estimate, paginated | live |
| 06 | **Steady or a gamble** | Quadrant scatter: median vs swing (stddev), bubble = volume | 30d |
| 07 | **The month** | Calendar strip, one square per day, colored by daily regional median | 30d, grows with rollup |
| 08 | **The long game** | League table: 30d median, evening peak, 30d sparkline, 7d trend arrow; paginated | 30d |
| 09 | **The standings race** | Bump chart of weekly rankings; movers highlighted with ▲/▼ badges | 4 weeks |
| 10 | **Records & oddities** | Award tiles (record wait, golden hour, metronome, rollercoaster, calmest/roughest day) + full-moon myth check | 30d |
| — | **About this data** | One-paragraph methodology footer | — |

**Deleted from the page:** poll cadence, freshness lag, coverage tables, z-score alert
table, volatility table (subsumed by 06), readings-count cards, method-notes grid. Ops
telemetry is not visitor content.

### Hero pressure index — definition

- Regional current = median of latest posted waits across open EDs (UPCCs excluded).
- Baseline = per-facility median for the same hour + day-of-week over the past 28 days
  (same math as the `today` route), aggregated the same way.
- Ratio → status word: <0.8 Calm, 0.8–1.15 Typical, 1.15–1.6 Elevated, >1.6 Severe.
- "Driving it" = top 2 facilities by (current − their own baseline).
- Chart: today's regional median per hour vs the typical curve with p25–p75 band.

### Finding-title templates (examples)

- 01: "{N} hospital(s) are carrying most of tonight's pressure." (top-2 share > 40%),
  fallback "Waits are spread evenly across the region tonight."
- 04: "An ER visit costs about {Δ} more than urgent care — and the gap is
  {widening|narrowing|steady}." (Δ trend over 30d)
- 07: "Only {N} genuinely calm days in the last thirty." (days below p25 of daily medians)
- Full rule table to be finalized during implementation planning; every template has a
  neutral fallback.

## Visual design

- **Palette: Sage** (decided) — the site's existing clinical teal/coral family. The
  mockup's palette switcher is a mock-only tool; production ships Sage only.
- **Severity ramp (warm, shared by all charts):** `<60m #84a86a · <120m #d9a44a ·
  <180m #dd8a4d · <240m #cf6a3c · <300m #b5462d · ≥300m #8f2a22`. Heatmap ramp as in
  mockup. Flat fills — no gloss/3D effects.
- **Type:** Fraunces (serif) for the hero status word + section findings; Manrope for
  everything else. Numbers use tabular-nums.
- **Badges:** 22px circle, 1px `--line` border (never offset shadows — they read as
  asymmetric frames), 14px logo, integer sizes only.
- **Motion:** cards rise-in staggered; ranked bars grow from zero; disabled under
  `prefers-reduced-motion`.
- **Pagination:** facility lists page at 10/page with numbered pills (1 2 3), state
  per-card, pure client-side slicing of the already-fetched payload.

## Technical design

**Charts: hand-rolled SVG React components with `d3-scale` + `d3-shape`** (decided
after weighing pure hand-rolling, visx, and full libraries):

- New deps: `d3-scale`, `d3-shape` (+ `@types/*`) — ~10KB gzipped total.
- `chart.js` is removed from the page (its only consumer) and from `package.json`.
- Static charts render in **server components** — they arrive in the initial HTML
  (LCP win vs today's blank canvases). Interactive pieces are small client components:
  week-day selector, pagination, heatmap/scatter tooltips.
- Curve smoothing via `curveCatmullRom` (replaces hand-written math); scales/ticks via
  `scaleLinear`. Annotations are plain `<text>`/`<line>` elements.
- Component sketch: `src/app/analytics/charts/` — `PressureHero`, `RankedBars`,
  `HourHeatmap`, `DayProfile`, `WeekTiles` (client), `GapTrend`, `WaitDistribution`,
  `VisitCost`, `SwingScatter`, `MonthCalendar`, `LeagueTable`, `BumpChart`,
  `RecordsBoard`, shared `chart-theme.ts` (ramp, fonts, formatters) and `Pager` (client).

**Data layer:** one server-side query batch (existing `Promise.all` pattern in
`src/app/analytics/page.tsx`), rewritten to the new sections' needs. Key queries:

- Latest per facility (`DISTINCT ON`) — hero, 01, 05.
- Hour-of-week baselines (28d, `percentile_cont`) — hero context, 01 delta chips, 03.
- Facility×hour averages (30d) — 02.
- Daily regional medians (30d) — 07, 10 calmest/roughest.
- Weekly per-facility medians (4w) — 09 rankings.
- Stddev + median per facility (30d) — 06, 10 metronome/rollercoaster.
- ELOS latest per facility — 05.
- `MAX(wait)` with timestamp (30d) — 10 record.
- Full-moon check: date join against a small lunar-dates constant — 10.

In-process 30s cache + inflight coalescing (existing pattern) stays. ISR
`revalidate = 60` stays.

**Aging behavior:** raw readings cover a rolling 30 days (retention prune); the
`wait_time_hourly` rollup grows forever. Every ≤30d section reads raw; anything
longer-horizon (07 growth, future range toggles) reads the rollup. The structure never
changes as history accumulates — sections just get deeper.

## Error & empty states

- Page-level DB failure: keep the existing error panel pattern (`analytics-error-panel`).
- Per-section: every chart handles "not enough data" with a quiet placeholder line
  (e.g., 09 needs ≥2 weeks; 10 moon-check labels itself low-confidence until ≥3 moons).
- Facilities with no posted waits are excluded from aggregates, never counted as zero
  (stated in the About footer).

## Testing

- Unit (vitest): finding-template rules (each branch + fallback), pressure-index
  classification thresholds, formatters, pagination slicing, baseline aggregation
  helpers. Pure functions in `src/lib/` per the existing pattern.
- SQL: each new query exercised against the local Docker DB before wiring into the page.
- Visual: browser pass at desktop + 375px (overflow audit as done on the mockup).

## Prerequisites & dependencies

1. **Retention rollup applied on Supabase** (runbook in `retention-rollup.md`) —
   hard prerequisite for section 07's growth and the DB cap deadline (~2026-07-30).
2. `d3-scale`, `d3-shape` added; `chart.js` removed.
3. Health-authority favicon assets already exist (`public/health-authorities/`).

## Deferred / out of scope

- **Archive time explorer** (year/month/day navigation with adaptive unlocking —
  prototyped in `analytics-redesign-mockup-archive-explorer.html`): deferred. The
  design is proven; ship after the rollup has accumulated enough history to matter.
  Key idea preserved: UI derives from `[archive_start … now]`, Year view unlocks at
  >45 days, day drill-down labels its resolution honestly (raw vs rollup).
- Palette switcher / dark mode (Midnight variant exists in the mockup if ever wanted).
- i18n of the new page (the previous i18n branch was discarded; revisit separately).
- "While you wait" pop-culture equivalences (considered, dropped — tone risk).

## Section-by-section acceptance

A section is done when: it renders from real queries with the finding-title rule wired,
matches the mockup visually in Sage, handles its empty state, works at 375px, and its
pure logic has tests.
