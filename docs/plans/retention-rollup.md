# Retention + hourly rollup (Supabase)

**Status:** reviewed & ready to apply — see runbook below. As of 2026-07-02 prod is at
**295 MB / 500 MB** (618k readings spanning 37 days, growing ~7.2 MB/day → cap hit in
~4 weeks). Code side is done and committed (`773f934`): `waitTimeHourly` schema,
migration `drizzle/0001_stormy_shaman.sql`, and `USE_HOURLY_ROLLUP=1`-gated heatmap +
coverage queries in `src/app/analytics/page.tsx`.

## Apply runbook (verified against prod 2026-07-02)

Pre-verified facts: Drizzle journal exists on prod with `0000` recorded (so `db:migrate`
applies only `0001`); `idx_readings_observed` exists (prune uses an index scan); only
cron job is `ingest-every-minute` (no name collisions); every analytics query that
aggregates history already uses a ≤30-day window, so the prune breaks nothing.

**Decision: no p50 columns.** Each hourly bucket holds only ~12 readings, so avg ≈ median
within an hour, and percentiles don't compose across buckets anyway. Queries needing
true percentiles run on the 30-day raw window, which survives the prune.

1. **Migrate** (creates `wait_time_hourly`, additive only):
   ```bash
   node scripts/with-env.cjs .env.prod pnpm db:migrate
   ```
2. **Backfill** — run the section-2 UPSERT *without* the `where observed_at >= ...`
   line (Supabase SQL editor or psql against `.env.prod`). Expect ~37k rollup rows.
3. **Schedule `rollup-hourly`** (section 4, first statement). While in there, also
   re-schedule `ingest-every-minute` with its existing command plus
   `timeout_milliseconds := 10000` in the `net.http_post` call (copy the current
   command from `cron.job`; the 5000 ms default trips when the Edge Function runs long).
4. **Verify** at the next `:05` that `wait_time_hourly` row count grows (section
   "Verify" queries).
5. **Schedule `prune-readings-daily`** (section 4, second statement). First run deletes
   ~7 days ≈ 130k rows — fine in one statement at this size.
6. **Flip the read path:** set `USE_HOURLY_ROLLUP=1` in Vercel env + redeploy.

**Known cosmetic effects after the first prune** (informational tiles only, nothing
breaks): `observedRange`'s "data since" becomes a rolling 30-day date; `quality`'s
total-readings counts become 30-day counts; a facility silent >30 days shows up under
`noReadings` as if it never reported.

## Why

`wait_time_readings` grows ~17,600 rows/day (~7.2 MB/day incl. indexes). Unbounded,
it fills the Supabase free tier (500 MB) in ~67 days. The fix is two `pg_cron` jobs
that run **inside the DB** (pure SQL — no Edge Function / `pg_net` involved):

1. **Hourly rollup** → aggregate raw readings into a tiny per-location/per-hour table
   that is **kept forever** and powers long-term trend charts.
2. **Daily prune** → delete raw readings older than the retention window once they're
   safely rolled up.

This holds the DB at a **flat ~235 MB steady state** (30 days of raw readings + the
forever-growing-but-tiny rollup + ~12 MB Postgres/extension baseline).

> Note: there is **no `raw_polls` table on Supabase** — it was intentionally excluded
> from the migration. Retention only touches `wait_time_readings`. (The local Docker DB
> and `src/db/schema.ts` still define `raw_polls`; that's unrelated to this doc.)

## 1. Rollup table

41 locations × 24 h = ~984 rows/day → ~359k rows/yr → roughly **30–50 MB/yr**, kept
indefinitely. Aggregates are computed only over readings where `has_wait_time = true`
(i.e. a facility actually reported a number); `reported_count` vs `sample_count` lets
the read layer show coverage / how often a facility was closed.

```sql
create table if not exists public.wait_time_hourly (
  location_id      text        not null references public.locations(id),
  bucket           timestamptz not null,          -- date_trunc('hour', observed_at), UTC
  sample_count     integer     not null,          -- all readings in the hour
  reported_count   integer     not null,          -- readings with has_wait_time = true
  avg_wait_minutes double precision,
  min_wait_minutes integer,
  max_wait_minutes integer,
  avg_elos_minutes double precision,
  min_elos_minutes integer,
  max_elos_minutes integer,
  primary key (location_id, bucket)
);
create index if not exists idx_hourly_bucket on public.wait_time_hourly (bucket);
```

Equivalent Drizzle definition for `src/db/schema.ts` (add when wiring the read path):

```ts
export const waitTimeHourly = pgTable(
  "wait_time_hourly",
  {
    locationId: text("location_id").notNull().references(() => locations.id),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    sampleCount: integer("sample_count").notNull(),
    reportedCount: integer("reported_count").notNull(),
    avgWaitMinutes: doublePrecision("avg_wait_minutes"),
    minWaitMinutes: integer("min_wait_minutes"),
    maxWaitMinutes: integer("max_wait_minutes"),
    avgElosMinutes: doublePrecision("avg_elos_minutes"),
    minElosMinutes: integer("min_elos_minutes"),
    maxElosMinutes: integer("max_elos_minutes"),
  },
  (t) => [
    primaryKey({ columns: [t.locationId, t.bucket] }),
    index("idx_hourly_bucket").on(t.bucket),
  ],
);
```

## 2. Rollup UPSERT (the body of the hourly cron)

Recomputes the **last 3 hours** each run, so late/edge-of-hour rows and the
just-closed hour all converge. Idempotent via `ON CONFLICT ... DO UPDATE`.

```sql
insert into public.wait_time_hourly as h (
  location_id, bucket, sample_count, reported_count,
  avg_wait_minutes, min_wait_minutes, max_wait_minutes,
  avg_elos_minutes, min_elos_minutes, max_elos_minutes
)
select
  location_id,
  date_trunc('hour', observed_at)                                as bucket,
  count(*)                                                       as sample_count,
  count(*) filter (where has_wait_time)                          as reported_count,
  avg(wait_time_minutes) filter (where has_wait_time)            as avg_wait_minutes,
  min(wait_time_minutes) filter (where has_wait_time)            as min_wait_minutes,
  max(wait_time_minutes) filter (where has_wait_time)            as max_wait_minutes,
  avg(elos_minutes)      filter (where has_wait_time)            as avg_elos_minutes,
  min(elos_minutes)      filter (where has_wait_time)            as min_elos_minutes,
  max(elos_minutes)      filter (where has_wait_time)            as max_elos_minutes
from public.wait_time_readings
where observed_at >= date_trunc('hour', now()) - interval '3 hours'
group by location_id, date_trunc('hour', observed_at)
on conflict (location_id, bucket) do update set
  sample_count     = excluded.sample_count,
  reported_count   = excluded.reported_count,
  avg_wait_minutes = excluded.avg_wait_minutes,
  min_wait_minutes = excluded.min_wait_minutes,
  max_wait_minutes = excluded.max_wait_minutes,
  avg_elos_minutes = excluded.avg_elos_minutes,
  min_elos_minutes = excluded.min_elos_minutes,
  max_elos_minutes = excluded.max_elos_minutes;
```

## 3. Prune (the body of the daily cron)

Keeps 30 days of raw readings. Everything older was rolled up many times over
(rollup runs hourly), so this is safe. Tune `30 days` up/down by watching
`pg_database_size('postgres')` against the cap.

```sql
delete from public.wait_time_readings
where observed_at < now() - interval '30 days';
```

## 4. Schedule the jobs

`cron.schedule(jobname, ...)` upserts by name, so re-running is safe.

```sql
-- hourly rollup at :05 (data for the prior hour is fully landed)
select cron.schedule(
  'rollup-hourly',
  '5 * * * *',
  $$ <paste the UPSERT from section 2> $$
);

-- daily prune at 03:15 UTC
select cron.schedule(
  'prune-readings-daily',
  '15 3 * * *',
  $$ delete from public.wait_time_readings where observed_at < now() - interval '30 days'; $$
);
```

## 5. One-time backfill (run once, right after creating the table)

Before scheduling — populate the rollup from **all** existing readings (no 3-hour
window). Same statement as section 2 but drop the `where observed_at >= ...` clause.

## Apply order

1. Create `wait_time_hourly` (section 1).
2. Run the full backfill (section 5).
3. Schedule `rollup-hourly` (section 4) — verify a row count in `wait_time_hourly`
   grows on the next `:05`.
4. Only then schedule `prune-readings-daily`.

## Verify

```sql
-- rollup is populating
select count(*), min(bucket), max(bucket) from public.wait_time_hourly;
-- jobs are registered + firing
select jobname, schedule, active from cron.job where jobname in ('rollup-hourly','prune-readings-daily');
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 5;
-- size stays flat after first prune
select pg_size_pretty(pg_database_size('postgres'));
```

## Read path (later, on Vercel)

- **Live / recent** (last ~24–48 h): query `wait_time_readings` directly
  (`idx_readings_location_observed`).
- **Long-term trends:** query `wait_time_hourly` — survives the prune, indexed on `bucket`.

## Related operational note

The ingest cron's `net.http_post` uses pg_net's **5000 ms** default timeout and trips a
few times an hour when the Edge Function runs long (benign — ingestion is idempotent).
When touching cron config, also bump that call's `timeout_milliseconds` to ~10000.
