import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd(), "src");

async function source(path: string) {
  return readFile(resolve(root, path), "utf8");
}

test("manual exchange boundary is independent from provider implementation", async () => {
  const exchange = await source("routes/exchange.ts");
  assert.equal(/quickex/i.test(exchange), false);
  assert.equal(
    /convert-provider-boundary/.test(exchange),
    false,
    "routes/exchange.ts must not import the Convert provider boundary",
  );

  for (const path of [
    "routes/quickex.ts",
    "lib/quickex-order-service.ts",
  ]) {
    const content = await source(path);
    assert.equal(
      /from\s+["'][^"']*(?:routes\/exchange|manual-)[^"']*["']/.test(content),
      false,
      `${path} must not import the manual exchange boundary`,
    );
  }
});

test("Convert provider and blockchain monitoring have no bidirectional runtime imports", async () => {
  const providerModules = [
    "lib/quickex.ts",
    "lib/quickex-order-service.ts",
    "lib/convert-provider-boundary.ts",
  ];
  const monitoringModules = [
    "lib/blockchain-monitoring/service.ts",
    "lib/manual-monitoring-readiness.ts",
    "lib/manual-crypto.ts",
    "routes/blockchain-monitoring.ts",
  ];
  const providerSources = await Promise.all(providerModules.map(source));
  const monitoringSources = await Promise.all(monitoringModules.map(source));
  const monitoringImport = /from\s+["'][^"']*(?:blockchain-monitor|manual-monitor|manual-crypto|routes\/blockchain-monitoring)[^"']*["']/i;
  const providerImport = /from\s+["'][^"']*(?:quickex|convert-provider-boundary)[^"']*["']/i;
  for (const [index, content] of providerSources.entries()) {
    assert.equal(
      monitoringImport.test(content),
      false,
      `${providerModules[index]} must not import monitoring or Manual/Swap deposit code`,
    );
  }
  for (const [index, content] of monitoringSources.entries()) {
    assert.equal(
      providerImport.test(content),
      false,
      `${monitoringModules[index]} must not import Convert provider code`,
    );
  }
});

test("customer Swap widget cannot submit through the Convert boundary", async () => {
  const exchangeSurface = await readFile(
    resolve(process.cwd(), "../crypto-exchange-widget/src/components/exchange-surface.tsx"),
    "utf8",
  );
  const start = exchangeSurface.indexOf("function ManualSwapWidget");
  const end = exchangeSurface.indexOf("function ExchangeModeSwitcher", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const manualWidget = exchangeSurface.slice(start, end);

  assert.equal(/useCreateQuickex(?:Quote|Order)/.test(manualWidget), false);
  assert.equal(/type:\s*["']instant["']/.test(manualWidget), false);
  assert.equal(/type:\s*activeMode/.test(manualWidget), false);
  assert.equal(
    (manualWidget.match(/type:\s*["']manual["']/g) ?? []).length,
    2,
    "Swap quote and order requests must both be explicitly manual",
  );
});

test("customer exchange modules do not depend on the App route module", async () => {
  for (const path of [
    "../crypto-exchange-widget/src/pages/account.tsx",
    "../crypto-exchange-widget/src/components/customer/CustomerShell.tsx",
    "../crypto-exchange-widget/src/components/customer/CustomerStatCard.tsx",
    "../crypto-exchange-widget/src/components/exchange-surface.tsx",
    "../crypto-exchange-widget/src/components/public-shell.tsx",
    "../crypto-exchange-widget/src/components/shared-app-ui.tsx",
  ]) {
    const content = await readFile(resolve(process.cwd(), path), "utf8");
    assert.equal(
      /from\s+["'][^"']*(?:\/|\.)App["']/.test(content),
      false,
      `${path} must not import the App route module`,
    );
  }
});