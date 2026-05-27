# edwt-next

A rebuild of the BC emergency-department wait-times site
([edwaittimes.ca](https://www.edwaittimes.ca/)), built **data-first**: before any
UI, it stands up an ingestion pipeline that captures wait-time history into Postgres
for later analytics (heat maps, trends, time-series).

> Status: **Phase 1 — ingestion pipeline.** Running in production on Supabase; the
> Next.js frontend is scaffolded but not built yet.

## Two ways to run

The same ingestion logic runs in either environment — pick per need, both are supported:

| Mode | Where ingest runs | Database | Use for |
|------|-------------------|----------|---------|
| **Local** | Node poller (`src/ingest/worker.ts`) on your machine | Postgres 17 in Docker | dev, debugging, full raw archive, offline work |
| **Cloud** | Supabase Edge Function, triggered by `pg_cron` every 60s | Supabase managed Postgres | always-on production collection |

Cloud is the live source of truth; local stays fully functional for development and
as a self-contained fallback. The shared poll logic lives in
[`src/ingest/poll.ts`](src/ingest/poll.ts) and the Deno port in
[`supabase/functions/ingest/index.ts`](supabase/functions/ingest/index.ts).

## How it works

The public site exposes one public, unauthenticated, CORS-open endpoint:

```
GET https://www.edwaittimes.ca/api/wait-times  →  Location[]   (~41 facilities)
```

Each facility carries a `waitTime` object (`waitTimeMinutes`, `elosMinutes`,
`status`, `reportId`, `createdAt`). Reports refresh roughly every minute. A poller
fetches this on an interval and persists it (dedup on `(location_id, report_id)`, so
polling aggressively never stores duplicates):

```
            edwaittimes.ca/api/wait-times
                       │
        ┌──────────────┴───────────────┐
   LOCAL│                               │CLOUD
        ▼                               ▼
 src/ingest/worker.ts            pg_cron (every 60s)
 interval loop (+ --once)          → pg_net → Edge Function
        │                               │
        ▼                               ▼
 src/ingest/poll.ts            supabase/functions/ingest/index.ts
 conditional GET (ETag)         stateless fetch (no ETag)
        │                               │
        └───────────────┬───────────────┘
                        ▼
        archive raw* → upsert locations → insert readings (dedup)
                        ▼
              PostgreSQL (Drizzle)
        *raw_polls: local only — see Data model
```

## Data model

| Table | Purpose | Cloud |
|-------|---------|-------|
| `locations` | Facility metadata (name, type, address, lat/long, hours…), upserted each poll. | ✅ |
| `wait_time_readings` | Fact table — one row per distinct report per facility. Unique `(location_id, report_id)` dedups. | ✅ |
| `raw_polls` | Full JSON payload of every poll (TOAST-compressed, ~12 KB each) — insurance against schema drift and the source for reprocessing. | ❌ local only |

Schema lives in [`src/db/schema.ts`](src/db/schema.ts). `raw_polls` is intentionally
**not** kept on Supabase (storage cap); the cloud Edge Function skips it. Because of
this, run `drizzle-kit migrate` (not `push`) against Supabase — `push` would try to
recreate `raw_polls`.

## Quick start (local)

Requires Node 20+, pnpm, and Docker.

```bash
pnpm install
cp .env.example .env          # defaults work for local dev

pnpm db:up                    # Postgres 17 in Docker on host port 5433
pnpm db:migrate               # apply schema

pnpm ingest:once              # single poll (sanity check)
pnpm ingest                   # long-running poller (every POLL_INTERVAL_MS)
```

For continuous local collection, run `pnpm ingest` under a process manager, or
schedule `pnpm ingest:once` every minute via system cron.

## Cloud deployment (Supabase)

Ingestion runs entirely inside Supabase — no always-on host needed:

- **Database** — Supabase managed Postgres is the production source of truth and the
  sole writer. Connection string lives in gitignored `.env.prod` (note: the DB name
  there is `postgres`, not `edwt`).
- **Ingest** — Deno Edge Function [`supabase/functions/ingest/index.ts`](supabase/functions/ingest/index.ts),
  a port of `poll.ts` using `supabase-js` with batched upserts. Stateless, so it
  drops the ETag optimization and does not write `raw_polls`.
- **Schedule** — `pg_cron` job `ingest-every-minute` fires every 60s and calls the
  function via `pg_net` (`net.http_post`). The function is JWT-protected; the cron
  call authenticates with the anon key in the `Authorization` header.

```bash
# one-time: apply schema to the cloud DB (direct 5432 URL; migrate, not push)
DATABASE_URL="$(grep ^DATABASE_URL= .env.prod | cut -d= -f2-)" pnpm db:migrate

# deploy / update the ingest function
npx supabase functions deploy ingest
```

> Connect to the cloud DB from the **host** with `/usr/bin/psql` — the Supabase
> direct connection is IPv6-only and the Docker network can't route it.

**Retention/rollup** (keeping the cloud DB under the storage cap as readings grow)
is drafted in [`docs/plans/retention-rollup.md`](docs/plans/retention-rollup.md) —
not yet applied.

## Configuration

### Local (`.env`)

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | `postgres://edwt:edwt@localhost:5433/edwt` | Port 5433 avoids a common 5432 clash. |
| `EDWT_SOURCE_URL` | `https://www.edwaittimes.ca/api/wait-times` | Upstream feed. |
| `POLL_INTERVAL_MS` | `60000` | Source refreshes ~every minute; 60s captures essentially every report. |

### Cloud (`.env.prod`, gitignored)

Same vars, but `DATABASE_URL` points at the Supabase direct connection. The Edge
Function reads its Supabase URL + service-role key from auto-injected env at runtime.

## Scripts

| Script | Action |
|--------|--------|
| `pnpm db:up` / `db:down` | Start / stop the local Postgres container. |
| `pnpm db:generate` | Generate a Drizzle migration from the schema. |
| `pnpm db:migrate` | Apply migrations (works against local or, with `.env.prod`'s `DATABASE_URL`, cloud). |
| `pnpm db:studio` | Open Drizzle Studio. |
| `pnpm ingest` | Run the long-running local poller. |
| `pnpm ingest:once` | Single poll then exit (good for cron). |
| `npx supabase functions deploy ingest` | Deploy/update the cloud Edge Function. |

## Roadmap

- **Phase 2:** point a `getWaitTimes()` data-access layer at Postgres (latest reading
  per facility), served on Vercel via the Supabase transaction pooler.
- **Phase 3:** UI — map + Mapbox geocoding + distance sort + facility cards; then
  analytics views (heat maps / trend charts) backed by the hourly rollup.

## Tech

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Drizzle ORM · PostgreSQL ·
postgres.js · zod · pnpm · Supabase (Edge Functions + pg_cron).

`sample-wait-times.json` is a captured 41-facility snapshot, kept as a fixture and
shape reference.
