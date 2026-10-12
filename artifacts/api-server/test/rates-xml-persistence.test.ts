import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, cryptoAssetsTable, cryptoAssetNetworksTable, manualDeskPricingRulesTable,
  ratesXmlSettingsTable } from "@workspace/db";
import router from "../src/routes/rates-xml";
import { ApiError } from "../src/lib/api-error";
import { configureQuickexPublicConfigSourceForTests } from "../src/lib/provider-capabilities";
import {
  readXmlSettings, readXmlMethods, xmlPublicationConfigurationHash,
} from "../src/lib/rates-xml-methods";
import { invalidateRatesXml } from "../src/lib/rates-xml-export";
import { readPublishedXmlQuotes, savePublishedXmlQuote } from "../src/lib/rates-xml-publication";

if (process.env.API_TEST_DISPOSABLE_DATABASE !== "1")
  throw new Error("XML publication tests require a disposable database.");
after(() => pool.end());

test("public XML survives cold memory, slow discovery and outages; disabled routes do not return", async () => {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External provider I/O disabled in publication tests."); };
  configureQuickexPublicConfigSourceForTests(async () => { throw new ApiError("QUICKEX_NETWORK", "Provider offline", 503); });
  // Operator-edited seed rows are not test fixtures. Prepare exact enabled identities
  // exclusively in this disposable database, without depending on current Admin data.
  for (const [code, networkCode, decimals] of [["USDT", "TRC20", 6], ["BTC", "BTC", 8]] as const) {
    const [asset] = await db.insert(cryptoAssetsTable).values({
      id: randomUUID(), code, name: code, decimals,
    }).onConflictDoUpdate({ target: cryptoAssetsTable.code, set: { enabled: true, lifecycle: "active" } }).returning();
    await db.insert(cryptoAssetNetworksTable).values({
      id: randomUUID(), assetId: asset.id, networkCode, networkName: networkCode, decimals,
    }).onConflictDoUpdate({
      target: [cryptoAssetNetworksTable.assetId, cryptoAssetNetworksTable.networkCode],
      set: { enabled: true, lifecycle: "active", executionMode: "manual" },
    });
  }
  await db.delete(ratesXmlSettingsTable).where(eq(ratesXmlSettingsTable.id, 1));
  const row = await readXmlSettings();
  const { methods, catalogFingerprint } = await readXmlMethods(row, { cacheOnly: true });
  const pricing = await db.select().from(manualDeskPricingRulesTable);
  const source = methods.find(m => m.enabled && m.assetCode === "USDT" && m.network === "TRC20");
  const target = methods.find(m => m.enabled && m.assetCode === "BTC" && m.network === "BTC");
  assert.ok(source && target, "isolated catalogue must include the example crypto networks");
  const configuration = xmlPublicationConfigurationHash(row?.version ?? 0, methods, pricing, catalogFingerprint, true);
  const routeId = `convert:${source.optionId}:${target.optionId}`, key = `${configuration}:${routeId}`;
  const saved = {
    source, target, item: { from: source.code!, to: target.code!, out: "0.00001",
      amount: target.reserve, minamount: "10", maxamount: "1000", symbol: "USDT", param: "floating" as const },
    diagnostic: { routeId, functionType: "convert" as const,
      sourceOptionId: source.optionId, targetOptionId: target.optionId,
      fromName: source.name, toName: target.name, state: "ready" as const, message: "Verified fixture quote" },
  };
  const quotedAt = Date.now() - 60_000;
  await savePublishedXmlQuote(configuration, key, saved, quotedAt);
  await savePublishedXmlQuote(configuration, key, { ...saved, item: { ...saved.item, out: "9" } }, quotedAt - 1);
  const persisted = (await readPublishedXmlQuotes(configuration)).find(q => q.key === key)!;
  assert.equal(persisted.quote.item.out, "0.00001", "older replicas cannot overwrite newer publications");
  assert.equal((await readPublishedXmlQuotes("unrelated")).length, 0);

  const app = express(); app.use("/api", router);
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error.status ?? 500).json({ message: error.message }));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/rates.xml`;
  const expectRate = async () => {
    const response = await nativeFetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-xml-rate-source"), "last-successful");
    assert.match(response.headers.get("warning")!, /last successful/);
    const xml = await response.text();
    assert.match(xml, /<from>USDTTRC20<\/from>/);
    assert.match(xml, /<to>BTC<\/to>/);
    assert.match(xml, /<out>0.00001<\/out>/);
    assert.ok((Number(response.headers.get("x-xml-exported-count"))) >= 1);
  };
  try {
    invalidateRatesXml(); // Simulate a cold process: only durable publication remains.
    await expectRate();
    configureQuickexPublicConfigSourceForTests(async () => new Promise(() => {}));
    invalidateRatesXml();
    await expectRate(); // A never-resolving provider does not remove the persisted rate.
    const networkId = source.optionId.slice("crypto:".length);
    await db.update(cryptoAssetNetworksTable).set({ enabled: false }).where(eq(cryptoAssetNetworksTable.id, networkId));
    invalidateRatesXml();
    configureQuickexPublicConfigSourceForTests(async () => { throw new ApiError("QUICKEX_NETWORK", "Provider offline", 503); });
    const disabled = await nativeFetch(url);
    assert.equal(disabled.status, 200);
    assert.doesNotMatch(await disabled.text(), /<from>USDTTRC20<\/from>\s*<to>BTC<\/to>/);
  } finally {
    globalThis.fetch = nativeFetch;
    configureQuickexPublicConfigSourceForTests(undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
