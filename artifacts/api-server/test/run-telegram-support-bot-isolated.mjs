import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireDatabaseDependency = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const pg = requireDatabaseDependency("pg");
if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("Support bot API tests require a Development database outside a deployment.");
}

const sourceUrl = new URL(process.env.DATABASE_URL);
const databaseName = `support_bot_schema_test_${randomBytes(8).toString("hex")}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const owner = new pg.Client({ connectionString: sourceUrl.toString() });
let created = false;

function postgresEnvironment(url) {
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode") } : {}),
  };
}

function finished(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(code ?? 1));
  });
}

async function restoreSchemaOnly() {
  const dump = spawn("pg_dump", ["--schema-only", "--no-owner", "--format=custom"], {
    env: postgresEnvironment(sourceUrl),
    stdio: ["ignore", "pipe", "ignore"],
  });
  const restore = spawn("pg_restore", ["--no-owner", "--exit-on-error", "--dbname", testUrl.toString()], {
    env: postgresEnvironment(testUrl),
    stdio: ["pipe", "ignore", "ignore"],
  });
  dump.stdout.pipe(restore.stdin);
  const [dumpCode, restoreCode] = await Promise.all([finished(dump), finished(restore)]);
  if (dumpCode !== 0 || restoreCode !== 0) {
    throw new Error(`Could not initialize the schema-only Telegram support bot test database (${dumpCode}/${restoreCode}).`);
  }
}

try {
  await owner.connect();
  await owner.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await restoreSchemaOnly();
  const testClient = new pg.Client({ connectionString: testUrl.toString() });
  await testClient.connect();
  try {
    const existing = await testClient.query(
      "select to_regclass('public.telegram_support_bot_settings') as settings, to_regclass('public.telegram_support_bot_updates') as updates, to_regclass('public.telegram_support_bot_outbox') as outbox",
    );
    const row = existing.rows[0];
    const present = [row?.settings, row?.updates, row?.outbox].filter(Boolean).length;
    if (present === 0) {
      const migration = await readFile(
        new URL("../../../lib/db/migrations/0137_damp_crusher_hogan.sql", import.meta.url),
        "utf8",
      );
      await testClient.query(migration);
    } else if (present !== 3) {
      throw new Error("The isolated database contains a partial Telegram support bot schema.");
    }
    const attestationColumns = await testClient.query(
      "select count(*)::integer as count from information_schema.columns where table_schema = 'public' and table_name = 'telegram_support_bot_settings' and column_name in ('webhook_attested_token_digest', 'webhook_attested_secret_digest', 'webhook_attested_url', 'webhook_attested_at')",
    );
    const attestationColumnCount = Number(attestationColumns.rows[0]?.count ?? 0);
    if (attestationColumnCount === 0) {
      const attestationMigration = await readFile(
        new URL("../../../lib/db/migrations/0138_telegram_support_bot_webhook_attestation.sql", import.meta.url),
        "utf8",
      );
      await testClient.query(attestationMigration);
    } else if (attestationColumnCount !== 4) {
      throw new Error("The isolated database contains a partial webhook attestation schema.");
    }
  } finally {
    await testClient.end();
  }

  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testUrl.toString(),
    API_TEST_DISPOSABLE_DATABASE: "1",
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${resolve("test/block-whitebit-network.mjs")}`.trim(),
  };
  const child = spawn(process.execPath, ["test/run.mjs", "telegram-support-bot.test.ts"], {
    env,
    stdio: "inherit",
  });
  process.exitCode = await finished(child);
} finally {
  try {
    if (created) await owner.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await owner.end();
  }
}