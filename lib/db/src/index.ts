import { drizzle } from "drizzle-orm/node-postgres";
import { ObservedPool } from "./observed-pool";
import * as schema from "./schema";
import { createRuntimeDatabaseConnectionConfig } from "../runtime-database-config.mjs";
import {
  classifyDatabasePoolError,
  databasePoolTelemetry as createDatabasePoolTelemetry,
} from "./pool-telemetry";

const connectionConfig =
  createRuntimeDatabaseConnectionConfig(process.env);

export const pool = new ObservedPool({
  ...connectionConfig,
  max: 10,
  min: 1,
  idleTimeoutMillis: 300_000,
  keepAlive: true,
  // A boolean alone leaves the OS's potentially multi-hour keepalive delay.
  keepAliveInitialDelayMillis: 10_000,
  allowExitOnIdle: process.env.NODE_ENV === "test",
});

export const databasePoolTelemetry = (component: string, error: unknown) =>
  ({ ...createDatabasePoolTelemetry(component, error, pool), ...pool.metrics() });

pool.on("error", (error) => {
  console.error(
    "Unexpected idle PostgreSQL client error; discarding client.",
    error,
    databasePoolTelemetry("postgres-idle-client", error),
  );
});

export const db = drizzle(pool, { schema });
// Dedicated, bounded control-plane sessions must not occupy an application
// pool slot while their RPC work needs other pooled transactions.
export { Client as DatabaseLockClient } from "pg";

export {
  classifyDatabasePoolError,
};

if (process.env.NODE_ENV === "production") {
  delete process.env.DATABASE_URL;
  delete process.env.PGUSER;
  delete process.env.PGPASSWORD;
}

export * from "./schema";
