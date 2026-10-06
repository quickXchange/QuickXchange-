import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManualDeskPricingRule } from "@workspace/db";
import {
  automaticBestchangeDirectionId, isAutomaticBestchangeDirection, syncBestchangeDirections,
  type SyncedBestchangeDirection,
} from "../src/lib/bestchange-direction-sync";

const rule = (patch: Partial<ManualDeskPricingRule> = {}): ManualDeskPricingRule => ({
  id: "rule", name: "Any manual route", enabled: true, priority: 0,
  sourceAsset: null, targetAsset: null, sourceCryptoAssetId: null, targetCryptoAssetId: null,
  sourceNetwork: null, targetNetwork: null, paymentMethod: null, payoutMethod: null,
  sourceSettlementOptionId: null, targetSettlementOptionId: null,
  minAmount: "10", maxAmount: "100", exactRate: null, markupBasisPoints: 0,
  adjustmentDirection: "MARKUP", fixedFee: null, amountBasedPricingEnabled: false,
  amountBasedPricingTiers: [], rangeOnlyPricing: false,
  operatorInstructions: null, customerInstructions: null, expectedSettlementMinutes: null,
  version: 1, createdAt: new Date(), updatedAt: new Date(), ...patch,
});
const fiat = { id: "fiat:eur:paypal", assetCode: "EUR", routeNetwork: "fiat", kind: "fiat-payment-method" as const,
  direction: "send" as const, minAmount: "20", maxAmount: "90", reserve: "500" };
const btc = { id: "crypto:btc", assetId: "bitcoin", assetCode: "BTC", routeNetwork: "BITCOIN",
  kind: "crypto-network" as const, direction: "receive" as const };
const eth = { ...btc, id: "crypto:eth", assetId: "ethereum", assetCode: "ETH", routeNetwork: "ERC20" };
function direction(patch: Partial<SyncedBestchangeDirection> = {}): SyncedBestchangeDirection {
  return {
    id: "10000000-0000-4000-8000-000000000001", enabled: false,
    sourceOptionId: fiat.id, targetOptionId: btc.id, fromCode: "PPEUR", toCode: "BTC",
    reserve: "10", minAmount: "10", maxAmount: "100", params: [], cities: [],
    selectedAddOnKeys: [], includeFeeTags: false, ...patch,
  };
}
test("all current and future covered manual routes appear without inventing codes or reserves", () => {
  const before = syncBestchangeDirections([], [fiat, btc], [rule()]);
  assert.equal(before.length, 1);
  assert.equal(before[0].automatic, true);
  assert.equal(before[0].fromCode, "");
  assert.equal(before[0].toCode, "");
  assert.equal(before[0].reserve, "0");
  assert.equal(before[0].minAmount, "20");
  assert.equal(before[0].maxAmount, "90");
  assert.equal(before[0].pendingReasons?.length, 3);
  const after = syncBestchangeDirections([], [fiat, btc, eth], [rule({ id: "replacement", name: "Renamed" })]);
  assert.equal(after.length, 2);
  assert.equal(after.find(d => d.targetOptionId === btc.id)?.id, before[0].id);
  assert.ok(isAutomaticBestchangeDirection(before[0]));
  assert.notEqual(automaticBestchangeDirectionId(fiat.id, btc.id), automaticBestchangeDirectionId(btc.id, fiat.id));
});
test("disabled and configured operator routes survive; ready new routes inherit only exact-option declarations", () => {
  const saved = [
    direction(),
    direction({ id: "10000000-0000-4000-8000-000000000002", sourceOptionId: "unavailable-source",
      targetOptionId: eth.id, fromCode: "BTC", toCode: "ETH", reserve: "123" }),
  ];
  const result = syncBestchangeDirections(saved, [fiat, btc, eth], [rule()]);
  assert.equal(result.length, 3);
  assert.equal(result[0].enabled, false);
  assert.equal(result[0].minAmount, "10");
  const added = result.find(d => d.automatic)!;
  assert.equal(added.enabled, true);
  assert.equal(added.fromCode, "PPEUR");
  assert.equal(added.toCode, "ETH");
  assert.equal(added.reserve, "123");
  assert.deepEqual(added.pendingReasons, []);
  assert.equal(saved[0].automatic, undefined, "read-only projection must not mutate saved settings");
});
test("ambiguous option codes/reserves stay pending and are never inferred from labels", () => {
  const result = syncBestchangeDirections([
    direction(),
    direction({ id: "other", sourceOptionId: fiat.id, targetOptionId: "removed", fromCode: "BTC" }),
  ], [fiat, btc, eth], [rule()]);
  assert.equal(result.find(d => d.automatic)?.fromCode, "");
  assert.ok(result.find(d => d.automatic)?.pendingReasons?.some(reason => reason.includes("From code")));
});
test("asset/all-network rules expand concrete crypto identities, not other assets or crypto-only Convert routes", () => {
  const source = { ...fiat, direction: "receive" as const };
  const options = [{ ...btc, direction: "send" as const }, { ...eth, direction: "send" as const }, source];
  const result = syncBestchangeDirections([], options, [rule({
    sourceCryptoAssetId: "ethereum", sourceNetwork: "__ALL_NETWORKS__", targetAsset: "EUR",
  })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceOptionId, eth.id);
  assert.equal(result[0].targetOptionId, source.id);
  assert.equal(syncBestchangeDirections([], [btc, eth], [rule()]).length, 0);
});
test("reciprocal discovery requires an exact rate, matching executable Swap semantics", () => {
  const reversed = rule({ sourceAsset: "BTC", targetAsset: "EUR" });
  assert.equal(syncBestchangeDirections([], [fiat, btc], [reversed]).length, 0);
  assert.equal(syncBestchangeDirections([], [fiat, btc], [{ ...reversed, exactRate: "100" }]).length, 1);
});
test("automatic disable persists and removed pricing becomes pending instead of silently publishing", () => {
  const first = syncBestchangeDirections([], [fiat, btc], [rule()])[0];
  first.enabled = false;
  const next = syncBestchangeDirections([first], [fiat, btc], [rule()]);
  assert.equal(next[0].enabled, false);
  const unavailable = syncBestchangeDirections([first], [fiat, btc], []);
  assert.match(unavailable[0].pendingReasons![0], /No currently available/);
});
test("directions are not silently capped at fifty", () => {
  const manyFiat = Array.from({ length: 70 }, (_, i) => ({ ...fiat, id: `fiat:eur:method-${i}` }));
  assert.equal(syncBestchangeDirections([], [...manyFiat, btc], [rule()]).length, 70);
});
test("duplicate BestChange code pairs stay pending instead of creating conflicting XML entries", () => {
  const first = direction({ enabled: true });
  const secondFiat = { ...fiat, id: "fiat:eur:another" };
  const declaration = direction({ id: "other", sourceOptionId: secondFiat.id, targetOptionId: "removed", enabled: false });
  const result = syncBestchangeDirections([first, declaration], [fiat, secondFiat, btc], [rule()]);
  assert.ok(result.find(d => d.automatic)?.pendingReasons?.some(reason => reason.includes("overlapping city")));
});
test("bounded range-only tiers seed limits; zero or unbounded minima/maxima stay pending", () => {
  const ranged = rule({ rangeOnlyPricing: true, amountBasedPricingEnabled: true,
    amountBasedPricingTiers: [{ minAmount: "25", maxAmount: "75", percentage: "0", direction: "MARKUP" }] });
  const first = syncBestchangeDirections([], [fiat, btc], [ranged])[0];
  assert.equal(first.minAmount, "25"); assert.equal(first.maxAmount, "75");
  const unboundedFiat = { ...fiat, minAmount: undefined, maxAmount: undefined };
  const missing = syncBestchangeDirections([], [unboundedFiat, btc], [rule({ minAmount: null, maxAmount: null })])[0];
  assert.equal(missing.minAmount, "0"); assert.equal(missing.maxAmount, "0");
  assert.ok(missing.pendingReasons?.some(reason => reason.includes("limits")));
});
test("new exact pricing paths remain visible pending when settlement options are unavailable", () => {
  const result = syncBestchangeDirections([], [btc], [rule({
    sourceSettlementOptionId: "fiat:missing:bank", targetSettlementOptionId: btc.id,
  })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceOptionId, "fiat:missing:bank");
  assert.ok(result[0].pendingReasons?.some(reason => reason.includes("settlement option is unavailable")));
  const completelyMissing = syncBestchangeDirections([], [], [rule({
    sourceSettlementOptionId: "fiat:missing:bank", targetSettlementOptionId: "crypto:missing",
  })]);
  assert.equal(completelyMissing.length, 1);
  assert.ok(completelyMissing[0].pendingReasons?.length);
});
test("exact crypto send paths stay pending while preserving valid receive directions and input metadata", () => {
  const receiveFiat = { ...fiat, direction: "both" as const };
  const exact = rule({ sourceSettlementOptionId: btc.id, targetSettlementOptionId: fiat.id });
  const result = syncBestchangeDirections([], [receiveFiat, btc], [exact, rule()]);
  assert.equal(result.length, 2);
  assert.ok(result.find(d => d.sourceOptionId === btc.id)?.pendingReasons?.some(reason => reason.includes("unavailable")));
  assert.ok(!result.find(d => d.targetOptionId === btc.id)?.pendingReasons?.some(reason => reason.includes("unavailable")));
  assert.equal(btc.direction, "receive", "projection must not mutate catalog options");
});
test("disabled exact pricing paths remain pending and never enable pricing", () => {
  const result = syncBestchangeDirections([], [fiat, btc], [rule({
    enabled: false, sourceSettlementOptionId: fiat.id, targetSettlementOptionId: btc.id,
  })]);
  assert.equal(result.length, 1);
  assert.match(result[0].pendingReasons![0], /No currently available Manual Pricing/);
});
