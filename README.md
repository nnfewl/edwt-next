# edwt-next

A rebuild of the BC emergency-department wait-times site
([edwaittimes.ca](https://www.edwaittimes.ca/)), built **data-first**: before any
UI, it stands up an ingestion pipeline that captures wait-time history into Postgres
for later analytics (heat maps, trends, time-series).

> Status: **Phase 1 — ingestion pipeline.** The Next.js app is scaffolded but the
> frontend is not built yet.

## How it works

The public site exposes one public, unauthenticated, CORS-open endpoint:

```
GET https://www.edwaittimes.ca/api/wait-times  →  Location[]   (~41 facilities)
```

Each facility carries a `waitTime` object (`waitTimeMinutes`, `elosMinutes`,
`status`, `reportId`, `createdAt`). Reports refresh roughly every minute. A poller
fetches this on an interval and persists it:

```
edwaittimes.ca/api/wait-times
        │  conditional GET (ETag) every POLL_INTERVAL_MS
        ▼
  src/lib/edwt.ts        fetch + zod validation
        ▼
  src/ingest/poll.ts     archive raw → upsert locations → insert readings (dedup)
        ▼
  PostgreSQL (Drizzle)   locations · wait_time_readings · raw_polls
        ▲
  src/ingest/worker.ts   interval loop (+ --once mode)
```

## Data model

| Table | Purpose |
|-------|---------|
| `locations` | Facility metadata (name, type, address, lat/long, hours…), upserted each poll. |
| `wait_time_readings` | Fact table — one row per distinct report per facility. Unique `(location_id, report_id)` dedups, so polling aggressively never stores duplicates. |
| `raw_polls` | Full JSON payload of every poll (TOAST-compressed, ~12 KB each) — insurance against schema drift and the source for reprocessing. |

Schema lives in [`src/db/schema.ts`](src/db/schema.ts).

## Quick start

Requires Node 20+, pnpm, and Docker.

```bash
pnpm install
cp .env.example .env          # defaults work for local dev

pnpm db:up                    # Postgres 17 in Docker on host port 5433
pnpm db:migrate               # apply schema

pnpm ingest:once              # single poll (sanity check)
pnpm ingest                   # long-running poller (every POLL_INTERVAL_MS)
```

## Configuration (`.env`)

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgres://edwt:edwt@localhost:5433/edwt` | Port 5433 avoids a common 5432 clash. |
| `EDWT_SOURCE_URL` | `https://www.edwaittimes.ca/api/wait-times` | Upstream feed. |
| `POLL_INTERVAL_MS` | `60000` | Source refreshes ~every minute; 60s captures essentially every report. |

## Scripts

| Script | Action |
|--------|--------|
| `pnpm db:up` / `db:down` | Start / stop the Postgres container. |
| `pnpm db:generate` | Generate a Drizzle migration from the schema. |
| `pnpm db:migrate` | Apply migrations. |
| `pnpm db:studio` | Open Drizzle Studio. |
| `pnpm ingest` | Run the long-running poller. |
| `pnpm ingest:once` | Single poll then exit (good for cron). |

For continuous collection, run `pnpm ingest` under a process manager, or schedule
`pnpm ingest:once` every minute via cron.

## Roadmap

- **Phase 2:** point a `getWaitTimes()` data-access layer at Postgres (latest reading
  per facility).
- **Phase 3:** UI — map + Mapbox geocoding + distance sort + facility cards; then
  analytics views (heat maps / trend charts), optionally via TimescaleDB rollups.

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Drizzle ORM · PostgreSQL ·
postgres.js · zod · pnpm.

`sample-wait-times.json` is a captured 41-facility snapshot, kept as a fixture and
shape reference.
