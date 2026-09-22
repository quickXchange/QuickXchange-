import { spawn } from "node:child_process";
import { createServer } from "node:http";

let activeChild = null;
let requestedSignal = null;

const exitCodeForSignal = (signal) => signal === "SIGINT" ? 130 : 143;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    requestedSignal ??= signal;
    if (activeChild && !activeChild.killed) activeChild.kill(signal);
  });
}

function runChild(command, args) {
  if (requestedSignal) {
    return Promise.resolve({
      code: null,
      signal: requestedSignal,
      skipped: true,
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = null;
      resolve({ code, signal });
    });
  });
}

let startupGate = null;

async function closeStartupGate() {
  if (!startupGate) return;
  const server = startupGate;
  startupGate = null;
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

if (process.env.MIGRATIONS_ONLY !== "true") {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 through 65535.");
  }
  startupGate = createServer((_request, response) => {
    response.statusCode = 503;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Retry-After", "5");
    response.end("Database release step in progress.\n");
  });
  await new Promise((resolve, reject) => {
    startupGate.once("error", reject);
    startupGate.listen(port, "0.0.0.0", resolve);
  });
  console.log(`Production startup gate listening on port ${port}.`);
  if (requestedSignal) {
    await closeStartupGate();
    process.exit(exitCodeForSignal(requestedSignal));
  }
}

const migration = await runChild(
  process.execPath,
  ["lib/db/migrate.mjs"],
);
if (requestedSignal) {
  await closeStartupGate();
  process.exit(exitCodeForSignal(requestedSignal));
}
if (migration.signal) {
  await closeStartupGate();
  process.exit(exitCodeForSignal(migration.signal));
}
if (migration.code !== 0) {
  await closeStartupGate();
  console.error(`Production database release step failed with exit code ${migration.code ?? 1}.`);
  process.exit(migration.code ?? 1);
}

if (process.env.MIGRATIONS_ONLY === "true") {
  console.log("Production database release step completed.");
  process.exit(0);
}

await closeStartupGate();
if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
console.log("Production database release step completed; starting API.");

const api = await runChild(
  process.execPath,
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
);
if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
if (api.signal) process.exit(exitCodeForSignal(api.signal));
process.exit(api.code ?? 1);