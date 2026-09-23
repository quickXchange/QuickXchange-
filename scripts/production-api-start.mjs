import { spawn } from "node:child_process";

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

if (process.env.MIGRATIONS_ONLY === "true") {
  const migration = await runChild(
    process.execPath,
    ["lib/db/run-production-monitoring-migrations.mjs"],
  );
  if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
  if (migration.signal) process.exit(exitCodeForSignal(migration.signal));
  if (migration.code !== 0) {
    console.error(`Production database release step failed with exit code ${migration.code ?? 1}.`);
    process.exit(migration.code ?? 1);
  }
  console.log("Production database release step completed.");
  process.exit(0);
}

if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
console.log("Starting Production API without running database release operations.");

const api = await runChild(
  process.execPath,
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
);
if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
if (api.signal) process.exit(exitCodeForSignal(api.signal));
process.exit(api.code ?? 1);