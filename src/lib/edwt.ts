import { z } from "zod";

export const SOURCE_URL =
  process.env.EDWT_SOURCE_URL ?? "https://www.edwaittimes.ca/api/wait-times";

/**
 * Lenient schemas. Every field beyond `id` is optional/nullable so the
 * ingester never throws on the source tweaking its payload — and unknown keys
 * are preserved in `raw_polls` regardless. zod strips unknown keys by default
 * (it does not error), which is exactly what we want for typed columns.
 */
export const waitTimeSchema = z.object({
  id: z.string().optional(),
  locationId: z.string().optional(),
  createdAt: z.string().optional(),
  reportId: z.string().optional(),
  waitTimeMinutes: z.number().int().nullable().optional(),
  elosMinutes: z.number().int().nullable().optional(),
  status: z.string().nullable().optional(),
});

export const locationSchema = z.object({
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
  // waitTime is a full object, an empty {}, or null/absent.
  waitTime: waitTimeSchema.nullable().optional(),
});

export const waitTimesSchema = z.array(locationSchema);

export type EdwtLocation = z.infer<typeof locationSchema>;

export interface FetchResult {
  status: number;
  etag: string | null;
  body: unknown[] | null; // null on 304
  durationMs: number;
}

/** Conditional GET against the source. On 304 returns `body: null`. */
export async function fetchWaitTimes(etag?: string): Promise<FetchResult> {
  const start = Date.now();
  const res = await fetch(SOURCE_URL, {
    headers: etag ? { "If-None-Match": etag } : {},
    cache: "no-store",
  });
  const durationMs = Date.now() - start;
  const newEtag = res.headers.get("etag");

  if (res.status === 304) {
    return { status: 304, etag: newEtag ?? etag ?? null, body: null, durationMs };
  }
  if (!res.ok) {
    throw new Error(`source returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as unknown;
  return {
    status: res.status,
    etag: newEtag,
    body: Array.isArray(body) ? body : [],
    durationMs,
  };
}
