import { db } from "../db/client";
import { locations, waitTimeReadings, rawPolls } from "../db/schema";
import { fetchWaitTimes, waitTimesSchema, type EdwtLocation } from "../lib/edwt";

// ETag tracked per-process so the long-running worker gets cheap 304s.
let lastEtag: string | undefined;

function toLocationRow(item: EdwtLocation) {
  return {
    id: item.id,
    name: item.name ?? "(unknown)",
    slug: item.slug ?? null,
    type: item.type ?? null,
    status: item.status ?? null,
    address: item.address ?? null,
    website: item.website ?? null,
    phone: item.phone ?? null,
    description: item.description ?? null,
    audience: item.audience ?? null,
    latitude: typeof item.latitude === "number" ? item.latitude : null,
    longitude: typeof item.longitude === "number" ? item.longitude : null,
    open247: item.open247 ?? null,
    showWaitTimes: item.showWaitTimes ?? null,
    showStatus: item.showStatus ?? null,
    waitTimeFallback: item.waitTimeFallback ?? null,
    operatingHours: item.operatingHours ?? null,
    alert: {
      alertShow: item.alertShow ?? null,
      alertTitle: item.alertTitle ?? null,
      alertDescription: item.alertDescription ?? null,
    },
    metadata: item as unknown,
    lastSeenAt: new Date(),
  };
}

export interface PollOutcome {
  status: number;
  locations: number;
  newReadings: number;
  durationMs: number;
}

/** One full poll cycle: fetch → archive raw → upsert locations → insert readings. */
export async function runPoll(): Promise<PollOutcome> {
  const { status, etag, body, durationMs } = await fetchWaitTimes(lastEtag);
  if (etag) lastEtag = etag;

  if (status === 304 || !body) {
    console.log(`[poll] ${new Date().toISOString()} 304 unchanged (${durationMs}ms)`);
    return { status, locations: 0, newReadings: 0, durationMs };
  }

  const parsed = waitTimesSchema.safeParse(body);
  if (!parsed.success) {
    // Never block ingestion on validation — the raw payload is still archived.
    console.warn(
      "[poll] schema validation issues (archiving raw anyway):",
      parsed.error.issues.slice(0, 3),
    );
  }
  const items: EdwtLocation[] = parsed.success
    ? parsed.data
    : (body.filter((x): x is EdwtLocation => !!x && typeof (x as { id?: unknown }).id === "string"));

  let upserts = 0;
  let newReadings = 0;

  await db.transaction(async (tx) => {
    await tx.insert(rawPolls).values({
      httpStatus: status,
      etag: etag ?? null,
      locationCount: items.length,
      durationMs,
      payload: body,
    });

    for (const item of items) {
      const row = toLocationRow(item);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...mutable } = row;
      await tx
        .insert(locations)
        .values(row)
        .onConflictDoUpdate({ target: locations.id, set: mutable });
      upserts++;

      const wt = item.waitTime;
      if (wt && wt.reportId) {
        const inserted = await tx
          .insert(waitTimeReadings)
          .values({
            locationId: item.id,
            reportId: wt.reportId,
            readingId: wt.id ?? null,
            readingCreatedAt: wt.createdAt ? new Date(wt.createdAt) : null,
            waitTimeMinutes:
              typeof wt.waitTimeMinutes === "number" ? wt.waitTimeMinutes : null,
            elosMinutes:
              typeof wt.elosMinutes === "number" ? wt.elosMinutes : null,
            status: wt.status ?? null,
            hasWaitTime: true,
          })
          .onConflictDoNothing({
            target: [waitTimeReadings.locationId, waitTimeReadings.reportId],
          })
          .returning({ id: waitTimeReadings.id });
        if (inserted.length) newReadings++;
      }
    }
  });

  console.log(
    `[poll] ${new Date().toISOString()} status=${status} locations=${upserts} newReadings=${newReadings} raw=1 (${durationMs}ms)`,
  );
  return { status, locations: upserts, newReadings, durationMs };
}
