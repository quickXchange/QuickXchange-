import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { createRuntimeDatabaseConnectionConfig } from "../runtime-database-config.mjs";
import {
  classifyDatabasePoolError,
  databasePoolTelemetry as createDatabasePoolTelemetry,
} from "./pool-telemetry";

const { Pool } = pg;

const connectionConfig =
  createRuntimeDatabaseConnectionConfig(process.env);

export const pool = new Pool({
  ...connectionConfig,
  max: 10,
  min: 1,
  idleTimeoutMillis: 300_000,
  keepAlive: true,
  allowExitOnIdle: process.env.NODE_ENV === "test",
});

export const databasePoolTelemetry = (component: string, error: unknown) =>
  createDatabasePoolTelemetry(component, error, pool);

pool.on("error", (error) => {
  console.error(
    "Unexpected idle PostgreSQL client error; discarding client.",
    error,
    databasePoolTelemetry("postgres-idle-client", error),
  );
});

export const db = drizzle(pool, { schema });

export {
  classifyDatabasePoolError,
};

if (process.env.NODE_ENV === "production") {
  delete process.env.DATABASE_URL;
  delete process.env.PGUSER;
  delete process.env.PGPASSWORD;
}

export * from "./schema";
