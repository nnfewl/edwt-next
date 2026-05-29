# edwt-next

A rebuild of the BC emergency-department wait-times site
([edwaittimes.ca](https://www.edwaittimes.ca/)), built **data-first**: before any
UI, it stands up an ingestion pipeline that captures wait-time history into Postgres
for later analytics (heat maps, trends, time-series).

> Status: **Ingestion in production; frontend built.** The pipeline runs on Supabase,
> and the Next.js app — public facilities list, map, and analytics dashboard — reads
> live readings from it.

## Where it runs

The same ingestion logic runs in any of these — pick per need, all are supported:

| Mode | Where ingest runs | Database | Use for |
|------|-------------------|----------|---------|
| **Local** | Node poller (`src/ingest/worker.ts`) on your machine | Postgres 17 in Docker | dev, debugging, full raw archive, offline work |
| **Cloud** | Supabase Edge Function, triggered by `pg_cron` every 60s | Supabase managed Postgres | always-on production collection |
| **Worker** | Go worker (`service/`) on an always-on host | Supabase (second writer) + Cloudflare R2 (raw) | durable raw archive + write-path redundancy |

Cloud is the live source of truth; local stays fully functional for development and
as a self-contained fallback. The Go **worker** runs elsewhere as a *second writer*
alongside the Edge Function and is the only piece that archives the raw payload (to
R2). The shared poll logic lives in [`src/ingest/poll.ts`](src/ingest/poll.ts), the
Deno port in [`supabase/functions/ingest/index.ts`](supabase/functions/ingest/index.ts),
and the Go port in [`service/`](service/).

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
        ┌──────────────┴────────────────┐
   LOCAL│                               │CLOUD
        ▼                               ▼
 src/ingest/worker.ts            pg_cron (every 60s)
 interval loop (+ --once)        → pg_net → Edge Function
        │                               │
        ▼                               ▼
 src/ingest/poll.ts            supabase/functions/ingest/index.ts
 conditional GET (ETag)         stateless fetch (no ETag)
        │                               │
        └───────────────┬───────────────┘
                        │
                        ▼
        archive raw* → upsert locations → insert readings (dedup)
                        │
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

## Frontend

The Next.js App Router app reads the latest reading per facility (plus a short wait
history) straight from Postgres and renders three routes behind a shared top nav:

| Route | Page | Notes |
|-------|------|-------|
| `/` | Public facilities list | Mobile-first: severity-coloured live waits, distance sort + type filters, a recommended pick, and a details drawer. Location via IP approximation with an opt-in GPS override. |
| `/map` | Facility map | MapLibre GL basemap with wait markers/clusters and a bottom-sheet panel on mobile. |
| `/admin` | Analytics dashboard | Nivo charts over the reading history (trends, heat maps). |

The data-access layer [`src/app/facilities-db.ts`](src/app/facilities-db.ts) projects
`locations` + `wait_time_readings` (plus a windowed wait history) into the `Facility`
shape the components consume; [`src/app/data.ts`](src/app/data.ts) defines that shape
and a mock list for offline/dev. Pages are `force-dynamic` and re-read on an interval
([`auto-refresh.tsx`](src/app/auto-refresh.tsx)), fanned through a 30 s in-process
cache so multiple open tabs collapse to a single query.

```bash
pnpm dev                      # local DB via .env
pnpm dev:prod                 # against the cloud DB via .env.prod
```

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

## Collector worker (Go, `service/`)

A standalone Go binary (`edwtd`) that runs on an always-on host (a VPS, etc.),
separate from Supabase. It does two things every poll: archive the raw payload to
**Cloudflare R2** (gzipped, content-addressed — this is the raw history the cloud DB
no longer keeps), and upsert `locations` + `wait_time_readings` into Supabase as a
**second writer**. Writes are idempotent (`ON CONFLICT`), so it runs concurrently
with the Edge Function without duplicating rows. It exposes Prometheus `/metrics`,
`/healthz`, `/readyz`, and `/api/status`. Full design:
[`docs/plans/go-collector-service.md`](docs/plans/go-collector-service.md).

```bash
cd service
make build           # → bin/edwtd (stripped, ~24 MB static binary)
make test            # vet + unit tests; `make help` lists all targets
```

**Run it under systemd** (recommended; templates in [`service/deploy/`](service/deploy/)):

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin edwtd
sudo install -m 0755 bin/edwtd /usr/local/bin/edwtd
sudo install -d -m 0750 /etc/edwtd
sudo install -m 0600 deploy/edwtd.env.example /etc/edwtd/edwtd.env   # then edit secrets
sudo install -m 0644 deploy/edwtd.service /etc/systemd/system/edwtd.service
sudo systemctl daemon-reload
sudo systemctl enable --now edwtd            # start now + on boot
journalctl -u edwtd -f                        # logs (slog JSON)
```

`Restart=always` survives crashes, `enable` survives reboots, and `edwtd` handles
`SIGTERM` so `systemctl restart` is graceful. Run a **single** instance. CI builds
and tests the worker on every push touching `service/**`.

For a repeatable VPS deploy, an **Ansible** playbook in
[`service/deploy/ansible/`](service/deploy/ansible/) builds the binary locally and
provisions the user, env, unit, and service in one command (re-running it is the
update path).

### Worker configuration (`/etc/edwtd/edwtd.env`)

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | — | Supabase **direct** connection (`:5432`). Required when `EDWT_WRITE_DB=true`. |
| `EDWT_WRITE_DB` | `true` | Second-writer DB path; `false` = archive-only (debugging). |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | — | Cloudflare R2; archiving is disabled if unset. |
| `EDWT_HTTP_ADDR` | `:8080` | Metrics / health listen address. |
| `EDWT_READY_MAX_STALENESS` | `3m` | `/readyz` fails if the last archive is older than this. |
| `EDWT_SOURCE_URL` / `POLL_INTERVAL_MS` | feed / `60000` | Shared with the other modes. |

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
| `make -C service build` / `test` / `ci` | Build / test the Go collector worker. |

## Roadmap

- **Done:** data-access layer over Postgres (latest reading per facility + history);
  facilities list, MapLibre map, and analytics dashboard.
- **Next:** hourly rollup + retention to keep the cloud DB under its storage cap as
  readings grow ([`docs/plans/retention-rollup.md`](docs/plans/retention-rollup.md));
  deeper analytics (heat maps / longer-range trends) backed by that rollup.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · MapLibre GL · Nivo
charts · Font Awesome · Vercel Analytics · Drizzle ORM · PostgreSQL · postgres.js ·
zod · pnpm · Supabase (Edge Functions + pg_cron) · Go worker (pgx · aws-sdk-go-v2 →
Cloudflare R2 · Prometheus).

`sample-wait-times.json` is a captured 41-facility snapshot, kept as a fixture and
shape reference.
