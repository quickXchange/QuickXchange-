import assert from "node:assert/strict";
import test from "node:test";
import {
  customerDepositEligibilityDeterminants,
  parseWorkspaceConfigSnapshot,
  projectWorkspaceCryptoNetwork,
  reactivatePaymentMethodsForEnabledLinks,
  validateSnapshotReferences,
  type WorkspaceConfigSnapshot,
} from "../src/lib/workspace-config-sync-helpers";

function snapshot(): WorkspaceConfigSnapshot {
  return {
    schemaVersion: 1,
    source: { environment: "development", exportedAt: "2026-09-19T00:00:00.000Z" },
    objects: [{
      path: "/objects/social-trust-icons/551a497c-8359-4e33-8819-5cc09e457859",
      contentType: "image/png",
      sha256: "0".repeat(64),
      base64: "AA==",
    }],
    cryptoAssets: [],
    cryptoNetworks: [],
    fiatCurrencies: [],
    paymentMethods: [],
    fiatCurrencyPaymentMethods: [],
    manualDeskPricingRules: [],
    site: { publishedPages: [], publication: null },
    landingBackground: null,
  };
}

test("accepts a development snapshot with a bounded object bundle", () => {
  const parsed = parseWorkspaceConfigSnapshot(snapshot());
  assert.equal(parsed.objects?.length, 1);
  assert.deepEqual(validateSnapshotReferences(parsed), []);
});

test("defaults legacy crypto network snapshots to manual wallet tracking enabled", () => {
  const input = snapshot();
  input.cryptoNetworks = [{
    id: "btc-bitcoin",
    assetId: "btc",
    networkCode: "BTC",
    networkName: "Bitcoin",
    logoObjectPath: null,
    networkFamily: "bitcoin",
    decimals: 8,
    executionMode: "manual",
    depositProvider: "manual",
    lifecycle: "active",
    regions: [],
    enabled: true,
    requiresMemo: false,
    requiredConfirmations: 1,
    confirmationGuidance: null,
    explorerUrlTemplate: null,
    depositInstructions: null,
    depositWarning: null,
  } as (typeof input.cryptoNetworks)[number]];

  const parsed = parseWorkspaceConfigSnapshot(input);

  assert.equal(parsed.cryptoNetworks[0]?.manualWalletTrackingEnabled, true);
});

test("preserves an explicit manual wallet tracking OFF value in snapshots", () => {
  const input = snapshot();
  input.cryptoNetworks = [{
    id: "btc-bitcoin",
    assetId: "btc",
    networkCode: "BTC",
    networkName: "Bitcoin",
    logoObjectPath: null,
    networkFamily: "bitcoin",
    decimals: 8,
    executionMode: "manual",
    depositProvider: "manual",
    manualWalletTrackingEnabled: false,
    lifecycle: "active",
    regions: [],
    enabled: true,
    requiresMemo: false,
    requiredConfirmations: 1,
    confirmationGuidance: null,
    explorerUrlTemplate: null,
    depositInstructions: null,
    depositWarning: null,
  }];

  const parsed = parseWorkspaceConfigSnapshot(input);

  assert.equal(parsed.cryptoNetworks[0]?.manualWalletTrackingEnabled, false);
});

test("workspace snapshots preserve amount tiers and existing manual pricing route identity", () => {
  const input = snapshot();
  const rule: WorkspaceConfigSnapshot["manualDeskPricingRules"][number] = {
    id: "8e6f84f6-1dd0-4c2c-a04a-d6861c872f00",
    name: "USD to EUR tiered",
    sourceAsset: "USD",
    targetAsset: "EUR",
    sourceCryptoAssetId: null,
    targetCryptoAssetId: null,
    sourceNetwork: "BANK TRANSFER",
    targetNetwork: "SEPA",
    paymentMethod: "BANK TRANSFER",
    payoutMethod: "WALLET",
    sourceSettlementOptionId: "fiat-payment-method:usd-bank-transfer",
    targetSettlementOptionId: "fiat-payment-method:eur-sepa",
    minAmount: null,
    maxAmount: null,
    operatorInstructions: null,
    customerInstructions: null,
    expectedSettlementMinutes: null,
    markupBasisPoints: 200,
    adjustmentDirection: "MARKUP",
    amountBasedPricingEnabled: true,
    amountBasedPricingTiers: [
      { minAmount: "0", maxAmount: null, percentage: "1.005", direction: "GIVE_MORE" },
    ],
    fixedFee: "0.10",
    exactRate: null,
    priority: 10,
    enabled: true,
  };
  input.manualDeskPricingRules = [rule];

  const parsed = parseWorkspaceConfigSnapshot(input);
  const restored = parsed.manualDeskPricingRules[0]!;

  assert.equal(restored.id, rule.id);
  assert.equal(restored.sourceSettlementOptionId, rule.sourceSettlementOptionId);
  assert.equal(restored.targetSettlementOptionId, rule.targetSettlementOptionId);
  assert.equal(restored.sourceAsset, rule.sourceAsset);
  assert.equal(restored.targetAsset, rule.targetAsset);
  assert.equal(restored.amountBasedPricingEnabled, true);
  assert.deepEqual(restored.amountBasedPricingTiers, rule.amountBasedPricingTiers);
});

test("legacy workspace snapshots default amount pricing to disabled and empty tiers", () => {
  const input = snapshot();
  const legacyRule: WorkspaceConfigSnapshot["manualDeskPricingRules"][number] = {
    id: "8e6f84f6-1dd0-4c2c-a04a-d6861c872f00",
    name: "Legacy pricing rule",
    sourceAsset: null,
    targetAsset: null,
    sourceCryptoAssetId: null,
    targetCryptoAssetId: null,
    sourceNetwork: null,
    targetNetwork: null,
    paymentMethod: null,
    payoutMethod: null,
    sourceSettlementOptionId: null,
    targetSettlementOptionId: null,
    minAmount: null,
    maxAmount: null,
    operatorInstructions: null,
    customerInstructions: null,
    expectedSettlementMinutes: null,
    markupBasisPoints: 60,
    adjustmentDirection: "MARKUP",
    fixedFee: null,
    exactRate: null,
    priority: -10,
    enabled: true,
  };
  input.manualDeskPricingRules = [legacyRule];

  const restored = parseWorkspaceConfigSnapshot(input).manualDeskPricingRules[0]!;

  assert.equal(restored.amountBasedPricingEnabled, false);
  assert.deepEqual(restored.amountBasedPricingTiers, []);
});

test("includes manual wallet tracking in crypto network export, comparison, hash, and apply projection", () => {
  const network = {
    id: "btc-bitcoin",
    assetId: "btc",
    networkCode: "BTC",
    networkName: "Bitcoin",
    logoObjectPath: null,
    networkFamily: "bitcoin",
    decimals: 8,
    executionMode: "manual",
    depositProvider: "manual",
    manualWalletTrackingEnabled: false,
    lifecycle: "active",
    regions: [],
    enabled: true,
    requiresMemo: false,
    requiredConfirmations: 1,
    confirmationGuidance: null,
    explorerUrlTemplate: null,
    depositInstructions: null,
    depositWarning: null,
  };

  const projection = projectWorkspaceCryptoNetwork(network, "btc-target");
  const enabledProjection = projectWorkspaceCryptoNetwork({
    ...network,
    manualWalletTrackingEnabled: true,
  }, "btc-target");

  assert.equal(projection.manualWalletTrackingEnabled, false);
  assert.equal(projection.assetId, "btc-target");
  assert.notDeepEqual(projection, enabledProjection);
});

test("rejects invalid manual wallet tracking values in snapshots", () => {
  const input = snapshot();
  input.cryptoNetworks = [{
    id: "btc-bitcoin",
    assetId: "btc",
    networkCode: "BTC",
    networkName: "Bitcoin",
    logoObjectPath: null,
    networkFamily: "bitcoin",
    decimals: 8,
    executionMode: "manual",
    depositProvider: "manual",
    manualWalletTrackingEnabled: "false",
    lifecycle: "active",
    regions: [],
    enabled: true,
    requiresMemo: false,
    requiredConfirmations: 1,
    confirmationGuidance: null,
    explorerUrlTemplate: null,
    depositInstructions: null,
    depositWarning: null,
  } as unknown as (typeof input.cryptoNetworks)[number]];

  assert.throws(
    () => parseWorkspaceConfigSnapshot(input),
    /Invalid cryptoNetworks row/,
  );
});

test("rejects duplicate bundled object paths", () => {
  const input = snapshot();
  input.objects = [input.objects![0]!, input.objects![0]!];
  assert.throws(
    () => parseWorkspaceConfigSnapshot(input),
    /Duplicate bundled object/,
  );
});

test("rejects malformed bundled object hashes", () => {
  const input = snapshot();
  input.objects![0]!.sha256 = "not-a-sha256";
  assert.throws(
    () => parseWorkspaceConfigSnapshot(input),
    /Invalid bundled configuration object/,
  );
});

test("reactivates a disabled payment method when its reviewed currency link is enabled", () => {
  const input = snapshot();
  input.paymentMethods = [{
    id: "bank-transfer",
    name: "Bank transfer",
    logoObjectPath: null,
    description: null,
    instructions: null,
    family: "bank-transfer",
    executionMode: "manual",
    providerId: null,
    lifecycle: "active",
    regions: [],
    countries: [],
    requiresProviderConfiguration: false,
    enabled: false,
    canSend: true,
    canReceive: true,
    fieldDefinitions: [],
  }];
  input.fiatCurrencyPaymentMethods = [{
    fiatCode: "EUR",
    paymentMethodId: "bank-transfer",
    enabled: true,
    canSend: true,
    canReceive: true,
    sendInstructions: null,
    receiveInstructions: null,
    minAmount: null,
    maxAmount: null,
    countries: [],
  }];

  const normalized = reactivatePaymentMethodsForEnabledLinks(input);

  assert.equal(normalized.paymentMethods[0]?.enabled, true);
  assert.equal(input.paymentMethods[0]?.enabled, false);
});

test("keeps a disabled payment method disabled when all reviewed currency links are disabled", () => {
  const input = snapshot();
  input.paymentMethods = [{
    id: "bank-transfer",
    name: "Bank transfer",
    logoObjectPath: null,
    description: null,
    instructions: null,
    family: "bank-transfer",
    executionMode: "manual",
    providerId: null,
    lifecycle: "active",
    regions: [],
    countries: [],
    requiresProviderConfiguration: false,
    enabled: false,
    canSend: true,
    canReceive: true,
    fieldDefinitions: [],
  }];
  input.fiatCurrencyPaymentMethods = [{
    fiatCode: "EUR",
    paymentMethodId: "bank-transfer",
    enabled: false,
    canSend: true,
    canReceive: true,
    sendInstructions: null,
    receiveInstructions: null,
    minAmount: null,
    maxAmount: null,
    countries: [],
  }];

  const normalized = reactivatePaymentMethodsForEnabledLinks(input);

  assert.equal(normalized.paymentMethods[0]?.enabled, false);
});

test("deposit eligibility determinants change with provider, memo, and network identity", () => {
  const base = {
    networkCode: "TRC20",
    networkName: "Tron",
    networkFamily: "tron",
    depositProvider: "manual",
    requiresMemo: false,
    enabled: true,
    lifecycle: "active",
  };
  const asset = { code: "USDT", enabled: true, lifecycle: "active" };

  const current = customerDepositEligibilityDeterminants(base, asset);

  assert.deepEqual(
    current,
    customerDepositEligibilityDeterminants(
      { ...base },
      { ...asset, code: "usdt" },
    ),
  );
  assert.notDeepEqual(
    current,
    customerDepositEligibilityDeterminants(
      { ...base, depositProvider: "whitebit" },
      asset,
    ),
  );
  assert.notDeepEqual(
    current,
    customerDepositEligibilityDeterminants(
      { ...base, requiresMemo: true },
      asset,
    ),
  );
  assert.notDeepEqual(
    current,
    customerDepositEligibilityDeterminants(
      { ...base, networkCode: "ERC20" },
      asset,
    ),
  );
  assert.notDeepEqual(
    current,
    customerDepositEligibilityDeterminants(
      { ...base, enabled: false },
      asset,
    ),
  );
  assert.notDeepEqual(
    current,
    customerDepositEligibilityDeterminants(
      base,
      { ...asset, lifecycle: "deprecated" },
    ),
  );
});
