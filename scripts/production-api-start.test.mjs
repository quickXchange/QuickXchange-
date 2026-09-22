import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { get } from "node:http";
import test from "node:test";

const wrapper = resolve("scripts/production-api-start.mjs");

async function fixture(migrationScript, apiScript = "process.exit(0);") {
  const directory = await mkdtemp(join(tmpdir(), "quickex-production-start-"));
  await mkdir(join(directory, "lib/db"), { recursive: true });
  await mkdir(join(directory, "artifacts/api-server/dist"), { recursive: true });
  await writeFile(
    join(directory, "lib/db/run-production-monitoring-migrations.mjs"),
    migrationScript,
  );
  await writeFile(join(directory, "artifacts/api-server/dist/index.mjs"), apiScript);
  return {
    directory,
    env: { ...process.env },
  };
}

function run(directory, env) {
  return spawn(process.execPath, [wrapper], {
    cwd: directory,
    env: { ...env, PORT: env.PORT ?? "18081" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getStatus(port) {
  return new Promise((resolve, reject) => {
    const request = get(`http://127.0.0.1:${port}/api/healthz`, response => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
}

function collect(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  return new Promise(resolve => {
    child.on("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test("migration failure prevents API startup", async () => {
  const f = await fixture("process.exit(23);", "throw new Error('API must not start');");
  try {
    const result = await collect(run(f.directory, f.env));
    assert.equal(result.code, 23);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("migrations-only mode completes without starting API", async () => {
  const f = await fixture("process.exit(0);", "throw new Error('API must not start');");
  try {
    const result = await collect(run(f.directory, { ...f.env, MIGRATIONS_ONLY: "true" }));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Production database release step completed/);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("successful migration hands off to API", async () => {
  const f = await fixture("process.exit(0);", "console.log('api-started');");
  try {
    const result = await collect(run(f.directory, f.env));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /api-started/);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("termination during migration is forwarded and API never starts", async () => {
  const f = await fixture(
    `
      import { writeFileSync } from "node:fs";
      writeFileSync(process.env.MIGRATION_MARKER, "started");
      process.on("SIGTERM", () => {
        writeFileSync(process.env.TERMINATION_MARKER, "terminated");
        process.exit(0);
      });
      setInterval(() => {}, 1000);
    `,
    "throw new Error('API must not start');",
  );
  const migrationMarker = join(f.directory, "migration-started");
  const terminationMarker = join(f.directory, "migration-terminated");
  try {
    const child = run(f.directory, {
      ...f.env,
      MIGRATION_MARKER: migrationMarker,
      TERMINATION_MARKER: terminationMarker,
    });
    const resultPromise = collect(child);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await readFile(migrationMarker);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    child.kill("SIGTERM");
    const result = await resultPromise;
    assert.equal(result.code, 143);
    assert.equal((await readFile(terminationMarker, "utf8")).trim(), "terminated");
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("startup gate listens while migration is in progress", async () => {
  const migrationScript = `
    import { writeFileSync } from "node:fs";
    writeFileSync(process.env.MIGRATION_MARKER, "started");
    setInterval(() => {}, 1000);
  `;
  const f = await fixture(migrationScript, "throw new Error('API must not start');");
  const marker = join(f.directory, "migration-started");
  const port = "18082";
  try {
    const child = run(f.directory, {
      ...f.env,
      PORT: port,
      MIGRATION_MARKER: marker,
    });
    const resultPromise = collect(child);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await readFile(marker);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    assert.equal(await getStatus(port), 503);
    child.kill("SIGTERM");
    const result = await resultPromise;
    assert.equal(result.code, 143);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("termination during API execution is forwarded", async () => {
  const apiScript = `
    import { writeFileSync } from "node:fs";
    writeFileSync(process.env.API_MARKER, "started");
    process.on("SIGTERM", () => {
      writeFileSync(process.env.TERMINATION_MARKER, "terminated");
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  `;
  const f = await fixture("process.exit(0);", apiScript);
  const apiMarker = join(f.directory, "api-started");
  const terminationMarker = join(f.directory, "api-terminated");
  try {
    const child = run(f.directory, {
      ...f.env,
      API_MARKER: apiMarker,
      TERMINATION_MARKER: terminationMarker,
    });
    const resultPromise = collect(child);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await readFile(apiMarker);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    child.kill("SIGTERM");
    const result = await resultPromise;
    assert.equal(result.code, 143);
    assert.equal((await readFile(terminationMarker, "utf8")).trim(), "terminated");
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});