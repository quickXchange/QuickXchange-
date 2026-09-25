import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireDatabaseDependency = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const pg = requireDatabaseDependency("pg");

if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("API integration tests require a Development DATABASE_URL outside a deployment.");
}

const sourceUrl = new URL(process.env.DATABASE_URL);
const databaseName = `api_test_${randomBytes(8).toString("hex")}`;
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
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve(code ?? 1));
  });
}

async function copyDevelopmentSnapshot() {
  const dump = spawn("pg_dump", ["--no-owner", "--format=custom"], {
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
    throw new Error(`Could not initialize isolated API test database (${dumpCode}/${restoreCode}).`);
  }
}

try {
  await owner.connect();
  await owner.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await copyDevelopmentSnapshot();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testUrl.toString(),
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${resolve("test/block-whitebit-network.mjs")}`.trim(),
  };
  const command = process.argv.length > 2
    ? [process.execPath, "test/run.mjs", ...process.argv.slice(2)]
    : ["pnpm", "run", "test:api:raw"];
  const child = spawn(command[0], command.slice(1), { env, stdio: "inherit" });
  process.exitCode = await finished(child);
} finally {
  try {
    if (created) await owner.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  } finally {
    await owner.end();
  }
}