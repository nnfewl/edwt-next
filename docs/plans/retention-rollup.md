# Retention + hourly rollup (Supabase)

**Status:** drafted, not yet applied. Apply when the DB approaches the storage cap
(currently ~22 MB; free-tier 500 MB cap is ~2 months out at ~7.2 MB/day).

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
