/**
 * Read-only physical-connection probe. Never run against Production.
 * Each sample closes only its own client, so the next sample must authenticate
 * a new connection rather than proving just reuse of a warm pool connection.
 */
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { ObservedPool } from "../lib/db/src/observed-pool";
import { classifyDatabasePoolError } from "../lib/db/src/pool-telemetry";
import { createRuntimeDatabaseConnectionConfig } from "../lib/db/runtime-database-config.mjs";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
    throw new Error("This probe is Development-only.");
  }
  const pool = new ObservedPool({
    ...createRuntimeDatabaseConnectionConfig(process.env),
    max: 1, min: 0, idleTimeoutMillis: 1_000,
    keepAlive: true, keepAliveInitialDelayMillis: 10_000,
  });
  pool.on("error", error => {
    console.error(JSON.stringify({ idleClientError: classifyDatabasePoolError(error) }));
    process.exitCode = 1;
  });
  const samples = 60;
  const timings: number[] = [];
  const failures: { sample: number; category: string }[] = [];
  const startedAt = new Date().toISOString();
  try {
    for (let index = 0; index < samples; index++) {
      const start = performance.now();
      let client;
      try {
        client = await pool.connect();
        await client.query("SELECT 1");
        timings.push(Math.round((performance.now() - start) * 100) / 100);
      } catch (error) {
        failures.push({ sample: index + 1, category: classifyDatabasePoolError(error) });
      } finally {
        client?.release(true);
      }
      if (index + 1 < samples) await delay(2_000);
    }
    timings.sort((a, b) => a - b);
    console.log(JSON.stringify({
      target: "Development restricted runtime role; dedicated probe pool",
      startedAt, endedAt: new Date().toISOString(),
      samples, successes: timings.length, failures,
      medianMs: timings.length ? timings[Math.floor(timings.length / 2)] : null,
      maxMs: timings.length ? timings[timings.length - 1] : null,
      poolRemaining: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      metrics: pool.metrics(),
      limitation: "A two-minute observation is not proof of sustained Production stability.",
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error("Database stability probe failed. No connection details logged.");
  process.exitCode = 1;
});
