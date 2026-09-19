import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const entry = process.argv[2] ?? "quickex.test.ts";
const directory = await mkdtemp(join(tmpdir(), "quickex-api-tests-"));
const outfile = join(directory, entry.replace(/\.tsx?$/, ".cjs"));

try {
  await build({
    entryPoints: [`test/${entry}`],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile,
    packages: "bundle",
    external: ["sharp"],
    define: {
      __API_BUILD_METADATA__: JSON.stringify({
        buildId: "test",
        commit: "test",
        deployedAt: "1970-01-01T00:00:00.000Z",
      }),
    },
  });
  const child = spawn(
    process.execPath,
    ["--test", "--test-concurrency=1", ...process.argv.slice(3), outfile],
    {
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: `${process.cwd()}/node_modules${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ""}` },
    },
  );
  const exitCode = await new Promise((resolve) => child.once("exit", resolve));
  process.exitCode = exitCode ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}