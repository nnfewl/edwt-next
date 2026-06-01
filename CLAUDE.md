# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (local DB)
pnpm dev

# Dev server (cloud Supabase DB)
pnpm dev:prod

# Build & lint
pnpm build
pnpm lint

# Database (local Docker Postgres on port 5433)
pnpm db:up            # start container
pnpm db:down          # stop container
pnpm db:generate      # generate Drizzle migration from schema changes
pnpm db:migrate       # apply migrations

# Ingestion
pnpm ingest           # long-running poller
pnpm ingest:once      # single poll then exit

# Go worker (service/)
make -C service build # → service/bin/edwtd
make -C service test  # vet + unit tests
```

## Architecture

This is **edwt-next** — a rebuild of edwaittimes.ca that shows live BC emergency-department wait times. It has three layers:

### 1. Data ingestion (three modes, same logic)

All modes poll `edwaittimes.ca/api/wait-times` and upsert into the same Postgres schema (dedup on `location_id + report_id`):

- **Local Node poller** — `src/ingest/worker.ts` → `src/ingest/poll.ts` (uses ETag, writes `raw_polls`)
- **Supabase Edge Function** — `supabase/functions/ingest/index.ts` (Deno port, no ETag, no `raw_polls`, triggered by `pg_cron` every 60s)
- **Go worker** — `service/` (`edwtd` binary, archives raw to R2 + second-writes to Supabase)

### 2. Database (Drizzle + postgres.js)

- Schema: `src/db/schema.ts` — three tables: `locations`, `wait_time_readings`, `raw_polls`
- Client: `src/db/client.ts` — shared pool with `prepare: false` (required for Supabase transaction pooler)
- Migrations: `drizzle/` directory. Use `pnpm db:migrate` (not `push`) against Supabase since `raw_polls` is local-only.

### 3. Next.js frontend (App Router, React 19, Tailwind 4)

- `/` — facilities list with severity colors, distance sort, type filters, detail drawer. Client component: `page-client.tsx`.
- `/map` — MapLibre GL map with wait markers and bottom-sheet. Client component: `map-client.tsx`.
- `/admin` — analytics dashboard with chart.js charts. Client component: `analytics-charts.tsx`.

**Data flow**: `src/app/facilities-db.ts` runs a raw SQL query joining `locations` + `wait_time_readings` (+ 12h hourly history), projects into the `Facility` type from `src/app/data.ts`, and caches for 30s in-process. Pages are `force-dynamic` with auto-refresh on the client (`auto-refresh.tsx`).

**Shared types/utils**: `src/lib/edwt.ts` has zod schemas for the upstream API and the `fetchWaitTimes()` helper (used by the local poller).

### Key patterns

- Location/distance: `location-origin.ts` resolves the user's position (IP-based with GPS opt-in), `geo-distance.ts` computes haversine distances, `location-session.ts` caches the choice in sessionStorage.
- Operating hours: `facilities-db.ts` contains timezone-aware open/close logic for `America/Vancouver`.
- The `public/llms.txt` and `public/llms-full.txt` are GEO (Generative Engine Optimization) files served with markdown headers.

## Environment

Local: copy `.env.example` → `.env` (defaults work with Docker). Cloud: `.env.prod` (gitignored) points `DATABASE_URL` at Supabase direct connection.

## Go worker (`service/`)

Standard Go project layout: `cmd/edwtd/main.go` entry, domain packages under `internal/` (poller, archive, store, config, obs, notify). Build with `make build`, test with `make test`. Configuration via env vars in `/etc/edwtd/edwtd.env` — see README for full table.
