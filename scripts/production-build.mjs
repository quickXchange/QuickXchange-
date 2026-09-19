import { execFileSync } from "node:child_process";
import { access, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const deployedAt = new Date().toISOString();

function sourceCommit() {
  const configured =
    process.env.APP_COMMIT ||
    process.env.REPLIT_GIT_COMMIT ||
    process.env.GIT_COMMIT;
  if (configured?.trim()) return configured.trim();
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

const commit = sourceCommit();
const buildId =
  process.env.APP_BUILD_ID ||
  `${commit.slice(0, 12)}-${deployedAt.replace(/\D/g, "").slice(0, 14)}`;
const buildEnv = {
  ...process.env,
  NODE_ENV: "production",
  APP_BUILD_ID: buildId,
  APP_COMMIT: commit,
  DEPLOYED_AT: deployedAt,
};

const outputs = [
  "artifacts/crypto-exchange-widget/dist",
  "artifacts/quickxchange-telegram-mini-app/dist",
  "artifacts/api-server/dist",
];

for (const output of outputs) {
  await rm(path.join(workspaceRoot, output), { recursive: true, force: true });
}

function runWithEnv(envOverrides, ...args) {
  execFileSync("pnpm", args, {
    cwd: workspaceRoot,
    env: { ...buildEnv, ...envOverrides },
    stdio: "inherit",
  });
}

function run(...args) {
  runWithEnv({}, ...args);
}

run("run", "typecheck");
run("--filter", "@workspace/crypto-exchange-widget", "run", "build");
runWithEnv(
  {
    PORT: "24368",
    BASE_PATH: "/telegram-mini-app/",
    VITE_BUILD_ID: buildId,
  },
  "--filter",
  "@workspace/quickxchange-telegram-mini-app",
  "run",
  "build",
);
run("--filter", "@workspace/api-server", "run", "build");

const requiredFiles = [
  "artifacts/crypto-exchange-widget/dist/public/index.html",
  "artifacts/crypto-exchange-widget/dist/public/build-manifest.json",
  "artifacts/quickxchange-telegram-mini-app/dist/public/index.html",
  "artifacts/quickxchange-telegram-mini-app/dist/public/build-manifest.json",
  "artifacts/api-server/dist/index.mjs",
  "artifacts/api-server/dist/build-manifest.json",
];

for (const relativePath of requiredFiles) {
  const filePath = path.join(workspaceRoot, relativePath);
  await access(filePath);
  const details = await stat(filePath);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Production build output is missing or empty: ${relativePath}`);
  }
}

const frontendManifest = JSON.parse(
  await readFile(
    path.join(
      workspaceRoot,
      "artifacts/crypto-exchange-widget/dist/public/build-manifest.json",
    ),
    "utf8",
  ),
);
if (frontendManifest.buildId !== buildId) {
  throw new Error("Frontend build manifest does not match the current production build.");
}

const releaseManifest = {
  buildId,
  commit,
  deployedAt,
  outputs: requiredFiles,
};
await writeFile(
  path.join(workspaceRoot, "artifacts/api-server/dist/release-manifest.json"),
  `${JSON.stringify(releaseManifest, null, 2)}\n`,
  "utf8",
);

console.log(`Production build ${buildId} completed and verified.`);