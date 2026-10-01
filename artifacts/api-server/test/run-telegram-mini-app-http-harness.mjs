import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { delimiter, resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";

const requireDatabaseDependency = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const pg = requireDatabaseDependency("pg");
const API_DIRECTORY = resolve(".");
const SYNTHETIC_BOT_TOKEN = "1234567890:synthetic-telegram-mini-app-auth-harness";
const SYNTHETIC_SESSION_SECRET = "telegram-mini-app-http-harness-only-session-secret-v1";
const FIXTURE_IDS = {
  valid: "telegram-mini-auth-smoke-v1",
  tampered: "telegram-mini-auth-tampered-v1",
  expired: "telegram-mini-auth-expired-v1",
};

if (!process.env.DATABASE_URL
  || !process.env.APP_DATABASE_PASSWORD
  || process.env.NODE_ENV === "production"
  || process.env.REPLIT_DEPLOYMENT) {
  console.log("HARNESS_STATUS=blocked");
  console.log("ASSERT_DEVELOPMENT_DATABASE_AVAILABLE=false");
  process.exit(1);
}

const requestedPort = Number(process.argv[2] ?? process.env.TELEGRAM_MINI_APP_HARNESS_PORT ?? 0);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
  console.log("HARNESS_STATUS=blocked");
  console.log("ASSERT_PORT_CONFIGURATION_VALID=false");
  process.exit(1);
}

const sourceUrl = new URL(process.env.DATABASE_URL);
const databaseName = `telegram_auth_test_${randomBytes(8).toString("hex")}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const owner = new pg.Client({ connectionString: sourceUrl.toString() });
let databaseCreated = false;
let serverChild;
let tempDirectory;
let cleaning = false;
let cleanExitCode = 0;
let selectedPort = requestedPort;
let schemaOnlyRestored = false;
let initiallyEmptyTelegramChats = false;
let stopResolve;
const stopped = new Promise(resolveStop => { stopResolve = resolveStop; });
const keepLauncherAlive = setInterval(() => undefined, 60_000);

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
  return new Promise(resolveCode => {
    child.once("error", () => resolveCode(1));
    child.once("close", code => resolveCode(code ?? 1));
  });
}

async function cloneSchemaOnly() {
  const dump = spawn("pg_dump", ["--schema-only", "--no-owner"], {
    env: postgresEnvironment(sourceUrl),
    stdio: ["ignore", "pipe", "ignore"],
  });
  const restore = spawn("psql", ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet"], {
    env: postgresEnvironment(testUrl),
    stdio: ["pipe", "ignore", "ignore"],
  });
  dump.stdout.pipe(restore.stdin);
  const [dumpCode, restoreCode] = await Promise.all([childFinished(dump), childFinished(restore)]);
  if (dumpCode !== 0 || restoreCode !== 0) throw new Error("Schema-only database initialization failed.");
  schemaOnlyRestored = true;
}

async function cleanup() {
  if (cleaning) return stopped;
  cleaning = true;
  if (serverChild && serverChild.exitCode === null && serverChild.signalCode === null) {
    serverChild.kill("SIGTERM");
    await childFinished(serverChild);
  }
  try {
    if (databaseCreated) {
      await owner.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      databaseCreated = false;
    }
  } catch {
    cleanExitCode = 1;
    console.log("ASSERT_DISPOSABLE_DATABASE_DROPPED=false");
  }
  try {
    await owner.end();
  } catch {
    cleanExitCode = 1;
  }
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
  console.log(`HARNESS_STATUS=${cleanExitCode === 0 ? "stopped" : "cleanup-failed"}`);
  console.log(`ASSERT_DISPOSABLE_DATABASE_DROPPED=${databaseCreated ? "false" : "true"}`);
  clearInterval(keepLauncherAlive);
  if (cleanExitCode !== 0) process.exitCode = 1;
  stopResolve();
}

process.once("SIGTERM", () => { void cleanup(); });
process.once("SIGINT", () => { void cleanup(); });

async function getJson(url, init) {
  const response = await fetch(url, init);
  let body = {};
  try {
    body = await response.json();
  } catch {
    // Only response status and booleans are emitted by this harness.
  }
  return { status: response.status, body };
}

async function waitForService(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverChild.exitCode !== null || serverChild.signalCode !== null) {
      throw new Error("Isolated service exited before readiness.");
    }
    try {
      const result = await getJson(`${baseUrl}/__test/telegram-mini-app/control/status`);
      if (result.status === 200 && result.body.ready === true) return;
    } catch {
      // The listener may not be ready yet.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error("Isolated service readiness timeout.");
}

async function runAssertions(baseUrl) {
  const fixtureUrl = `${baseUrl}/__test/telegram-mini-app/fixtures`;
  const validFixture = await getJson(`${fixtureUrl}/${FIXTURE_IDS.valid}`);
  const validSession = await getJson(`${baseUrl}/api/telegram/mini-app/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: validFixture.body.initData }),
  });
  const validSessionAccepted = validFixture.status === 200
    && validSession.status === 200
    && typeof validSession.body.token === "string"
    && validSession.body.user?.id === "910000000001";
  const validOrders = await getJson(`${baseUrl}/api/telegram/mini-app/orders`, {
    headers: { Authorization: `Bearer ${validSession.body.token ?? ""}` },
  });
  const accountLinkCreate = await getJson(`${baseUrl}/api/telegram/mini-app/account-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${validSession.body.token ?? ""}`,
    },
    body: JSON.stringify({ intent: "signup" }),
  });
  const orderLinkCreate = await getJson(`${baseUrl}/api/telegram/mini-app/orders/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${validSession.body.token ?? ""}`,
    },
    body: JSON.stringify({ orderId: "synthetic-nonexistent-order", trackingToken: "synthetic-invalid-token" }),
  });

  const tamperedFixture = await getJson(`${fixtureUrl}/${FIXTURE_IDS.tampered}`);
  const tamperedHmac = await getJson(`${baseUrl}/api/telegram/mini-app/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: tamperedFixture.body.initData }),
  });
  const expiredFixture = await getJson(`${fixtureUrl}/${FIXTURE_IDS.expired}`);
  const expiredHmac = await getJson(`${baseUrl}/api/telegram/mini-app/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: expiredFixture.body.initData }),
  });
  const missingBearer = await getJson(`${baseUrl}/api/telegram/mini-app/orders`);
  const tamperedBearer = await getJson(`${baseUrl}/api/telegram/mini-app/orders`, {
    headers: { Authorization: `Bearer ${validSession.body.token ?? ""}x` },
  });
  const assertions = {
    ASSERT_VALID_HMAC_SESSION_ACCEPTED: validSessionAccepted,
    ASSERT_AUTHENTICATED_GET_ORDERS_EMPTY: validOrders.status === 200
      && Array.isArray(validOrders.body)
      && validOrders.body.length === 0,
    ASSERT_TAMPERED_HMAC_REJECTED: tamperedFixture.status === 200 && tamperedHmac.status === 401,
    ASSERT_EXPIRED_HMAC_REJECTED: expiredFixture.status === 200 && expiredHmac.status === 401,
    ASSERT_MISSING_BEARER_REJECTED: missingBearer.status === 401,
    ASSERT_TAMPERED_BEARER_REJECTED: tamperedBearer.status === 401,
    ASSERT_ACCOUNT_LINK_CREATE_BLOCKED: accountLinkCreate.status === 404,
    ASSERT_ORDER_LINK_CREATE_BLOCKED: orderLinkCreate.status === 404,
  };
  for (const [name, passed] of Object.entries(assertions)) {
    console.log(`${name}=${passed}`);
  }
  return Object.values(assertions).every(Boolean);
}

try {
  await owner.connect();
  await owner.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  await cloneSchemaOnly();
  const isolatedDatabase = new pg.Client({ connectionString: testUrl.toString() });
  await isolatedDatabase.connect();
  try {
    const { rows } = await isolatedDatabase.query(
      "SELECT count(*)::integer AS count FROM telegram_chats",
    );
    initiallyEmptyTelegramChats = rows[0]?.count === 0;
  } finally {
    await isolatedDatabase.end();
  }

  tempDirectory = await mkdtemp(join(tmpdir(), "telegram-mini-app-harness-"));
  const bundledServer = join(tempDirectory, "telegram-mini-app-http-harness.cjs");
  await build({
    entryPoints: [resolve("test/telegram-mini-app-http-harness-child.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: bundledServer,
    packages: "bundle",
    external: ["pg", "pg-native", "sharp"],
    logLevel: "silent",
  });

  if (selectedPort === 0) {
    const net = await import("node:net");
    const reservation = net.createServer();
    await new Promise((resolveListen, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", resolveListen);
    });
    selectedPort = reservation.address().port;
    await new Promise(resolveClose => reservation.close(resolveClose));
  }

  const nodeModules = [
    resolve("node_modules"),
    resolve("../../node_modules"),
    resolve("../../lib/db/node_modules"),
  ];
  const childEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    NODE_ENV: "test",
    DATABASE_URL: testUrl.toString(),
    APP_DATABASE_PASSWORD: process.env.APP_DATABASE_PASSWORD,
    TELEGRAM_BOT_TOKEN: SYNTHETIC_BOT_TOKEN,
    SESSION_SECRET: SYNTHETIC_SESSION_SECRET,
    TELEGRAM_MINI_APP_HARNESS_PORT: String(selectedPort),
    NODE_PATH: nodeModules.join(delimiter),
  };
  for (const key of ["SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"]) {
    if (process.env[key]) childEnv[key] = process.env[key];
  }
  serverChild = spawn(process.execPath, [bundledServer], {
    cwd: API_DIRECTORY,
    env: childEnv,
    stdio: "ignore",
  });
  serverChild.once("exit", () => {
    if (!cleaning) {
      cleanExitCode = 1;
      console.log("ASSERT_ISOLATED_HTTP_SERVICE_REMAINS_RUNNING=false");
      void cleanup();
    }
  });

  const baseUrl = `http://127.0.0.1:${selectedPort}`;
  await waitForService(baseUrl);
  const passed = await runAssertions(baseUrl);
  console.log(`ASSERT_SCHEMA_ONLY_EMPTY_DATABASE_INITIALIZED=${schemaOnlyRestored && initiallyEmptyTelegramChats}`);
  if (!passed) {
    cleanExitCode = 1;
    await cleanup();
    process.exitCode = 1;
  } else {
    console.log("HARNESS_STATUS=ready");
    console.log(`HARNESS_PID=${process.pid}`);
    console.log(`HARNESS_CONTROL_PORT=${selectedPort}`);
    console.log(`HARNESS_CONTROL_URL=${baseUrl}/__test/telegram-mini-app/control/status`);
    console.log(`FIXTURE_ID=${FIXTURE_IDS.valid}`);
    console.log(`FIXTURE_URL=${baseUrl}/__test/telegram-mini-app/fixtures/${FIXTURE_IDS.valid}`);
    console.log(`SESSION_URL=${baseUrl}/api/telegram/mini-app/session`);
    console.log(`ORDERS_URL=${baseUrl}/api/telegram/mini-app/orders`);
    console.log(`BROWSER_TEST_COMMAND=const F="${baseUrl}/__test/telegram-mini-app/fixtures/${FIXTURE_IDS.valid}",S="${baseUrl}/api/telegram/mini-app/session",O="${baseUrl}/api/telegram/mini-app/orders";fetch(F).then(r=>r.json()).then(f=>fetch(S,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData:f.initData})})).then(r=>r.json()).then(s=>fetch(O,{headers:{Authorization:"Bearer "+s.token}})).then(r=>r.json())`);
    await stopped;
  }
} catch {
  cleanExitCode = 1;
  console.log("HARNESS_STATUS=failed");
  console.log("ASSERT_SETUP_COMPLETE=false");
  await cleanup();
  process.exitCode = 1;
}