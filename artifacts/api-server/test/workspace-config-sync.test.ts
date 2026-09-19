import assert from "node:assert/strict";
import test from "node:test";
import {
  customerDepositEligibilityDeterminants,
  parseWorkspaceConfigSnapshot,
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
