import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireDatabaseDependency = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const pg = requireDatabaseDependency("pg");

if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("WhiteBIT integration tests require a Development DATABASE_URL outside a deployment.");
}

const sourceUrl = new URL(process.env.DATABASE_URL);
const testDatabase = `whitebit_test_${randomBytes(8).toString("hex")}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${testDatabase}`;
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

function childFinished(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => resolve(code ?? 1));
  });
}

async function cloneSchema() {
  const dump = spawn("pg_dump", ["--schema-only", "--no-owner"], {
    env: postgresEnvironment(sourceUrl),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const restore = spawn("psql", ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet"], {
    env: postgresEnvironment(testUrl),
    stdio: ["pipe", "ignore", "pipe"],
  });
  dump.stdout.pipe(restore.stdin);
  // Do not log SQL, URLs, provider settings, or credentials.
  let errors = "";
  dump.stderr.on("data", data => { errors += String(data).slice(0, 1000); });
  restore.stderr.on("data", data => { errors += String(data).slice(0, 1000); });
  const [dumpCode, restoreCode] = await Promise.all([childFinished(dump), childFinished(restore)]);
  if (dumpCode !== 0 || restoreCode !== 0) {
    throw new Error(`Could not initialize isolated WhiteBIT schema (${dumpCode}/${restoreCode}): ${errors.slice(-2000)}`);
  }
}

async function developmentFingerprint() {
  const { rows } = await owner.query(`
    SELECT
      (SELECT md5(to_jsonb(s)::text) FROM whitebit_provider_settings s WHERE provider = 'whitebit') AS settings,
      (SELECT md5(to_jsonb(i)::text) FROM provider_integrations i WHERE provider = 'whitebit') AS credentials,
      (SELECT md5(string_agg(to_jsonb(n)::text, ',' ORDER BY n.id)) FROM crypto_asset_networks n) AS routes
  `);
  return rows[0];
}

async function seedSyntheticRoutes() {
  const test = new pg.Client({ connectionString: testUrl.toString() });
  await test.connect();
  try {
    await test.query(`
      INSERT INTO crypto_assets (id, code, name, decimals) VALUES
        ('btc', 'BTC', 'Bitcoin', 8),
        ('bnb', 'BNB', 'BNB', 18),
        ('usdt', 'USDT', 'Tether', 6);
      INSERT INTO crypto_asset_networks
        (id, asset_id, network_code, network_name, decimals, execution_mode, deposit_provider,
         whitebit_asset_code, whitebit_network_code)
      VALUES
        ('btc-bitcoin', 'btc', 'BITCOIN', 'Bitcoin', 8, 'manual', 'whitebit', NULL, NULL),
        ('bnb-bnb', 'bnb', 'BNB', 'BNB', 18, 'manual', 'whitebit', 'BNB', 'BEP20'),
        ('usdt-trc20', 'usdt', 'TRC20', 'Tron', 6, 'manual', 'whitebit', NULL, NULL);
      INSERT INTO fiat_currencies
        (id, code, name, network, precision, lifecycle, enabled, rate_mode, manual_rate)
      VALUES
        ('00000000-0000-4000-8000-00000000f001', 'EUR', 'Synthetic Euro', 'SEPA',
         2, 'active', TRUE, 'manual', '1');
      INSERT INTO payment_methods
        (id, name, family, execution_mode, lifecycle, enabled, can_send, can_receive,
         field_definitions, description)
      VALUES
        ('sepa-test-fixture', 'Synthetic SEPA Fixture', 'bank-transfer', 'manual',
         'active', TRUE, FALSE, TRUE, '[]'::jsonb,
         'Synthetic test-only EUR/SEPA settlement rail');
      INSERT INTO fiat_currency_payment_methods
        (id, fiat_currency_id, payment_method_id, enabled, can_send, can_receive, countries)
      VALUES
        ('00000000-0000-4000-8000-00000000f002',
         '00000000-0000-4000-8000-00000000f001',
         'sepa-test-fixture', TRUE, FALSE, TRUE, '[]'::jsonb);
    `);
  } finally {
    await test.end();
  }
}

let developmentBefore;
let suitePassed = false;
try {
  await owner.connect();
  developmentBefore = await developmentFingerprint();
  await owner.query(`CREATE DATABASE "${testDatabase}"`);
  created = true;
  await cloneSchema();
  await seedSyntheticRoutes();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: testUrl.toString(),
    WHITEBIT_ISOLATED_DATABASE: testDatabase,
    WHITEBIT_API_KEY: "isolated-test-key",
    WHITEBIT_API_SECRET: "isolated-test-secret",
    WHITEBIT_CREDENTIAL_SOURCE: undefined,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${resolve("test/block-whitebit-network.mjs")}`.trim(),
  };
  const entries = [
    "whitebit-unit.test.ts",
    "whitebit-history-worker.test.ts",
    "whitebit-integration.test.ts",
    "whitebit-swap-integration.test.ts",
  ];
  const selected = process.argv[2];
  if (selected && !entries.includes(selected)) throw new Error("Unknown WhiteBIT test entry.");
  for (const entry of selected ? [selected] : entries) {
    const child = spawn(process.execPath, ["test/run.mjs", entry], { env, stdio: "inherit" });
    if (await childFinished(child) !== 0) {
      throw new Error(`${entry} failed in the isolated WhiteBIT database.`);
    }
  }
  suitePassed = true;
} finally {
  try {
    if (created) await owner.query(`DROP DATABASE "${testDatabase}" WITH (FORCE)`);
    if (developmentBefore) {
      const after = await developmentFingerprint();
      if (JSON.stringify(developmentBefore) !== JSON.stringify(after)) {
        throw new Error("Development WhiteBIT settings, credentials, or routes changed during the isolated suite.");
      }
      console.log(`Development WhiteBIT provider settings, credentials, and routes unchanged${suitePassed ? "; isolated suite passed." : " after failed isolated run."}`);
    }
  } finally {
    await owner.end();
  }
}