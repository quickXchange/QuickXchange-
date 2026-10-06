import assert from "node:assert/strict";
import test from "node:test";
import { loadTelegramConvertCatalog } from "../src/lib/telegram-convert-catalog";
import { buildQuotePayload, filterConvertTargets } from "../src/lib/telegram-wizard";

const instruments = [
  { slug: "btc-bitcoin", currencyTitle: "BTC", networkTitle: "Bitcoin", instrumentType: "crypto", fullName: "Bitcoin" },
  { slug: "usdt-trc20", currencyTitle: "USDT", networkTitle: "TRC20", instrumentType: "crypto", fullName: "Tether", requiresMemo: true },
  { slug: "usdt-erc20", currencyTitle: "USDT", networkTitle: "ERC20", instrumentType: "crypto", fullName: "Tether" },
  { slug: "orphan", currencyTitle: "ORPHAN", networkTitle: "NONE", instrumentType: "crypto" },
];
const pairs = [
  { fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "USDT", toNetwork: "TRC20" },
  { fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "USDT", toNetwork: "ERC20" },
];

test("Telegram Convert loads Quickex directly even when Manual config is empty or unavailable", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => {
    calls.push(String(input));
    assert.equal(String(input), "http://api.internal/api/quickex/config",
      "Convert must not depend on /exchange/config or its instantSettlementOptions.");
    return Response.json({ instruments, pairs });
  };
  const catalog = await loadTelegramConvertCatalog("http://api.internal/", fetcher);
  assert.ok(catalog);
  assert.deepEqual(calls, ["http://api.internal/api/quickex/config"]);
  assert.deepEqual(catalog.options.map(option => option.id), ["quickex:btc-bitcoin", "quickex:usdt-trc20"]);
  assert.deepEqual(catalog.allOptions.map(option => option.id),
    ["quickex:btc-bitcoin", "quickex:usdt-trc20", "quickex:usdt-erc20"]);
  const targets = filterConvertTargets(catalog.allOptions, catalog.convertPairs, catalog.options[0]);
  assert.deepEqual(targets.map(option => option.id), ["quickex:usdt-trc20"]);
  assert.equal(targets[0].requiresMemo, true);
  const quote = buildQuotePayload("convert", catalog.options[0], targets[0], 1, "FLOATING");
  assert.equal(quote.type, "instant");
  assert.equal(quote.fromAsset, "BTC");
  assert.equal(quote.toNetwork, "TRC20");
  assert.deepEqual(filterConvertTargets(catalog.allOptions, catalog.convertPairs, catalog.options[1])
    .map(option => option.routeNetwork), ["ERC20"], "Preserve same-symbol cross-network Convert.");
});

test("Telegram Convert stays unavailable when Quickex rejects or has no executable directions", async () => {
  assert.equal(await loadTelegramConvertCatalog("http://api.internal", async () => new Response("", { status: 503 })), null);
  for (const config of [
    { instruments, pairs: [] },
    { instruments, pairs: [{ fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "MISSING", toNetwork: "NONE" }] },
    { instruments, pairs: [{ fromAsset: "BTC", fromNetwork: "Bitcoin", toAsset: "BTC", toNetwork: "Bitcoin" }] },
  ]) {
    const catalog = await loadTelegramConvertCatalog("http://api.internal", async () => Response.json(config));
    assert.ok(catalog);
    assert.equal(catalog.options.length, 0);
    assert.equal(catalog.convertPairs.length, 0);
  }
});
