import {
  pgTable,
  text,
  doublePrecision,
  boolean,
  integer,
  bigint,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Facility metadata (the "dimension" table). One row per facility, upserted on
 * every poll so it always reflects the current published metadata. Slowly
 * changing — most polls leave it untouched aside from `lastSeenAt`.
 */
export const locations = pgTable("locations", {
  id: text("id").primaryKey(), // their cuid
  name: text("name").notNull(),
  slug: text("slug"),
  type: text("type"), // "ed" | "upcc"
  status: text("status"), // "published"
  address: text("address"),
  website: text("website"),
  phone: text("phone"),
  description: text("description"),
  audience: text("audience"), // "allAges" | "seventeenPlus" | "sixteenAndUnder"
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  open247: boolean("open247"),
  showWaitTimes: boolean("show_wait_times"),
  showStatus: boolean("show_status"),
  waitTimeFallback: text("wait_time_fallback"), // "open-status" | "contact"
  operatingHours: jsonb("operating_hours"),
  alert: jsonb("alert"), // { alertShow, alertTitle, alertDescription }
  metadata: jsonb("metadata"), // full raw item — catch-all for anything else
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Wait-time readings (the "fact" table — the analytics workhorse). One row per
 * distinct report per facility. The unique (location_id, report_id) lets us
 * poll aggressively without storing duplicate rows: re-seeing the same report
 * is a no-op via ON CONFLICT DO NOTHING.
 */
export const waitTimeReadings = pgTable(
  "wait_time_readings",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(), // when WE polled
    reportId: text("report_id"), // their waitTime.reportId
    readingId: text("reading_id"), // their waitTime.id
    readingCreatedAt: timestamp("reading_created_at", { withTimezone: true }), // their waitTime.createdAt
    waitTimeMinutes: integer("wait_time_minutes"),
    elosMinutes: integer("elos_minutes"),
    status: text("status"), // "normal" | ... (server-side enum)
    hasWaitTime: boolean("has_wait_time").notNull().default(false),
  },
  (t) => [
    index("idx_readings_location_observed").on(t.locationId, t.observedAt),
    index("idx_readings_observed").on(t.observedAt),
    uniqueIndex("uq_readings_location_report").on(t.locationId, t.reportId),
  ],
);

/**
 * Complete raw archive — one row per successful poll. Insurance against schema
 * drift and the source of truth for reprocessing (e.g. open/closed history of
 * facilities that report no wait time). jsonb is TOAST-compressed by Postgres.
 */
export const rawPolls = pgTable("raw_polls", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  httpStatus: integer("http_status").notNull(),
  etag: text("etag"),
  locationCount: integer("location_count"),
  durationMs: integer("duration_ms"),
  payload: jsonb("payload").notNull(),
});
