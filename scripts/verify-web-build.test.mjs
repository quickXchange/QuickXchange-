import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const verifier = resolve("scripts/verify-web-build.mjs");
async function fixture(base = "/") {
  const directory = await mkdtemp(join(tmpdir(), "qx-web-release-"));
  const publicDir = join(directory, "dist/public");
  await mkdir(join(publicDir, "assets"), { recursive: true });
  await writeFile(join(publicDir, "index.html"), `<script src="${base}assets/app.js"></script>`);
  await writeFile(join(publicDir, "assets/app.js"), "/* fixture only */");
  const env = { ...process.env, BASE_PATH: base };
  for (const key of ["APP_BUILD_ID", "APP_COMMIT", "REPLIT_GIT_COMMIT", "GIT_COMMIT", "DEPLOYED_AT"]) delete env[key];
  return {
    directory, publicDir, env,
    run(extra = {}) {
      return spawnSync(process.execPath, [verifier, directory], {
        env: { ...env, ...extra }, encoding: "utf8",
      });
    },
    async manifest() { return JSON.parse(await readFile(join(publicDir, "build-manifest.json"), "utf8")); },
  };
}

test("root-hook release identifiers remain unchanged", async () => {
  const f = await fixture();
  try {
    const result = f.run({ APP_COMMIT: "a".repeat(40), APP_BUILD_ID: "release-fixture", DEPLOYED_AT: "2026-11-11T00:00:00.000Z" });
    assert.equal(result.status, 0, result.stderr);
    const metadata = await f.manifest();
    assert.equal(metadata.commit, "a".repeat(40));
    assert.equal(metadata.buildId, "release-fixture");
    assert.equal(metadata.deployedAt, "2026-11-11T00:00:00.000Z");
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("independent artifact rebuild recovers source identity from Git", async () => {
  const f = await fixture("/telegram-mini-app/");
  try {
    execFileSync("git", ["init", "-q", f.directory]);
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
      "commit", "--allow-empty", "-qm", "Isolated build fixture"], { cwd: f.directory });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: f.directory, encoding: "utf8" }).trim();
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const metadata = await f.manifest();
    assert.equal(metadata.commit, commit);
    assert.ok(metadata.buildId.startsWith(`${commit.slice(0, 12)}-`));
    assert.ok(metadata.deployedAt && metadata.verifiedAt);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("missing referenced assets fail verification", async () => {
  const f = await fixture();
  try {
    await rm(join(f.publicDir, "assets/app.js"));
    assert.notEqual(f.run().status, 0);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});
