type NullableString = string | null;
type JsonRecord = Record<string, unknown>;

export type WorkspaceConfigSnapshot = {
  schemaVersion: 1;
  source: { environment: "development"; exportedAt: string };
  cryptoAssets: Array<{ id: string; code: string; name: string; logoObjectPath: NullableString; decimals: number; lifecycle: string; enabled: boolean }>;
  cryptoNetworks: Array<{ id: string; assetId: string; networkCode: string; networkName: string; logoObjectPath: NullableString; networkFamily: string; decimals: number; executionMode: string; depositProvider: string; lifecycle: string; regions: string[]; enabled: boolean; requiresMemo: boolean; requiredConfirmations: number; confirmationGuidance: NullableString; explorerUrlTemplate: NullableString; depositInstructions: NullableString; depositWarning: NullableString }>;
  fiatCurrencies: Array<{ id: string; code: string; name: string; flagObjectPath: NullableString; network: string; precision: number; lifecycle: string; regions: string[]; countries: string[]; enabled: boolean; rateMode: string; manualRate: NullableString }>;
  paymentMethods: Array<{ id: string; name: string; logoObjectPath: NullableString; description: NullableString; instructions: NullableString; family: string; executionMode: string; providerId: NullableString; lifecycle: string; regions: string[]; countries: string[]; requiresProviderConfiguration: boolean; enabled: boolean; canSend: boolean; canReceive: boolean; fieldDefinitions: JsonRecord[] }>;
  fiatCurrencyPaymentMethods: Array<{ fiatCode: string; paymentMethodId: string; enabled: boolean; canSend: boolean | null; canReceive: boolean | null; sendInstructions: NullableString; receiveInstructions: NullableString; minAmount: NullableString; maxAmount: NullableString; countries: string[] }>;
  manualDeskPricingRules: Array<{ id: string; name: string; sourceAsset: NullableString; targetAsset: NullableString; sourceCryptoAssetId: NullableString; targetCryptoAssetId: NullableString; sourceNetwork: NullableString; targetNetwork: NullableString; paymentMethod: NullableString; payoutMethod: NullableString; sourceSettlementOptionId: NullableString; targetSettlementOptionId: NullableString; minAmount: NullableString; maxAmount: NullableString; operatorInstructions: NullableString; customerInstructions: NullableString; expectedSettlementMinutes: number | null; markupBasisPoints: number; adjustmentDirection: string; fixedFee: NullableString; exactRate: NullableString; priority: number; enabled: boolean }>;
  site: {
    publishedPages: Array<{ pageKey: string; content: JsonRecord }>;
    publication: { navigation: JsonRecord[]; partnerLogos: JsonRecord[]; socialTrust: JsonRecord } | null;
  };
  landingBackground: { mode: "preset"; presetId: string; focalX: number; focalY: number; placements: JsonRecord } | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyString(value: JsonRecord, key: string): boolean {
  return typeof value[key] === "string" && String(value[key]).trim().length > 0;
}

export function parseWorkspaceConfigSnapshot(value: unknown): WorkspaceConfigSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("Unsupported workspace configuration schema.");
  if (!isRecord(value.source) || value.source.environment !== "development" || !hasNonEmptyString(value.source, "exportedAt")) {
    throw new Error("Snapshot source must identify the development environment.");
  }
  const arrayKeys = ["cryptoAssets", "cryptoNetworks", "fiatCurrencies", "paymentMethods", "fiatCurrencyPaymentMethods", "manualDeskPricingRules"] as const;
  for (const key of arrayKeys) if (!Array.isArray(value[key])) throw new Error(`${key} must be an array.`);
  if (!isRecord(value.site) || !Array.isArray(value.site.publishedPages) || !(value.site.publication === null || isRecord(value.site.publication))) {
    throw new Error("Invalid site configuration.");
  }
  if (!(value.landingBackground === null || (
    isRecord(value.landingBackground)
    && value.landingBackground.mode === "preset"
    && hasNonEmptyString(value.landingBackground, "presetId")
    && Number.isInteger(value.landingBackground.focalX)
    && Number.isInteger(value.landingBackground.focalY)
    && isRecord(value.landingBackground.placements)
  ))) throw new Error("Landing background must be a validated built-in preset.");
  const requiredStrings: Array<[keyof WorkspaceConfigSnapshot, string[]]> = [
    ["cryptoAssets", ["id", "code", "name"]],
    ["cryptoNetworks", ["id", "assetId", "networkCode", "networkName"]],
    ["fiatCurrencies", ["id", "code", "name"]],
    ["paymentMethods", ["id", "name"]],
    ["fiatCurrencyPaymentMethods", ["fiatCode", "paymentMethodId"]],
    ["manualDeskPricingRules", ["id", "name"]],
  ];
  for (const [key, fields] of requiredStrings) {
    for (const row of value[key] as unknown[]) {
      if (!isRecord(row) || fields.some((field) => !hasNonEmptyString(row, field))) throw new Error(`Invalid ${key} row.`);
    }
  }
  for (const page of value.site.publishedPages) {
    if (!isRecord(page) || !hasNonEmptyString(page, "pageKey") || !isRecord(page.content)) throw new Error("Invalid published site page.");
  }
  return value as unknown as WorkspaceConfigSnapshot;
}

export type SyncCounts = {
  add: number;
  update: number;
  softDisable: number;
  unchanged: number;
};

export type WorkspaceConfigDiff = Record<string, SyncCounts>;

export function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function validateSnapshotReferences(snapshot: WorkspaceConfigSnapshot): string[] {
  const errors: string[] = [];
  const strandedTestFixture = /^(?:bulk|wallet)-(?:asset|network)-/;
  const assetIds = new Set(snapshot.cryptoAssets.map((asset) => asset.id));
  const assetCodes = new Set<string>();
  for (const duplicate of duplicateValues(snapshot.cryptoAssets.map((asset) => asset.id))) {
    errors.push(`Duplicate crypto asset id: ${duplicate}`);
  }
  for (const asset of snapshot.cryptoAssets) {
    if (strandedTestFixture.test(asset.id)) errors.push(`Test fixture crypto asset cannot be synchronized: ${asset.id}`);
    const code = asset.code.trim().toUpperCase();
    if (assetCodes.has(code)) errors.push(`Duplicate crypto asset code: ${asset.code}`);
    assetCodes.add(code);
  }
  const networkKeys = new Set<string>();
  const networkIds = new Set<string>();
  for (const network of snapshot.cryptoNetworks) {
    if (strandedTestFixture.test(network.id)) errors.push(`Test fixture crypto network cannot be synchronized: ${network.id}`);
    if (networkIds.has(network.id)) errors.push(`Duplicate crypto network id: ${network.id}`);
    networkIds.add(network.id);
    if (!assetIds.has(network.assetId)) errors.push(`Network ${network.id} references missing asset ${network.assetId}`);
    const key = `${network.assetId}:${network.networkCode.trim().toUpperCase()}`;
    if (networkKeys.has(key)) errors.push(`Duplicate crypto network key: ${key}`);
    networkKeys.add(key);
  }
  const fiatCodes = new Set<string>();
  const fiatIds = new Set<string>();
  for (const fiat of snapshot.fiatCurrencies) {
    if (fiatIds.has(fiat.id)) errors.push(`Duplicate fiat id: ${fiat.id}`);
    fiatIds.add(fiat.id);
    const code = fiat.code.trim().toUpperCase();
    if (fiatCodes.has(code)) errors.push(`Duplicate fiat code: ${fiat.code}`);
    fiatCodes.add(code);
  }
  const methodIds = new Set<string>();
  for (const method of snapshot.paymentMethods) {
    if (methodIds.has(method.id)) errors.push(`Duplicate payment method id: ${method.id}`);
    methodIds.add(method.id);
  }
  const linkKeys = new Set<string>();
  for (const link of snapshot.fiatCurrencyPaymentMethods) {
    const fiatCode = link.fiatCode.trim().toUpperCase();
    if (!fiatCodes.has(fiatCode)) errors.push(`Attachment ${fiatCode}:${link.paymentMethodId} references missing fiat code`);
    if (!methodIds.has(link.paymentMethodId)) errors.push(`Attachment ${fiatCode}:${link.paymentMethodId} references missing payment method`);
    const key = `${fiatCode}:${link.paymentMethodId}`;
    if (linkKeys.has(key)) errors.push(`Duplicate fiat/payment attachment: ${key}`);
    linkKeys.add(key);
  }
  const pricingIds = new Set<string>();
  for (const rule of snapshot.manualDeskPricingRules) {
    if (pricingIds.has(rule.id)) errors.push(`Duplicate pricing rule id: ${rule.id}`);
    pricingIds.add(rule.id);
    for (const [label, id] of [["source", rule.sourceCryptoAssetId], ["target", rule.targetCryptoAssetId]] as const) {
      if (id && !assetIds.has(id)) errors.push(`Pricing rule ${rule.id} ${label} references missing asset ${id}`);
    }
    for (const [label, id] of [["source", rule.sourceSettlementOptionId], ["target", rule.targetSettlementOptionId]] as const) {
      if (!id) continue;
      const parts = id.split(":");
      if (parts[0] === "crypto" && parts.length === 2 && networkIds.has(parts[1]!)) continue;
      if (parts[0] === "fiat" && parts.length >= 3 && fiatIds.has(parts[1]!) && methodIds.has(parts.slice(2).join(":"))) continue;
      errors.push(`Pricing rule ${rule.id} ${label} has unresolved settlement option ${id}`);
    }
  }
  const pageKeys = duplicateValues(snapshot.site.publishedPages.map((page) => page.pageKey));
  for (const key of pageKeys) errors.push(`Duplicate published site page: ${key}`);
  return errors;
}

export function diffKeys(
  sourceKeys: string[],
  targetKeys: string[],
  changedKeys: string[] = [],
): SyncCounts {
  const source = new Set(sourceKeys);
  const target = new Set(targetKeys);
  const changed = new Set(changedKeys);
  return {
    add: [...source].filter((key) => !target.has(key)).length,
    update: [...source].filter((key) => target.has(key) && changed.has(key)).length,
    softDisable: [...target].filter((key) => !source.has(key)).length,
    unchanged: [...source].filter((key) => target.has(key) && !changed.has(key)).length,
  };
}