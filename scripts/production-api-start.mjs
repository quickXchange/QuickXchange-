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

const migration = await runChild(
  process.execPath,
  ["lib/db/migrate.mjs"],
);
if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
if (migration.signal) process.exit(exitCodeForSignal(migration.signal));
if (migration.code !== 0) process.exit(migration.code ?? 1);

if (process.env.MIGRATIONS_ONLY === "true") {
  console.log("Production database release step completed.");
  process.exit(0);
}

const api = await runChild(
  process.execPath,
  ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"],
);
if (requestedSignal) process.exit(exitCodeForSignal(requestedSignal));
if (api.signal) process.exit(exitCodeForSignal(api.signal));
process.exit(api.code ?? 1);