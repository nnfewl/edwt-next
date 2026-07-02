import { type HistoryPoint } from "@/app/data";

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Parse the jsonb wait-history aggregate from SQL into chart-ready points. */
export function parseWaitHistory(value: unknown): HistoryPoint[] {
  const raw = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(raw)) return [];

  const points: HistoryPoint[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const minutes = Number(record.wait_time_minutes);
    const observedRaw = record.observed_at;
    const observedAt =
      observedRaw instanceof Date
        ? observedRaw
        : typeof observedRaw === "string"
          ? new Date(observedRaw)
          : null;

    if (!Number.isFinite(minutes) || !observedAt || Number.isNaN(observedAt.getTime())) continue;
    points.push({ observedAt: observedAt.toISOString(), min: Math.max(0, Math.round(minutes)) });
  }

  return points.slice(-12);
}
