import { createHash } from "node:crypto";
import pg from "pg";
import { createRuntimeDatabaseConnectionConfig } from "./runtime-database-config.mjs";

const startedAt = Date.now();
let reported = false;
let client;

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function report(fields) {
  if (reported) return;
  reported = true;
  console.log([
    `Connection=${fields.connection}`,
    `Database identity=${fields.databaseIdentity}`,
    `User class=${fields.userClass}`,
    `SSL=${fields.ssl}`,
    `Duration=${Date.now() - startedAt}ms`,
    `Exit status=${fields.exitStatus}`,
  ].join(" | "));
}

const hardWatchdog = setTimeout(() => {
  report({
    connection: "failed",
    databaseIdentity: "unverified",
    userClass: "unverified",
    ssl: "unverified",
    exitStatus: "124",
  });
  process.exit(124);
}, 10_000);

try {
  const config = createRuntimeDatabaseConnectionConfig(process.env);
  const configuredDatabase = new URL(config.connectionString).pathname.slice(1);
  client = new pg.Client(config);
  await client.connect();
  const result = await client.query(`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      coalesce(
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()),
        false
      ) AS ssl
  `);
  const row = result.rows[0];
  const databaseMatches =
    shortHash(row.database_name) === shortHash(configuredDatabase);
  const userClass =
    row.database_user === "quickex_app_runtime"
      ? "restricted-runtime"
      : "managed-owner";
  await client.end();
  client = undefined;
  clearTimeout(hardWatchdog);
  report({
    connection: "succeeded",
    databaseIdentity: databaseMatches ? "matched" : "mismatched",
    userClass,
    ssl: row.ssl ? "enabled" : "disabled",
    exitStatus: "0",
  });
} catch {
  if (client) {
    await Promise.race([
      client.end().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 500)),
    ]);
  }
  clearTimeout(hardWatchdog);
  report({
    connection: "failed",
    databaseIdentity: "unverified",
    userClass: "unverified",
    ssl: "unverified",
    exitStatus: "1",
  });
  process.exitCode = 1;
}