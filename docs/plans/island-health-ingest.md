# Island Health Wait Times — Ingestion Expansion

## Context

edwt-next currently covers only Lower Mainland BC (Fraser Health, VCH, Providence, BC Children's, BC Women's) via the `edwaittimes.ca` JSON API. Island Health (Vancouver Island) is not in that feed. Island Health publishes live ED and urgent care wait times at `islandhealth.ca/find-care` — a Drupal 10 CMS page with server-side-rendered HTML that updates every 5 minutes. There is no JSON API; data must be extracted via HTML scraping.

**Scope:** Data ingestion only. UI (map bounds expansion, health authority badge, etc.) deferred.

**Data discovered:**
- 16 facilities with stable Drupal taxonomy term IDs (`ih-348` … `ih-377`)
- 8 have live wait time numbers; remainder show "Closed" or "OPEN"
- HTML structure: `.emergency-departments.token[about="/taxonomy/term/NNN"]` divs
- Wait time text lives in `.wait-time .inner` as `<strong>N</strong>&nbsp;hours&nbsp;M&nbsp;minutes` (or "Closed" / "OPEN")
- No `reportId` from source — synthesized as ISO-timestamp floored to 5-min bucket

---

## Step 0 — Dev branch

```bash
git checkout -b feat/island-health-ingest
```

---

## Shared: Location Seed Data

Both implementations need the same 16-location seed (hardcoded, keyed by `ih-NNN`). Define this as a constant in each implementation. For Option B it's a TypeScript const; for Option C it's a Go map literal in `internal/scraper/seed.go`.

```
id        name (normalized)                              type   lat         lng          address
ih-348    Cormorant Island Emergency Department          ed     50.5838    -126.9186    Cormorant Island Rd, Alert Bay, BC
ih-349    Cowichan District Hospital ED                  ed     48.7807    -123.7096    3045 Gibbins Rd, Duncan, BC
ih-350    Lady Minto / Gulf Island Hospital ED           ed     48.8628    -123.5068    135 Crofton Rd, Ganges, BC
ih-351    Nanaimo Regional General Hospital ED           ed     49.1657    -123.9425    1200 Dufferin Cres, Nanaimo, BC
ih-352    North Island Hospital – Campbell River ED      ed     50.0148    -125.2476    375 2nd Ave, Campbell River, BC
ih-353    North Island Hospital – Comox Valley ED        ed     49.6880    -124.9936    101 Lerwick Rd, Courtenay, BC
ih-354    Port Hardy Hospital ED                         ed     50.6934    -127.5005    9120 Granville St, Port Hardy, BC
ih-355    Port McNeill Hospital ED                       ed     50.5857    -127.0935    2750 Kingcome Pl, Port McNeill, BC
ih-356    Royal Jubilee Hospital ED                      ed     48.4302    -123.3520    1952 Bay St, Victoria, BC
ih-357    Saanich Peninsula Hospital ED                  ed     48.6158    -123.3993    2166 Mt Newton Cross Rd, Saanichton, BC
ih-358    Tofino General Hospital                        ed     49.1504    -125.9068    261 Neill St, Tofino, BC
ih-359    Victoria General Hospital ED                   ed     48.4425    -123.3900    1 Hospital Way, Victoria, BC
ih-360    West Coast General Hospital ED                 ed     49.2397    -124.7980    3949 Port Alberni Hwy, Port Alberni, BC
ih-370    Oceanside Urgent Care Centre                   upcc   49.3135    -124.3140    101 Morison Ave, Parksville, BC
ih-376    Chemainus Urgent Care Centre                   upcc   48.9258    -123.7100    9909 Esplanade St, Chemainus, BC
ih-377    Ladysmith Urgent Care Centre                   upcc   48.9986    -123.8190    1111 4th Ave, Ladysmith, BC
```

---

## Shared: HTML Parsing Logic

The Drupal page structure is stable. Parsing steps (identical logic in both implementations):

**1. Extract facility blocks**
Match each `<div about="/taxonomy/term/(\d+)"[^>]*class="emergency-departments token">` and capture everything up to `</div></div></div>`.

**2. From each block, extract:**
- `id` → `ih-{termId}` (from `about` attribute)
- `name` → inner text of `h2.token-name a` (strip HTML entities)
- `city` → inner text of `.field--name-field-city-and-province .field--item`
- `waitRaw` → inner content of `.wait-time .inner` (may contain `<strong>` tags)

**3. Parse wait text → minutes + status**
```
strip HTML tags + &nbsp; → plain text → lowercase → trim
"closed"         → { minutes: null, status: "closed" }
"open"           → { minutes: null, status: "open" }
"N hours M min"  → { minutes: N*60+M, status: "normal" }
"N hours"        → { minutes: N*60, status: "normal" }
"M minutes"      → { minutes: M, status: "normal" }
```

**4. Synthesize reportId**
```
floor(epochMs / 300_000) * 300  →  "ih-{seconds}"
```
This gives one dedup bucket per 5-min interval. ON CONFLICT DO NOTHING handles any polls within the same window.

---

## Option B — Supabase Edge Function

### New file: `supabase/functions/ingest-island-health/index.ts`

Mirror `supabase/functions/ingest/index.ts` exactly, replacing the JSON fetch+parse with HTML scrape+parse.

**Structure:**
```typescript
const SOURCE_URL = Deno.env.get("IH_SOURCE_URL") ?? "https://www.islandhealth.ca/find-care";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ...);

// Location seed map: Record<string, { name, type, lat, lng, address }>
const IH_LOCATIONS: Record<string, IHLocationMeta> = { /* 16 entries above */ };

Deno.serve(async () => {
  // 1. Fetch HTML
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "edwt-ingest/1.0" } });

  // 2. Parse facilities from HTML (regex-based — Deno has no DOM parser)
  const facilities = parseIslandHealth(await res.text());
  // → Array<{ id: "ih-NNN", waitMinutes: number|null, status: string }>

  // 3. Build location rows (merge scraped id/name with seed metadata)
  const locationRows = facilities.map(f => ({
    id: f.id,
    name: IH_LOCATIONS[f.id]?.name ?? f.rawName,
    type: IH_LOCATIONS[f.id]?.type ?? null,
    latitude: IH_LOCATIONS[f.id]?.lat ?? null,
    longitude: IH_LOCATIONS[f.id]?.lng ?? null,
    address: IH_LOCATIONS[f.id]?.address ?? null,
    status: "published",
    last_seen_at: now,
    metadata: { source: "islandhealth", rawName: f.rawName, city: f.city },
  }));

  // 4. UPSERT locations (same pattern as ingest/index.ts)
  await supabase.from("locations").upsert(locationRows, { onConflict: "id" });

  // 5. Build reading rows — reportId = synthesized 5-min bucket
  const reportId = `ih-${Math.floor(Date.now() / 300_000) * 300}`;
  const readingRows = facilities
    .filter(f => f.status !== "closed")
    .map(f => ({
      location_id: f.id,
      report_id: reportId,
      wait_time_minutes: f.waitMinutes,
      status: f.status,
      has_wait_time: f.waitMinutes !== null,
    }));

  // 6. INSERT with ignoreDuplicates (ON CONFLICT DO NOTHING)
  await supabase.from("wait_time_readings")
    .upsert(readingRows, { onConflict: "location_id,report_id", ignoreDuplicates: true })
    .select("id");
});
```

**`parseIslandHealth(html: string)`** — pure function, no deps:
```typescript
function parseIslandHealth(html: string): IHFacility[] {
  const blockRe = /about="\/taxonomy\/term\/(\d+)"[^>]*class="emergency-departments token"([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  const results: IHFacility[] = [];
  for (const m of html.matchAll(blockRe)) {
    const id = `ih-${m[1]}`;
    const block = m[2];
    const rawName = block.match(/class="token-name"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim() ?? id;
    const city = block.match(/field--name-field-city-and-province[\s\S]*?field--item">([^<]+)<\/div>/)?.[1]?.trim() ?? "";
    const innerRaw = block.match(/class="inner">([\s\S]*?)<\/div>/)?.[1] ?? "";
    results.push({ id, rawName, city, ...parseWaitText(innerRaw) });
  }
  return results;
}
```

**Scheduling (Supabase dashboard SQL):**
```sql
-- Run in Supabase SQL editor once
select cron.schedule(
  'islandhealth-ingest',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://<project-ref>.supabase.co/functions/v1/ingest-island-health',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon-key>"}'::jsonb,
      timeout_milliseconds := 10000
    )
  $$
);
```

**Deploy:**
```bash
supabase functions deploy ingest-island-health
```

---

## Option C — Go Worker Extension

### New package: `service/internal/scraper/`

**`service/internal/scraper/island_health.go`**
```go
package scraper

import (
    "context"
    "fmt"
    "net/http"
    "regexp"
    "strconv"
    "strings"
    "golang.org/x/net/html"
)

type IHFacility struct {
    ID          string
    RawName     string
    City        string
    WaitMinutes *int   // nil = no data (Closed or OPEN)
    Status      string // "normal" | "closed" | "open"
}

func FetchIH(ctx context.Context, client *http.Client, sourceURL string) ([]IHFacility, error) {
    req, _ := http.NewRequestWithContext(ctx, "GET", sourceURL, nil)
    req.Header.Set("User-Agent", "edwt-ingest/1.0")
    resp, err := client.Do(req)
    if err != nil { return nil, err }
    defer resp.Body.Close()
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("island health HTTP %d", resp.StatusCode)
    }
    return parseIH(resp.Body)
}
```

Parse using `golang.org/x/net/html` (walk the DOM tree; find divs with `class="emergency-departments token"` and `about` attr; descend to extract name, city, wait time text). This is ~80 lines of standard Go node-walking code.

**`service/internal/scraper/parse.go`** — `parseWaitText(s string) (minutes *int, status string)`:
```go
// Strip tags, decode entities, normalize whitespace, then:
// "closed" → nil, "closed"
// "open"   → nil, "open"
// regex `(\d+)\s*hour` + `(\d+)\s*min` → sum, "normal"
```

**`service/internal/scraper/seed.go`** — const map of the 16 locations:
```go
type IHLocationMeta struct {
    Name    string
    Type    string  // "ed" | "upcc"
    Lat     float64
    Lng     float64
    Address string
}

var IHSeed = map[string]IHLocationMeta{
    "ih-348": {"Cormorant Island Emergency Department", "ed", 50.5838, -126.9186, "Cormorant Island Rd, Alert Bay, BC"},
    "ih-349": {"Cowichan District Hospital ED", "ed", 48.7807, -123.7096, "3045 Gibbins Rd, Duncan, BC"},
    "ih-350": {"Lady Minto / Gulf Island Hospital ED", "ed", 48.8628, -123.5068, "135 Crofton Rd, Ganges, BC"},
    "ih-351": {"Nanaimo Regional General Hospital ED", "ed", 49.1657, -123.9425, "1200 Dufferin Cres, Nanaimo, BC"},
    "ih-352": {"North Island Hospital – Campbell River ED", "ed", 50.0148, -125.2476, "375 2nd Ave, Campbell River, BC"},
    "ih-353": {"North Island Hospital – Comox Valley ED", "ed", 49.6880, -124.9936, "101 Lerwick Rd, Courtenay, BC"},
    "ih-354": {"Port Hardy Hospital ED", "ed", 50.6934, -127.5005, "9120 Granville St, Port Hardy, BC"},
    "ih-355": {"Port McNeill Hospital ED", "ed", 50.5857, -127.0935, "2750 Kingcome Pl, Port McNeill, BC"},
    "ih-356": {"Royal Jubilee Hospital ED", "ed", 48.4302, -123.3520, "1952 Bay St, Victoria, BC"},
    "ih-357": {"Saanich Peninsula Hospital ED", "ed", 48.6158, -123.3993, "2166 Mt Newton Cross Rd, Saanichton, BC"},
    "ih-358": {"Tofino General Hospital", "ed", 49.1504, -125.9068, "261 Neill St, Tofino, BC"},
    "ih-359": {"Victoria General Hospital ED", "ed", 48.4425, -123.3900, "1 Hospital Way, Victoria, BC"},
    "ih-360": {"West Coast General Hospital ED", "ed", 49.2397, -124.7980, "3949 Port Alberni Hwy, Port Alberni, BC"},
    "ih-370": {"Oceanside Urgent Care Centre", "upcc", 49.3135, -124.3140, "101 Morison Ave, Parksville, BC"},
    "ih-376": {"Chemainus Urgent Care Centre", "upcc", 48.9258, -123.7100, "9909 Esplanade St, Chemainus, BC"},
    "ih-377": {"Ladysmith Urgent Care Centre", "upcc", 48.9986, -123.8190, "1111 4th Ave, Ladysmith, BC"},
}
```

### Store changes: `service/internal/store/store.go`

Add `WriteIH(ctx, []scraper.IHFacility, reportID string) (WriteResult, error)`:
```go
func (s *Store) WriteIH(ctx context.Context, facilities []scraper.IHFacility, reportID string) (WriteResult, error) {
    // batch upsert locations — map IHFacility + IHSeed → same 20-column locUpsertSQL
    // batch insert readings — filter non-closed, use reportID, ON CONFLICT DO NOTHING
    // return WriteResult{Locations, NewReadings}
}
```

Reuses `locUpsertSQL` and `readingInsertSQL` unchanged. The only difference is building the args from `IHFacility + IHSeed` instead of `edwt.Location`.

### New poller: `service/internal/poller/island_health.go`

```go
package poller

type IHPoller struct {
    sourceURL string
    client    *http.Client
    db        *store.Store
    logger    *slog.Logger
    interval  time.Duration
}

func (p *IHPoller) RunOnce(ctx context.Context) error {
    facilities, err := scraper.FetchIH(ctx, p.client, p.sourceURL)
    // synthesize reportID: floor(now / 5min) → "ih-{seconds}"
    reportID := fmt.Sprintf("ih-%d", (time.Now().Unix()/300)*300)
    result, err := p.db.WriteIH(ctx, facilities, reportID)
    p.logger.Info("island-health poll", "locations", result.Locations, "new_readings", result.NewReadings)
    return err
}

func (p *IHPoller) Run(ctx context.Context) {
    // same ticker pattern as poller.go Run()
}
```

### `service/cmd/edwtd/main.go` changes

Add env vars and wire up `IHPoller`:
```go
// New env vars:
// EDWT_IH_ENABLED=true          (default false)
// EDWT_IH_URL=https://...       (default islandhealth.ca/find-care)
// EDWT_IH_INTERVAL=5m           (default 5m)

if cfg.IHEnabled {
    ihPoller := poller.NewIHPoller(cfg.IHSourceURL, httpClient, store, logger, cfg.IHInterval)
    g.Go(func() error { ihPoller.Run(ctx); return nil })
}
```

### `service/config/config.go` changes

Add `IHEnabled bool`, `IHSourceURL string`, `IHInterval time.Duration` fields.

### New dependency

```bash
go get golang.org/x/net/html
```

`golang.org/x/net` is the standard Go extended stdlib; verify it's not already an indirect dep with `go mod tidy`.

---

## Verification

**Edge Function (Option B):**
1. `supabase functions serve ingest-island-health` locally
2. `curl -X POST http://localhost:54321/functions/v1/ingest-island-health` → expect `{"ok":true,"locations":16,...}`
3. Query DB: `SELECT id, name FROM locations WHERE id LIKE 'ih-%' LIMIT 5`
4. Query readings: `SELECT location_id, wait_time_minutes, report_id FROM wait_time_readings WHERE location_id LIKE 'ih-%' ORDER BY observed_at DESC LIMIT 10`
5. Call twice within 5-min window → `newReadings: 0` on second call (dedup working)

**Go Worker (Option C):**
1. `make -C service test` (new unit tests for `scraper.parseIH` and `scraper.parseWaitText`)
2. `EDWT_IH_ENABLED=true EDWT_IH_URL=https://www.islandhealth.ca/find-care make -C service run`
3. Check logs for `island-health poll locations=16 new_readings=N`
4. Same DB queries as above
5. `make -C service build` + `make -C service deploy-pi` to ship to Pi

**Both:**
- Confirm `first_seen_at` only set once per location (not overwritten on re-upsert)
- Confirm wait_time_minutes correctly converts: "5 hours 30 minutes" → 330
- Confirm "Closed" facilities get null wait_time_minutes + status="closed"
