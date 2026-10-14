import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CONVERT_XML_CATALOG_DISCOVERY_WAIT_MS, xmlDiscoveryDeadline } from "../src/lib/rates-xml-refresh";

test("a healthy slow live catalog is not rejected at the previous one-second boundary", async () => {
  const liveCatalog = { signedOrders: true, pairs: [{ fromAsset: "BTC", toAsset: "USDT" }] };
  assert.equal(
    await xmlDiscoveryDeadline(delay(1100, liveCatalog), CONVERT_XML_CATALOG_DISCOVERY_WAIT_MS),
    liveCatalog,
  );
});

test("discovery remains bounded and never substitutes a stale financial value", async () => {
  await assert.rejects(
    xmlDiscoveryDeadline(new Promise(() => {}), 5),
    { code: "XML_DISCOVERY_TIMEOUT", status: 503 },
  );
});
