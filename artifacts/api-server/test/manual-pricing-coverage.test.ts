import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateManualPricingCoverage,
  type ManualPricingContext,
  type ManualPricingSettlementOption,
} from "../src/lib/manual-desk-pricing";

type Rule = ManualPricingContext & {
  id: string;
  priority: number;
  enabled: boolean;
  exactRate: string | null;
};

const options: ManualPricingSettlementOption[] = [
  {
    id: "fiat:usd:bank",
    assetCode: "USD",
    routeNetwork: "BANK",
    kind: "fiat-payment-method",
    direction: "both",
  },
  {
    id: "fiat:eur:bank",
    assetCode: "EUR",
    routeNetwork: "BANK",
    kind: "fiat-payment-method",
    direction: "both",
  },
  {
    id: "crypto:bitcoin",
    assetCode: "BTC",
    routeNetwork: "Bitcoin",
    kind: "crypto-network",
    direction: "receive",
  },
];

function rule(overrides: Partial<Rule> = {}): Rule {
  return { id: "rule", priority: 0, enabled: true, exactRate: null, ...overrides };
}

test("reports only an enabled truly selector-free rule as the Any-to-Any fallback", () => {
  assert.equal(evaluateManualPricingCoverage([
    rule({ id: "disabled", enabled: false }),
    rule({ id: "selected", sourceAsset: "USD" }),
  ], options).hasEnabledAnyToAnyFallback, false);
  assert.equal(evaluateManualPricingCoverage([
    rule({ id: "fallback" }),
  ], options).hasEnabledAnyToAnyFallback, true);
});

test("flags every rule which references an option outside the public manual catalog", () => {
  const result = evaluateManualPricingCoverage([
    rule({ id: "source-orphan", sourceSettlementOptionId: "missing-source" }),
    rule({ id: "target-orphan", targetSettlementOptionId: "missing-target", enabled: false }),
    rule({ id: "valid", sourceSettlementOptionId: "FIAT:USD:BANK" }),
  ], options);
  assert.deepEqual(result.orphanRules, [
    { ruleId: "source-orphan", missingSettlementOptionIds: ["missing-source"] },
    { ruleId: "target-orphan", missingSettlementOptionIds: ["missing-target"] },
  ]);
});

test("identifies uncovered active directed pairs and excludes invalid same-route pairs", () => {
  const result = evaluateManualPricingCoverage([
    rule({
      id: "usd-to-btc",
      sourceSettlementOptionId: "fiat:usd:bank",
      targetSettlementOptionId: "crypto:bitcoin",
      exactRate: "4",
    }),
    rule({
      id: "orphan-wildcard",
      sourceSettlementOptionId: "missing-source",
      targetSettlementOptionId: null,
    }),
  ], options);
  assert.deepEqual(result.coveredRoutes, [{
    sourceSettlementOptionId: "fiat:usd:bank",
    targetSettlementOptionId: "crypto:bitcoin",
  }]);
  assert.ok(result.uncoveredRoutes.some((pair) =>
    pair.sourceSettlementOptionId === "fiat:eur:bank" &&
    pair.targetSettlementOptionId === "fiat:usd:bank"));
  assert.ok(![...result.coveredRoutes, ...result.uncoveredRoutes].some((pair) =>
    pair.sourceSettlementOptionId === pair.targetSettlementOptionId));
});

test("coverage includes reciprocal exact and executable legacy selector rules", () => {
  const result = evaluateManualPricingCoverage([
    rule({
      id: "eur-source",
      sourceAsset: "EUR",
      sourceSettlementOptionId: "fiat:eur:bank",
    }),
  ], options);
  assert.ok(result.coveredRoutes.length > 0);
  const exact = evaluateManualPricingCoverage([
    rule({
      id: "eur-source-exact",
      sourceAsset: "EUR",
      targetAsset: "USD",
      sourceSettlementOptionId: "fiat:eur:bank",
      targetSettlementOptionId: "fiat:usd:bank",
      exactRate: "1.1",
    }),
  ], options);
  assert.deepEqual(exact.coveredRoutes, [
    {
      sourceSettlementOptionId: "fiat:usd:bank",
      targetSettlementOptionId: "fiat:eur:bank",
    },
    {
      sourceSettlementOptionId: "fiat:eur:bank",
      targetSettlementOptionId: "fiat:usd:bank",
    },
  ]);
});