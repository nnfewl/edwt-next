/* eslint-disable @typescript-eslint/no-require-imports */
const postgres = require("postgres");

const sql = postgres(process.env.DATABASE_URL || "postgres://edwt:edwt@localhost:5433/edwt", {
  max: 1,
});

async function main() {
  const out = {};

  out.tables = await sql`
    select 'locations' as table_name, count(*)::int as rows from locations
    union all
    select 'raw_polls' as table_name, count(*)::int as rows from raw_polls
    union all
    select 'wait_time_readings' as table_name, count(*)::int as rows from wait_time_readings
    order by table_name
  `;

  out.observed_range = await sql`
    select
      min(observed_at) as first_observed,
      max(observed_at) as last_observed,
      min(reading_created_at) as first_source_reading,
      max(reading_created_at) as last_source_reading
    from wait_time_readings
  `;

  out.location_types = await sql`
    select coalesce(type, 'unknown') as type, count(*)::int as locations
    from locations
    group by 1
    order by locations desc, type
  `;

  out.reading_quality = await sql`
    select
      count(*)::int as readings,
      count(*) filter (where wait_time_minutes is not null)::int as with_wait_minutes,
      count(*) filter (where elos_minutes is not null)::int as with_elos_minutes,
      count(*) filter (where reading_created_at is not null)::int as with_source_timestamp,
      count(distinct location_id)::int as locations_with_readings
    from wait_time_readings
  `;

  out.top_locations_by_readings = await sql`
    select
      l.name,
      l.type,
      count(w.id)::int as readings,
      min(w.observed_at) as first_observed,
      max(w.observed_at) as last_observed,
      round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
      percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
      max(w.wait_time_minutes)::int as max_wait
    from locations l
    left join wait_time_readings w on w.location_id = l.id
    group by l.id, l.name, l.type
    order by readings desc, l.name
    limit 20
  `;

  out.highest_average_waits = await sql`
    select
      l.name,
      l.type,
      count(w.id)::int as readings,
      round(avg(w.wait_time_minutes)::numeric, 1)::float as avg_wait,
      percentile_cont(0.5) within group (order by w.wait_time_minutes)::float as median_wait,
      max(w.wait_time_minutes)::int as max_wait
    from locations l
    join wait_time_readings w on w.location_id = l.id
    where w.wait_time_minutes is not null
    group by l.id, l.name, l.type
    having count(w.id) >= 3
    order by avg(w.wait_time_minutes) desc
    limit 15
  `;

  out.hourly_pattern = await sql`
    select
      extract(hour from observed_at)::int as observed_hour,
      count(*)::int as readings,
      round(avg(wait_time_minutes)::numeric, 1)::float as avg_wait,
      percentile_cont(0.5) within group (order by wait_time_minutes)::float as median_wait
    from wait_time_readings
    where wait_time_minutes is not null
    group by 1
    order by 1
  `;

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
