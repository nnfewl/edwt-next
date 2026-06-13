# Performance Audit: `/`, `/map`, and `/analytics`

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

3. **Follow-up workstream: `/map` endpoint — completed**
   - Shared-shell caching is in place: request-time origin and URL-param handling moved out of the server page, and `/map` is prerenderable with 30s revalidation.
   - MapLibre stays lazy-loaded, with a real loading shell before the 1MB map chunk boots and client polling for facility updates.

4. **Second workstream: `/analytics` endpoint**
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
- [x] **P2** — Audit other per-call `Intl` constructions (`compactNumber`, `fmtNumber` in `page.tsx`) — hoisted/cached remaining number formatters in `analytics-charts.tsx` and `page.tsx`

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

- [x] **P1** — `/`: choose caching strategy first. It previously personalized via IP-geo headers (`getApproximateLocationOrigin` reads `x-vercel-ip-*` through `headers()`), which opted the route into request-time rendering. Chosen path: keep `/` shared with `revalidate = 30`, start from `FALLBACK_LOCATION_ORIGIN`, and restore approximate IP origin client-side through dynamic `/api/location-origin`; GPS/session origin still wins. — commit `3de9da9`
- [x] **P1** — `/analytics`: before ISR, remove or relocate the `?shell=1` debug path that awaits `searchParams`; `searchParams` is also request-time data. Then drop `force-dynamic`/`revalidate = 0` and set `export const revalidate = 60`. — commit `37a83d8`
- [x] **P2** — Confirm `AutoRefresh` expectations after ISR. `router.refresh()` makes a new server request, but it does not invalidate the server-side cache; freshness comes from the `revalidate` interval or explicit invalidation. Confirmed correct: `/` (revalidate=30, refresh every 2min) and `/analytics` (revalidate=60, refresh every 5min) both get fast cached responses within the revalidation window and trigger background regeneration when stale. The 30s in-process DB cache in `facilities-db.ts` further collapses redundant queries.
- [ ] **P3** — Consider `maxDuration` back down from 60 once the above lands (cost guard).

---

## `/map` endpoint work — shell now prerendered; remaining work is map boot polish

Pre-fix live spot check after the `/` and `/analytics` fixes:

| Request | TTFB | Total | Notes |
|---------|------|-------|-------|
| `/map` cold-ish | 8.06s | 8.08s | `x-vercel-cache: MISS`, `private, no-store`, dynamic server render |
| `/map` warm ×2 | 0.34–1.23s | 0.38–1.31s | dynamic before the fixes; warm lambda/cache helped but each visitor could miss |

Before the fixes, local prod build confirmed `/map` was still `ƒ` dynamic, while `/` and `/analytics` were prerendered. After commits `dff1627` and `04eba63`, local prod build confirms `/map` is prerendered as `○ /map` with 30s revalidation. Initial route JS is small-ish because `MapClientLazy` uses `next/dynamic(..., { ssr: false })`: ~160KB raw / 47KB gzip for the route shell. The real map payload is the lazy MapLibre/client chunk: ~1.05MB raw / 280KB gzip, plus map CSS (~86KB raw / 13KB gzip). That is acceptable for a map route, but it makes the loading state important.

### What made `/map` dynamic

- [x] `src/app/map/page.tsx` exported `dynamic = "force-dynamic"` and `revalidate = 0` — fixed in commit `04eba63`.
- [x] The page awaited `searchParams` to read `facility` and `route` — moved client-side in commit `dff1627`.
- [x] The page called `getApproximateLocationOrigin()`, which reads request headers through `headers()` — replaced with `FALLBACK_LOCATION_ORIGIN` plus client-side `/api/location-origin` in commit `04eba63`.

Those three together prevented the same `PRERENDER` behavior working on `/` and `/analytics`. `/map` now uses a shared server shell and lets the client resolve per-visitor state.

### TODO

- [x] **P1** — Make `/map` prerenderable. Remove `force-dynamic`/`revalidate = 0`, set `revalidate = 30`, pass `FALLBACK_LOCATION_ORIGIN` from the server, and mirror `/` by fetching `/api/location-origin` client-side after hydration when no GPS/session origin exists — commit `04eba63`.
- [x] **P1** — Move `facility` and `route` query-param handling into a tiny client wrapper around `MapClientLazy` using `useSearchParams()`. The server page should not await `searchParams`; `/map?facility=...&route=1` can remain a client-side concern because routing/geolocation already happen in the browser — commit `dff1627`.
- [x] **P2** — Replace `<AutoRefresh />` on `/map` with client polling of `/api/facilities` plus `source.setData(...)`. The map is already client-owned; polling the cached JSON API avoids RSC refreshes and keeps MapLibre state completely isolated from server refreshes — commit `4cd88fe`.
- [x] **P2** — Replace the blank `MapClientLazy` loading fallback with a real map shell: sidebar/list skeleton plus a stable canvas loader. This avoids a plain block while the ~280KB gzip MapLibre chunk downloads and initializes — commit `afd01ff`.
- [x] **P2** — Add `preconnect`/`dns-prefetch` for `https://basemaps.cartocdn.com` on `/map`. Preconnect was already in root `layout.tsx` for both `basemaps.cartocdn.com` and `tiles.basemaps.cartocdn.com`; added `dns-prefetch` fallback hints alongside them.
- [ ] **P3** — Cache marker favicon loads in `map-client.tsx` or prebuild marker sprites. `addFacilityMarkerImages()` creates 20 canvas images (5 authorities × 4 severities) and currently calls `loadMarkerIcon()` per marker variant; browser cache helps, but a module-level image promise cache or static marker assets would reduce duplicate decode/canvas work.
- [ ] **P3** — Leave MapLibre bundle size alone unless UX metrics still suffer after the shell/cache work. The big lazy chunk is expected for an interactive vector map; bigger gains come from prerendering the route and improving perceived boot.

---

## Secondary findings

### `/analytics` client bundle

- [x] `import Chart from "chart.js/auto"` pulled every controller/scale/plugin: replaced with selective Chart.js registration for bar, line, scatter, bubble, category/linear scales, tooltip, and legend. Current built Chart-bearing chunk scan: ~202KB raw / 68KB gzip. **P2**
- Charts fully re-instantiate (`destroy()` + `new Chart`) on every AutoRefresh because configs get new identities. With ISR + 5-min refresh this is occasional; leave unless it shows up. **P3**

### `/` client bundle

- Current build manifest shows `/` initial JS ≈ 189KB raw / 55KB gzip. MapLibre correctly stays off `/`; Sentry's big chunk is lazy-loaded. The earlier ~560KB raw estimate appears stale or included lazy chunks.
- [x] **P2** — After re-measuring `/`, lazy-load the facility detail drawer (only shown on tap) via `next/dynamic` if it still moves first-load bytes meaningfully. Drawer code now loads as an async chunk (~3.5KB gzip); first-load savings are modest because shared wave/icon code stays on `/`.
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
| `/map` caching strategy | done | Completed in `dff1627`/`04eba63`; removes cold dynamic map-shell TTFB by prerendering the shared shell |
| `/map` loading shell + client polling | done | Completed in `afd01ff`/`4cd88fe`; improves perceived map boot and avoids RSC refreshes for facility updates |
| Intl hot-loop fix | ~10 lines | −5s server render **and** −5s client hydration; removes the growth-over-time degradation |
| Delete 3 dead queries | deletion | less query/server work; removing `trend` also shrinks payload |
| Env-var `raw_polls` + single `Promise.all` | small | query phase 8.9s → ~3-4s |
| `revalidate = 60` on `/analytics` | small after removing request-time shell path | TTFB ~2.5s/100s+ → ~100-300ms for cached visitors |

Combined, `/analytics` should go from **18–118s to under 1s** for cached hits and ~5s for regenerations, with the regeneration happening in the background where nobody waits on it.

---

## Lighthouse audit (2026-06-13, Lighthouse 11.16, headless Chrome against edwt.ca production)

### Scores

| Route | Device | Perf | A11y | Best Practices | SEO | CLS |
|-------|--------|------|------|----------------|-----|-----|
| `/` | Desktop | 95 | 96 | 96 | 100 | 0 |
| `/` | Mobile | 73 | 95 | 96 | 100 | 0 |
| `/map` | Desktop | 59 | 96 | 96 | 100 | 0 |
| `/map` | Mobile | 59 | 96 | 96 | 100 | 0 |
| `/analytics` | Desktop | 89 | 90 | 96 | 100 | 0 |
| `/analytics` | Mobile | 66 | 90 | 96 | 100 | 0 |

### Key metrics

| Route | Device | FCP | LCP | SI | TTI | TBT |
|-------|--------|-----|-----|----|-----|-----|
| `/` | Desktop | 0.4s | 0.9s | 0.7s | 1.0s | 170ms |
| `/` | Mobile | 1.1s | 3.3s | 2.3s | 3.8s | 760ms |
| `/map` | Desktop | 0.3s | 1.6s | 2.4s | 3.9s | 1,980ms |
| `/map` | Mobile | 0.9s | 2.7s | 7.5s | 16.9s | 12,140ms |
| `/analytics` | Desktop | 0.4s | 0.9s | 0.7s | 1.2s | 260ms |
| `/analytics` | Mobile | — | 2.9s | — | — | 2,460ms |

CLS is 0 across all routes (good).

### Findings

**Performance — `/map` mobile is the worst offender**

`/map` mobile TBT of 12.1s and TTI of 16.9s are catastrophic. Main-thread breakdown: 12.4s "Other" (WebGL context setup, tile parsing, glyph decoding) + 4s Script Evaluation. This is inherent to MapLibre GL on a throttled mobile CPU; the prerendered shell and skeleton already mask perceived load, but the page is unresponsive until MapLibre finishes. Desktop TBT (1,980ms) is bad too — MapLibre init is CPU-bound regardless of network.

Chunk `10353` (279KB total, 158KB / 57% unused on `/map`) is the MapLibre bundle. Chunk `099jjb` (172KB total, ~78KB / 46% unused) is loaded on all three routes — likely Sentry or FontAwesome tree-shaking opportunity. Chunk `0i6xoq9j` (69KB total, nearly 100% unused on `/` and `/map`, 38% on `/analytics`) is loaded but barely used outside analytics.

**Accessibility — color contrast dominates**

212 elements fail contrast on `/` (badges like `<span class="badge emergency">`, `<span class="badge open">`, and `<small>` text), 56 on `/analytics` (`.analytics-kicker` divs and span text), 1 on `/map` (`.status-pill.open`). These are all severity/status badge colors against their backgrounds.

`/analytics` has 4 elements with prohibited ARIA attributes: `aria-label` on non-interactive `div.analytics-bar-track`. These need `role="meter"` or `role="img"` to make the `aria-label` valid.

`/` has 1 label/name mismatch: sort button "Closest first" (`aria-label="Closest first"` doesn't match visible text).

### TODO

#### Performance

- [x] **P2** — Investigate shared chunk `099jjb` (172KB, 46% unused on all routes). Chunk IDs are per-deployment; `099jjb` doesn't exist in local builds. The build manifest confirms Chart.js (`0i6xoq`) is scoped to `/analytics` first-load only. The shared chunk Lighthouse flagged is likely framework/polyfill code loaded via prefetching, not a code-splitting problem.
- [x] **P2** — Investigate chunk `0i6xoq9j` (69KB, ~100% unused on `/` and `/map`). Confirmed as Chart.js. Build manifest shows it only appears in `/analytics` first-load chunks — Lighthouse likely detected it via prefetch or after client navigation. No code-splitting change needed.
- [ ] **P3** — `/map` mobile TBT (12.1s). MapLibre GL initialization is inherently CPU-heavy (WebGL + tile parsing). Possible mitigations: (a) break `addFacilityMarkerImages()` into `requestIdleCallback` chunks so the main thread yields between marker batches; (b) use `maplibre-gl`'s `cooperativeGestures` or deferred layer loading; (c) accept the TBT since the skeleton already provides perceived responsiveness. The MapLibre bundle size itself (279KB, existing P3) is secondary to the init CPU cost.
- [ ] **P3** — `/analytics` mobile TBT (2,460ms). Script Evaluation: 3,518ms is mostly Chart.js canvas rendering. Already partially addressed by selective Chart.js registration. Further mitigation: lazy-render below-fold charts with `IntersectionObserver` so only visible charts block interaction.
- [ ] **P3** — `/` mobile LCP (3.3s), TBT (760ms). Style & Layout: 1,152ms — likely driven by 200+ facility list items rendered at once. Consider virtual scrolling or progressive rendering (render first ~20 items, defer rest). Desktop is fine (LCP 0.9s, TBT 170ms).
- [ ] **P3** — Legacy JS: ~15KB across all routes from Next.js polyfills. Set `browserslist` in `package.json` to modern-only targets if not already done, or configure `next.config` `experimental.modernBuild` if available.
- [ ] **P3** — Unused CSS on `/map`: 12KB (MapLibre GL CSS). Minor; only worth addressing if switching to a custom MapLibre CSS build.

#### Accessibility

- [x] **P2** — Fix color contrast on severity/status badges across all routes. Darkened `--muted` (#757a75→#6b706b on `/`, `/analytics`; #68716c→#5e665f on `/map`, globals), `--coral` (oklch 0.68→0.54 on `/`; #dc6d55→#b5462d on `/analytics` + chart colors), `--green` (oklch 0.55→0.47 on `/`; #16a34a→#15803d on `/analytics`, `/map` CSS + chart colors). All pairs now pass WCAG AA 4.5:1.
- [x] **P2** — Fix prohibited ARIA attributes on `/analytics`. Added `role="meter"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext` to the 4 `.analytics-bar-track` divs.
- [x] **P3** — Fix label/name mismatch on `/` sort button. Removed redundant `aria-label` from sort buttons — the visible text (`shortLabel`) plus `title` (full label) is sufficient. `aria-pressed` already conveys state.

#### Other

- [ ] **P3** — Console error `ERR_ADDRESS_UNREACHABLE` on all routes. Likely Sentry SDK or an external resource that fails in headless/restricted environments. Verify it doesn't occur in real browsers; if it does, fix the failing resource load.
- [ ] **P3** — `llms.txt` format: Lighthouse flags it doesn't follow recommendations. Review against the `llms.txt` spec and update if worthwhile.
