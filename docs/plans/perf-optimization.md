# Performance Audit: `/` and `/analytics`

Audit date: 2026-06-12 (measured, not estimated — production curl timings, production DB query timings, local prod-build server logs, and a micro-benchmark)

## Measured production behavior (edwt.ca, Vercel iad1 behind Cloudflare, Supabase ca-central-1)

| Request | TTFB | Total | Notes |
|---------|------|-------|-------|
| `/analytics` ×5 | 2.3–2.7s | **18s – 118s** | skeleton streams fast, then the stream stalls for the rest |
| `/` ×3 | 2.0–2.5s | 2.1–3.3s | acceptable; TTFB dominated by lambda + 1 DB query |

Same build, run locally against the same production pooler (`next start` + `.env.prod`):

| Scenario | Total | What it isolates |
|----------|-------|------------------|
| `/analytics` cold | 11.4–14.6s | queries + render |
| `/analytics` warm in-process cache (zero DB queries) | **5.4s** | pure server render CPU |
| `/analytics?shell=1` (no data, no charts) | 0.46s | framework baseline |
| `/` | 1.1s | fine |

Server log breakdown of the query phase (cold, against prod pooler):

```
raw_polls regclass check (serial):  1,352 ms   ← includes pool connect
batch 1 done:                       5,662 ms   (Δ 4.3s — full-table count/quality/freshness scans)
batch 2 done:                       7,195 ms   (Δ 1.5s)
batch 3 done:                       8,904 ms   (Δ 1.7s)
render + stream after data:        ~5,700 ms   ← see quick exception below
```

DB facts: `wait_time_readings` = ~322k rows / 133 MB; data starts 2026-05-26, so the "30 days" filter matches **the entire table** (~203k rows have non-null wait). The planner correctly seq-scans (~120–500ms/query). Indexes can't help until the table is much older than the window.

---

## Recommended implementation order

The normal work order is **`/` first, `/analytics` second**. The one exception is the tiny `/analytics` `Intl.DateTimeFormat` hot-loop fix below: it is a small client-component change with a measured multi-second win on both server render and hydration, so it is worth doing before the `/` workstream if we allow exactly one analytics detour.

1. **Quick exception: `/analytics` render CPU**
   - Hoist the time formatter and replace the `labels × find` loop with a one-pass lookup map.
   - This is the highest win-per-line item in the audit and should not pull in the broader analytics query/cache work.

2. **Primary workstream: `/` endpoint**
   - Re-measure `/` after the quick exception so the baseline reflects current production.
   - Decide whether `/` should stay dynamic because it uses IP-geo headers, or move approximate origin resolution fully client-side and set `revalidate = 30`.
   - If `/` stays dynamic, keep the optimization focused: inspect `getPublicFacilities()`, payload size, and only then tackle client bundle work.
   - Treat the drawer/icon split as secondary unless fresh bundle analysis shows it matters on first load.

3. **Second workstream: `/analytics` endpoint**
   - Delete unused queries/props, remove the serial `raw_polls` existence query, merge query batches, and replace exact table counts.
   - Only after that, revisit `/analytics` ISR. The current `searchParams` shell path is a request-time API, so simply adding `revalidate = 60` is not enough unless the shell debug mode moves elsewhere or the page stops awaiting `searchParams`.

---

## Quick exception — `Intl.DateTimeFormat` hot loop in `analytics-charts.tsx` (≈5s CPU per request, and growing)

`shortTime()` (`analytics-charts.tsx:98`) constructs a **new `Intl.DateTimeFormat` on every call** (~60µs each). It is called inside `typeTrendSeries` (`analytics-charts.tsx:366-384`) in an O(labels × rows) pattern:

```
labels.map(label => typeTrend.find(p => p.type === t && shortTime(p.bucket) === label))
```

With today's data (329 typeTrend rows → 211 labels × 4 series), that's ~81k formatter constructions. Micro-benchmark with exactly this shape: **5,090ms** — matching the measured 5.4s warm-cache render almost exactly.

This burns CPU **three times**:
1. **On the server, every request** — client components still SSR. On the throttled Vercel lambda this 5s becomes 15–115s → the 18–118s production totals and the stalled stream after the skeleton.
2. **On the client during hydration** — multi-second main-thread freeze, worse on phones.
3. **On every AutoRefresh** (5 min) — new props identity re-runs the memo.

It also **grows quadratically**: labels and rows both scale with the data window, so the page gets slower every day. This is why the problem feels recent and worsening.

### Fix (small, ~10 lines)

- Hoist the formatter to module scope (one `Intl.DateTimeFormat`, like `localFormatter` already does in `page.tsx`).
- Replace the `find` loop with a `Map` keyed by `${type}|${label}` built in one pass.
- Expected: 5,090ms → low single-digit ms. This is the single biggest win on either route.

### TODO

- [x] **P0** — Hoist `Intl.DateTimeFormat` in `shortTime` to module scope (`analytics-charts.tsx:98`) — commit `27b4c01`
- [x] **P0** — Replace `labels × find` with a one-pass `Map` in `typeTrendSeries` — commit `27b4c01`
- [ ] **P2** — Audit other per-call `Intl` constructions (`compactNumber`, `fmtNumber` in `page.tsx`) — low call counts today, same trap

---

## `/analytics` query work — 19 queries, 3 of them dead, run in 3 needless sequential batches (≈8.9s)

### Dead weight (verified by grep — queried, never rendered)

| Query | Status |
|-------|--------|
| `rankFlow` (`page.tsx:472`) | **never used in JSX** |
| `hourly` (`page.tsx:367`) | **never used in JSX** |
| `trend` (`page.tsx:380`) | passed to `<AnalyticsCharts>` (`page.tsx:912`) which **never destructures it** (`analytics-charts.tsx:318`) — also bloats the RSC payload |

Deleting these removes 3 queries. Only `trend` currently bloats the HTML/RSC payload; `hourly` and `rankFlow` waste DB/server work but are not serialized to the client.

### Sequencing

- The serial `to_regclass('raw_polls')` check costs 1.35s before anything else starts. Production is Supabase — `raw_polls` never exists there. Drive it from an env var (or `process.env.VERCEL`) instead of a query.
- Batches 1/2/3 have zero data dependencies; the split is purely code structure. One `Promise.all` makes the query phase ≈ slowest single query instead of the sum of three batch-maxima. Pool is `max: 10`; 16 live queries means mild queueing — still strictly better. (Optionally bump to 16.)

### Full-table scans in batch 1 (the 4.3s batch)

- `count(*)` per table for the metric cards → use `pg_class.reltuples` (instant, accurate enough for a dashboard).
- `quality` and `observedRange` aggregate the whole table with no time filter; `coverage` (batch 3) too. Either accept (~0.5s each, parallel) or move to the rollup below.

### TODO

- [x] **P0** — Delete `rankFlow`, `hourly` queries and the `trend` prop (3 dead queries, smaller payload) — commit `cb27473`
- [x] **P1** — Replace the `raw_polls` regclass query with config (env var); removes 1.35s serial step — commit `12b6286`
- [x] **P1** — Merge the 3 batches into one `Promise.all` (query phase ~8.9s → ~4s) — commit `12b6286`
- [x] **P1** — `count(*)` table stats → `pg_class.reltuples` — commit `12b6286`
- [ ] **P3** — Hourly rollup table or materialized view refreshed by `pg_cron` (see `docs/plans/retention-rollup.md`); the structural fix once data outgrows the window. Note: a partial index is NOT currently useful — the 30-day window covers 100% of the table, the seq scans are the right plan.

---

## Cache work — `force-dynamic` + `no-store` on mostly shared pages

`/analytics` (and `/`) sends `cache-control: private, no-cache, no-store` (`x-vercel-cache: MISS`, `cf-cache-status: DYNAMIC`). Every visitor anywhere pays a full lambda invocation + render. The data is the same for all users and already sits behind a 30s in-process cache — but on Vercel each lambda instance has its own module state, so the cache rarely helps (measured: back-to-back production requests each took 100s+).

### TODO

- [ ] **P1** — `/`: choose caching strategy first. It currently personalizes via IP-geo headers (`getApproximateLocationOrigin` reads `x-vercel-ip-*` through `headers()`), which opts the route into request-time rendering. Options: move origin resolution fully client-side (GPS/session logic already exists) and set `revalidate = 30`, or keep `/` dynamic because 2-3s is tolerable.
- [x] **P1** — `/analytics`: before ISR, remove or relocate the `?shell=1` debug path that awaits `searchParams`; `searchParams` is also request-time data. Then drop `force-dynamic`/`revalidate = 0` and set `export const revalidate = 60`. — commit `37a83d8`
- [ ] **P2** — Confirm `AutoRefresh` expectations after ISR. `router.refresh()` makes a new server request, but it does not invalidate the server-side cache; freshness comes from the `revalidate` interval or explicit invalidation.
- [ ] **P3** — Consider `maxDuration` back down from 60 once the above lands (cost guard).

---

## Secondary findings

### `/analytics` client bundle

- `import Chart from "chart.js/auto"` pulls every controller/scale/plugin: the chunk is 209KB raw / 70KB gz. Registering only the used pieces (bar, line, scatter, bubble + scales/tooltip/legend) typically saves ~30-40%. **P2**
- Charts fully re-instantiate (`destroy()` + `new Chart`) on every AutoRefresh because configs get new identities. With ISR + 5-min refresh this is occasional; leave unless it shows up. **P3**

### `/` client bundle

- Current build manifest shows `/` initial JS ≈ 189KB raw / 55KB gzip. MapLibre correctly stays off `/`; Sentry's big chunk is lazy-loaded. The earlier ~560KB raw estimate appears stale or included lazy chunks.
- [ ] **P2** — After re-measuring `/`, lazy-load the facility detail drawer (only shown on tap) via `next/dynamic` if it still moves first-load bytes meaningfully.
- [ ] **P3** — Replace FontAwesome icons with inline SVGs only if bundle analysis still shows `@fortawesome/*` as a first-load problem.

### Corrections to the previous version of this doc

- `HeroMapBackdrop` is already optimal (AVIF/WebP `<picture>`, `fetchPriority="low"`) — removed from TODO.
- The proposed partial index was wrong for today's data: the 30-day window spans the whole table, so seq scans are correct. Revisit only after the table is several times older than the window (or after rollups).
- The earlier "3-8s" batch estimates were close (8.9s measured) but missed that **render CPU, not queries, dominates** on Vercel.

---

## Expected outcome

| Fix | Effort | Effect (measured basis) |
|-----|--------|------------------------|
| `/` caching strategy | small/medium | If origin can move client-side, cached `/` hits should avoid per-visitor lambda work |
| Intl hot-loop fix | ~10 lines | −5s server render **and** −5s client hydration; removes the growth-over-time degradation |
| Delete 3 dead queries | deletion | less query/server work; removing `trend` also shrinks payload |
| Env-var `raw_polls` + single `Promise.all` | small | query phase 8.9s → ~3-4s |
| `revalidate = 60` on `/analytics` | small after removing request-time shell path | TTFB ~2.5s/100s+ → ~100-300ms for cached visitors |

Combined, `/analytics` should go from **18–118s to under 1s** for cached hits and ~5s for regenerations, with the regeneration happening in the background where nobody waits on it.
