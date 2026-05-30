import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://edwt:edwt@localhost:5433/edwt";

// Pool tuned for serverless behind Supabase's transaction pooler (port 6543).
//   - prepare: false — REQUIRED on the transaction pooler (Supavisor/pgbouncer
//     in transaction mode): it doesn't keep server-side prepared statements
//     across pooled backends, so postgres.js's default named prepared
//     statements stall/collide under the analytics page's ~19 concurrent
//     queries. This is the root cause of "works locally, hangs on Vercel".
//   - connect_timeout — fail fast instead of blocking forever on connect.
//   - statement_timeout — no single query can run past this; it errors and the
//     page renders its error state rather than loading forever.
export const client = postgres(DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  connection: { statement_timeout: 25_000 },
});
export const db = drizzle(client, { schema });
