import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://edwt:edwt@localhost:5433/edwt";

// Small pool — the ingester is the only consumer for now.
export const client = postgres(DATABASE_URL, { max: 5 });
export const db = drizzle(client, { schema });
