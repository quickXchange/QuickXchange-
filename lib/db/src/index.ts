import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const useDatabaseOwner =
  process.env.NODE_ENV === "production" &&
  process.env.USE_DATABASE_OWNER === "true";

if (!useDatabaseOwner && !process.env.APP_DATABASE_PASSWORD) {
  throw new Error(
    "APP_DATABASE_PASSWORD must be set for the restricted database role.",
  );
}

const runtimeDatabaseUrl = new URL(process.env.DATABASE_URL);
if (!useDatabaseOwner) {
  runtimeDatabaseUrl.username = "quickex_app_runtime";
  runtimeDatabaseUrl.password = process.env.APP_DATABASE_PASSWORD!;
}

export const pool = new Pool({
  connectionString: runtimeDatabaseUrl.toString(),
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error; discarding client.", error);
});

export const db = drizzle(pool, { schema });

if (process.env.NODE_ENV === "production") {
  delete process.env.DATABASE_URL;
  delete process.env.PGUSER;
  delete process.env.PGPASSWORD;
}

export * from "./schema";
