import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { createRuntimeDatabaseConnectionConfig } from "../runtime-database-config.mjs";

const { Pool } = pg;

const connectionConfig =
  createRuntimeDatabaseConnectionConfig(process.env);

export const pool = new Pool({
  ...connectionConfig,
  max: 10,
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
