import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";

// Resolve esbuild from the workspace, not from the bundled temporary test file.
const requirePackage = createRequire(resolve("package.json"));
const { build } = requirePackage("esbuild") as typeof import("esbuild");

test("stale shortcuts survive a rejected detached provider refresh and recover", async () => {
  const fixtures = { fail: false, calls: 0, warnings: 0 };
  const globals = globalThis as typeof globalThis & {
    __qxPopularPairFixtures?: typeof fixtures;
  };
  globals.__qxPopularPairFixtures = fixtures;
  const directory = await mkdtemp(join(tmpdir(), "qx-popular-pairs-test-"));
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const output = join(directory, "popular-pairs.mjs");
    const mocks: Record<string, string> = {
      "drizzle-orm": `
        export const and = () => null, desc = () => null, eq = () => null,
          gte = () => null, inArray = () => null, sql = () => null;
      `,
      "@workspace/db": `
        const query = new Proxy({}, { get(_target, property) {
          if (property === "then") {
            const result = Promise.resolve([]);
            return result.then.bind(result);
          }
          return () => query;
        } });
        export const db = { select: () => query };
        export const manualDeskPricingRulesTable = {}, ordersTable = {};
      `,
      "./manual-desk-pricing": "export const evaluateManualPricingCoverage = () => ({ coveredRoutes: [] });",
      "./manual-crypto": "export const listPublicManualCryptoSettlementOptions = async () => [];",
      "./payment-methods": "export const listPublicFiatSettlementOptions = async () => [];",
      "./provider-capabilities": `
        export const listExecutableProviderCapabilities = async () => [];
        export async function getQuickexPublicPairs() {
          const fixtures = globalThis.__qxPopularPairFixtures;
          fixtures.calls++;
          if (fixtures.fail) throw new Error("Synthetic provider outage");
          return [];
        }
      `,
      "./logger": `
        export const logger = { warn: () => globalThis.__qxPopularPairFixtures.warnings++ };
      `,
    };
    await build({
      entryPoints: [resolve("src/lib/popular-exchange-pairs.ts")],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      plugins: [{
        name: "isolated-shortcut-dependencies",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, args =>
            Object.hasOwn(mocks, args.path)
              ? { path: args.path, namespace: "fixture" }
              : undefined);
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
            contents: mocks[args.path],
            loader: "js",
          }));
        },
      }],
    });
    const shortcuts = await import(pathToFileURL(output).href);
    const initial = await shortcuts.getPopularExchangePairs();
    assert.equal(fixtures.calls, 1);

    now += 11 * 60_000;
    fixtures.fail = true;
    assert.strictEqual(await shortcuts.getPopularExchangePairs(), initial);
    // Node's test runner will fail this case if the detached rejection escapes.
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fixtures.calls, 2);
    assert.equal(fixtures.warnings, 1);

    fixtures.fail = false;
    assert.strictEqual(await shortcuts.getPopularExchangePairs(), initial);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.notStrictEqual(await shortcuts.getPopularExchangePairs(), initial);
    assert.equal(fixtures.calls, 3);
  } finally {
    Date.now = originalNow;
    delete globals.__qxPopularPairFixtures;
    await rm(directory, { recursive: true, force: true });
  }
});
