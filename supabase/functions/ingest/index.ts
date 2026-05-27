// supabase/functions/ingest/index.ts
//
// Deno Edge Function — performs ONE ingestion poll. Triggered every 60s by
// Supabase Cron (pg_cron -> pg_net -> this function). It is the cloud port of
// src/ingest/poll.ts, with two deliberate differences:
//   1. No raw_polls — the raw payload is not archived in the cloud DB.
//   2. No ETag/304 optimization — the function is stateless (cold each run) and
//      the feed changes ~every minute anyway, so it always does a full GET.
//
// Writes: UPSERT `locations`, and INSERT new `wait_time_readings` deduped on
// (location_id, report_id) via upsert + ignoreDuplicates (== ON CONFLICT DO NOTHING).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@4";

const SOURCE_URL = Deno.env.get("EDWT_SOURCE_URL") ??
  "https://www.edwaittimes.ca/api/wait-times";

// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected into every Edge
// Function. Service role bypasses RLS so the function can write.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Lenient schema — mirrors src/lib/edwt.ts. Everything past `id` is optional so
// upstream tweaks never break ingestion.
const waitTimeSchema = z
  .object({
    id: z.string().optional(),
    createdAt: z.string().optional(),
    reportId: z.string().optional(),
    waitTimeMinutes: z.number().int().nullable().optional(),
    elosMinutes: z.number().int().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const locationSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  audience: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  open247: z.boolean().optional(),
  showWaitTimes: z.boolean().optional(),
  showStatus: z.boolean().optional(),
  waitTimeFallback: z.string().optional(),
  alertShow: z.boolean().optional(),
  alertTitle: z.string().optional(),
  alertDescription: z.string().optional(),
  operatingHours: z.unknown().optional(),
  waitTime: waitTimeSchema,
});
const waitTimesSchema = z.array(locationSchema);

type EdwtLocation = z.infer<typeof locationSchema>;

Deno.serve(async () => {
  const startedAt = Date.now();
  try {
    // 1. fetch the feed (full GET — stateless function, no ETag carry-over)
    const res = await fetch(SOURCE_URL, { headers: { accept: "application/json" } });
    if (!res.ok) return json({ ok: false, error: `source HTTP ${res.status}` }, 502);

    const body = await res.json();
    const rawItems: unknown[] = Array.isArray(body) ? body : [];

    // 2. validate leniently; never block ingestion on schema drift
    const parsed = waitTimesSchema.safeParse(rawItems);
    const items: EdwtLocation[] = parsed.success
      ? parsed.data
      : (rawItems.filter(
        (x): x is { id: string } =>
          !!x && typeof (x as { id?: unknown }).id === "string",
      ) as unknown as EdwtLocation[]);

    const now = new Date().toISOString();

    // Keep the *raw* item per id so `metadata` is a true snapshot (now that
    // raw_polls is not in the cloud, this is the only place the full item lives).
    const rawById = new Map<string, unknown>(
      rawItems
        .filter((x): x is { id: string } =>
          !!x && typeof (x as { id?: unknown }).id === "string"
        )
        .map((x) => [(x as { id: string }).id, x]),
    );

    // 3. UPSERT all locations in one request. first_seen_at is omitted so its
    //    default fills on insert and is preserved on conflict; last_seen_at is
    //    always refreshed.
    const locationRows = items.map((it) => ({
      id: it.id,
      name: it.name ?? "(unknown)",
      slug: it.slug ?? null,
      type: it.type ?? null,
      status: it.status ?? null,
      address: it.address ?? null,
      website: it.website ?? null,
      phone: it.phone ?? null,
      description: it.description ?? null,
      audience: it.audience ?? null,
      latitude: typeof it.latitude === "number" ? it.latitude : null,
      longitude: typeof it.longitude === "number" ? it.longitude : null,
      open247: it.open247 ?? null,
      show_wait_times: it.showWaitTimes ?? null,
      show_status: it.showStatus ?? null,
      wait_time_fallback: it.waitTimeFallback ?? null,
      operating_hours: it.operatingHours ?? null,
      alert: {
        alertShow: it.alertShow ?? null,
        alertTitle: it.alertTitle ?? null,
        alertDescription: it.alertDescription ?? null,
      },
      metadata: rawById.get(it.id) ?? it,
      last_seen_at: now,
    }));

    const { error: locErr } = await supabase
      .from("locations")
      .upsert(locationRows, { onConflict: "id" });
    if (locErr) throw new Error(`locations upsert: ${locErr.message}`);

    // 4. INSERT new readings; dedup on (location_id, report_id). With
    //    ignoreDuplicates, .select() returns only the rows actually inserted,
    //    which gives us an accurate "new readings" count.
    const readingRows = items
      .filter((it) => it.waitTime?.reportId)
      .map((it) => ({
        location_id: it.id,
        report_id: it.waitTime!.reportId,
        reading_id: it.waitTime!.id ?? null,
        reading_created_at: it.waitTime!.createdAt ?? null,
        wait_time_minutes: typeof it.waitTime!.waitTimeMinutes === "number"
          ? it.waitTime!.waitTimeMinutes
          : null,
        elos_minutes: typeof it.waitTime!.elosMinutes === "number"
          ? it.waitTime!.elosMinutes
          : null,
        status: it.waitTime!.status ?? null,
        has_wait_time: true,
      }));

    let newReadings = 0;
    if (readingRows.length) {
      const { data, error: rErr } = await supabase
        .from("wait_time_readings")
        .upsert(readingRows, {
          onConflict: "location_id,report_id",
          ignoreDuplicates: true, // == ON CONFLICT DO NOTHING
        })
        .select("id");
      if (rErr) throw new Error(`readings upsert: ${rErr.message}`);
      newReadings = data?.length ?? 0;
    }

    const summary = {
      ok: true,
      locations: locationRows.length,
      candidateReadings: readingRows.length,
      newReadings,
      ms: Date.now() - startedAt,
    };
    console.log("[ingest]", JSON.stringify(summary));
    return json(summary);
  } catch (err) {
    console.error("[ingest] error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
