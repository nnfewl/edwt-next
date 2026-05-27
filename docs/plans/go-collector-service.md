# Plan: Go worker (raw archiver to R2 + redundant writer + observability + status page)

> Status: **DRAFT — not yet approved.** Saved for review before implementation.

## Context

Ingestion now runs on **Supabase** (Edge Function + `pg_cron`, every 60s) as the **sole
DB writer** for `locations` and `wait_time_readings`. To keep under the free-tier storage
cap, **`raw_polls` was intentionally dropped from Supabase** — there is no raw archive in
the cloud DB.

This plan adds a **Go worker** that runs **elsewhere** (a separate always-on host, not on
Supabase, not the laptop) with two jobs, both always on:

1. **Raw archiver.** Fetch the upstream feed and write the full raw payload of every poll to
   **Cloudflare R2** (object storage). This *replaces* the old `raw_polls` Postgres table —
   it's the durable raw history Supabase no longer keeps.
2. **Second DB writer.** Upsert `locations` + `wait_time_readings` into Supabase alongside
   the Edge Function, making it a genuine **second writer** for resilience if the cron
   stalls. (An `EDWT_WRITE_DB=false` escape hatch exists for archive-only debugging, but the
   worker writes to Supabase by default — this is the "two writers" design.)

Decisions:
- **Language:** Go (single static binary, stdlib HTTP, mature observability).
- **R2 SDK:** R2 is S3-compatible → use **`aws-sdk-go-v2`** (the `s3` client) against the R2
  endpoint. No custom client. See [R2 archive](#raw-archive-cloudflare-r2).
- **Schema stays owned by Drizzle.** The Go worker never runs migrations and never recreates
  `raw_polls` anywhere.
- **Two writers is safe** — see [Coordination](#coordinating-two-writers). The old "don't run
  two pollers" warning no longer applies because nothing shares a `raw_polls` table.
- **Internal observability:** Prometheus + Grafana.
- **Public status page:** Atlassian Statuspage free tier ($0, 25 components, REST API),
  driven from the worker. SaaS, decoupled from our infra, not in docker-compose.

New code lives in a Go module under `service/`.

## Architecture

```
                 edwaittimes.ca/api/wait-times
                          │
          ┌───────────────┴────────────────────┐
   (cloud, primary writer)                (elsewhere, this plan)
          ▼                                      ▼
  Supabase Edge Function            service/  (Go, binary `edwtd`)
  pg_cron every 60s                  ├─ internal/poller    fetch + lenient decode
  → locations, wait_time_readings    ├─ internal/archive   gzip payload → PUT to R2
          │                          ├─ internal/store     pgx v5 → Supabase, idempotent
          │                          │                      upserts (second writer)
          │                          ├─ internal/api       net/http query API (reads Supabase)
          │                          ├─ internal/obs       Prometheus /metrics, /healthz, /readyz
          │                          └─ internal/statuspage reconciler → Atlassian Statuspage
          ▼                                  │              │
  Supabase Postgres  ◄─────────────redundant upserts───────┘
  (locations, wait_time_readings)            ▼
                                     Cloudflare R2 bucket
                                     raw/YYYY/MM/DD/HH/...json.gz   (durable raw archive)
```

Single process: poller goroutine (→ archive + DB) + Statuspage reconciler goroutine
+ HTTP server, graceful shutdown (SIGINT/SIGTERM). Statuspage and DB-write are no-ops when
their env vars are unset, so the worker runs as a pure R2 archiver out of the box.

## Coordinating two writers

The worry was "two writers corrupting each other." They don't, because every write is
idempotent on a natural key:

- **`wait_time_readings`** — `ON CONFLICT (location_id, report_id) DO NOTHING`. Whichever
  writer sees a report first inserts it; the other no-ops. No duplicates, no locking.
- **`locations`** — `ON CONFLICT (id) DO UPDATE` (upsert). Last writer wins on mutable
  metadata; both converge to the same upstream values.
- **R2 raw objects** — keyed by content, not by writer: `…/<payload-sha256[:12]>.json.gz`
  (plus a time prefix for browsability). Two archivers writing the same poll produce the
  **same key** → the second PUT just overwrites identical bytes. Optionally send
  `If-None-Match: *` (R2 supports conditional PUT) to skip the redundant write entirely.

So no leader election / distributed lock is needed. The two writers are independent and
eventually consistent on the same rows/objects.

## Raw archive (Cloudflare R2)

R2 speaks the S3 API, so the data plane is `aws-sdk-go-v2`:

```go
cfg, _ := config.LoadDefaultConfig(ctx,
    config.WithRegion("auto"),
    config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
        accessKeyID, secretAccessKey, "")),
    // R2 caveat: only send checksums when the operation requires them
    config.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired),
)
client := s3.NewFromConfig(cfg, func(o *s3.Options) {
    o.BaseEndpoint = aws.String("https://" + accountID + ".r2.cloudflarestorage.com")
})
// PutObject: key = raw/2026/05/27/15/<unix_ms>-<sha256[:12]>.json.gz, gzip body,
// ContentType application/json, ContentEncoding gzip.
```

- **Bucket layout:** `raw/YYYY/MM/DD/HH/<unix_ms>-<hash>.json.gz`. Hour prefix keeps listings
  cheap; the hash makes keys content-addressed and idempotent.
- **Compression:** gzip the JSON before PUT (~12 KB raw → a few KB). Set `Content-Encoding`.
- **Retention:** object storage is cheap and egress-free on R2 — keep raw **indefinitely**,
  or add an R2 **lifecycle rule** to expire `raw/` after N days if desired.
- **Management API** (create bucket, mint token) is a one-time manual step in the Cloudflare
  dashboard or via `cloudflare-go`; not part of the worker.

## Components & files

**Module / entrypoint**
- `service/go.mod` — module `github.com/nnfewl/edwt-next/service`, Go 1.26 toolchain.
- `service/cmd/edwtd/main.go` — load config, build R2 client + pgx pool, start
  poller + reconciler + HTTP server, graceful shutdown.
- `service/internal/config/config.go` — env parsing (reuses `EDWT_SOURCE_URL`,
  `POLL_INTERVAL_MS`, `DATABASE_URL`; adds the R2 + toggle vars below).

**Poller** (`service/internal/poller/poller.go`)
- Ticker loop. On each tick: fetch the feed (lenient JSON decode, unknown fields preserved in
  the archived bytes), then hand the raw payload to `archive` **and** upsert `locations` +
  insert `wait_time_readings` into Supabase (same idempotent SQL as `src/ingest/poll.ts`).
  Both happen every poll; `EDWT_WRITE_DB=false` skips the DB write for archive-only debugging.
  Records metrics; updates `lastSuccessfulPoll` / `lastSuccessfulArchive`.
- Stateless re: ETag (matches the cloud Edge Function); simplest and archive keys dedup anyway.

**Archive** (`service/internal/archive/r2.go`) — the `aws-sdk-go-v2` S3 client above; gzip +
content-hash key + optional `If-None-Match: *`.

**Store** (`service/internal/store/`) — `pgxpool` to **Supabase** (direct/session conn,
IPv6-only — see [[env-gotchas]]); hand-written SQL: upsert location, insert reading (the
second-writer path), plus the read queries below for the query API.

**Query API** (`service/internal/api/`) — stdlib `http.ServeMux`, reads Supabase:
- `GET /api/wait-times` — latest reading per facility (mirrors upstream shape).
- `GET /api/locations` — facility metadata list.
- `GET /api/locations/{slug}/history?from=&to=` — per-facility time-series.
- `GET /api/stats` — counts, last poll time, data span.

**Observability** (`service/internal/obs/`) — prometheus/client_golang + `log/slog`:
- `GET /metrics` — `edwt_poll_total{result}`, `edwt_poll_duration_seconds`,
  `edwt_source_http_status`, `edwt_archive_total{result}`, `edwt_archive_bytes_total`,
  `edwt_last_successful_archive_timestamp_seconds`,
  `edwt_last_successful_poll_timestamp_seconds`, `edwt_rows_inserted_total{table}`, `edwt_up`.
- `GET /healthz` — liveness. `GET /readyz` — DB ping OK **and** last successful **archive**
  younger than `EDWT_READY_MAX_STALENESS`, else 503.
- `GET /api/status` — computed component-status JSON.

**Statuspage integration** (`service/internal/statuspage/`)
- Reconciler every `STATUSPAGE_RECONCILE_INTERVAL`: `PATCH …/components/{id}` with
  `{"component":{"status": "operational"|"degraded_performance"|"partial_outage"|"major_outage"}}`,
  header `Authorization: OAuth <api_key>`. Component → signal:
  - **Upstream edwaittimes API** — last fetch succeeded.
  - **Raw archive (R2)** — last successful R2 PUT fresh; stale → degraded/major.
  - **Database (Supabase)** — pgx ping OK + second-writer upserts succeeding.
  - **Query API** — service serving requests.
- No-op (logged once) when Statuspage env vars are absent.

**Containerisation & ops**
- `service/Dockerfile` — multi-stage (`golang:1.26-alpine` build → minimal static runtime).
- For **local** dev, optional docker-compose additions: `collector` (build `service/`),
  `prometheus` (scrape `collector:8080`, port 9090), `grafana` (port 3001, provisioned
  datasource + starter dashboard). In production the worker is deployed to its own host.
- `ops/prometheus.yml`, `ops/grafana/provisioning/...`, `ops/grafana/dashboards/edwt.json`.

**Config additions** (`.env` / `.env.prod` + `.env.example`)
- `EDWT_HTTP_ADDR=:8080`
- `EDWT_READY_MAX_STALENESS=3m`
- `EDWT_WRITE_DB=true` — second-writer DB path; set `false` only for archive-only debugging.
- **R2:** `R2_ACCOUNT_ID=` `R2_ACCESS_KEY_ID=` `R2_SECRET_ACCESS_KEY=` `R2_BUCKET=`
- `STATUSPAGE_API_KEY=` `STATUSPAGE_PAGE_ID=` `STATUSPAGE_RECONCILE_INTERVAL=30s`
- `STATUSPAGE_COMPONENT_UPSTREAM=` `_ARCHIVE=` `_DB=` `_API=` (component IDs)
- Secrets stay in gitignored env files; placeholders go in `.env.example`.

**Docs** — once built, add the Go worker to `README.md` as a third deployment piece
(raw archiver running elsewhere), with build/run, the R2 setup steps, the
Prometheus/Grafana stack, and Atlassian Statuspage setup.

## Verification

- `cd service && go vet ./... && go build ./...`.
- Unit test `internal/poller`/`archive` against an `httptest` server returning
  `sample-wait-times.json`: assert one R2 PUT per poll with the expected content-hash key,
  and that a second identical poll produces the **same key** (idempotent). Assert a second
  identical poll inserts **0** new readings (dedup parity with the TS/Edge ingest).
- Run against R2 (test bucket) + Supabase: `curl :8080/healthz` → 200; `curl :8080/readyz` →
  200 after first archive + DB ping; objects appear under `raw/…` in the bucket;
  `:8080/metrics` includes `edwt_last_successful_archive_timestamp_seconds`.
- Against Supabase alongside the live Edge Function: row counts grow then dedup across polls
  — confirms safe **two-writer** operation (idempotent upserts, no duplicates).
- Prometheus target `up`; Grafana dashboard shows poll/archive metrics.
- Statuspage (once env set): components flip to **operational**; blocking R2 drives the
  **Raw archive** component to **major_outage** within one reconcile interval.

## Out of scope (later)

- Frontend (Phase 3) consuming `GET /api/wait-times` from this worker or directly from Supabase.
- Analytics views / heat maps (powered by the Supabase hourly rollup — see
  [retention-rollup.md](retention-rollup.md)).
- Durable hosting choice for the worker (user will host elsewhere; Dockerfile makes it portable).
- A reprocessing job that replays R2 raw objects back into Postgres if ever needed.

## Open items to confirm before approval

- R2 bucket name + whether to add a lifecycle expiry on `raw/` or keep raw forever.
- Atlassian Statuspage account + page/component IDs + API key.
- Confirm local port choices (collector 8080, Prometheus 9090, Grafana 3001) don't clash.
