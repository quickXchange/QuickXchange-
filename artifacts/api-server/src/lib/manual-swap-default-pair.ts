import { eq } from "drizzle-orm";
import {
  db,
  manualDeskPricingRulesTable,
  swapDefaultPairSettingsTable,
  type ManualDeskPricingRule,
} from "@workspace/db";
import {
  evaluateManualPricingCoverage,
  type ManualPricingCoveragePair,
} from "./manual-desk-pricing";
import {
  listPublicManualCryptoSettlementOptions,
  type ManualCryptoOption,
} from "./manual-crypto";
import { listPublicFiatSettlementOptions } from "./payment-methods";

type ManualFiatOption = Awaited<ReturnType<typeof listPublicFiatSettlementOptions>>[number];

export type PublicManualSwapData = {
  cryptoOptions: ManualCryptoOption[];
  fiatOptions: ManualFiatOption[];
  pricingRules: ManualDeskPricingRule[];
};

let testSource: (() => Promise<PublicManualSwapData>) | undefined;

export function configureManualSwapDefaultPairSourceForTests(
  source: (() => Promise<PublicManualSwapData>) | undefined,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Manual Swap default pair test sources require NODE_ENV=test.");
  }
  testSource = source;
}

export async function loadPublicManualSwapData(): Promise<PublicManualSwapData> {
  if (process.env.NODE_ENV === "test" && testSource) {
    return testSource();
  }
  const [cryptoOptions, fiatOptions, pricingRules] = await Promise.all([
    listPublicManualCryptoSettlementOptions(),
    listPublicFiatSettlementOptions(),
    db.select().from(manualDeskPricingRulesTable)
      .where(eq(manualDeskPricingRulesTable.enabled, true)),
  ]);
  return { cryptoOptions, fiatOptions, pricingRules };
}

export async function getPublicManualSwapCoverage() {
  const data = await loadPublicManualSwapData();
  const options = [...data.cryptoOptions, ...data.fiatOptions];
  return {
    ...data,
    options,
    coverage: evaluateManualPricingCoverage(data.pricingRules, options),
  };
}

export async function getPersistedSwapDefaultPair(): Promise<ManualPricingCoveragePair | null> {
  const [row] = await db.select().from(swapDefaultPairSettingsTable)
    .where(eq(swapDefaultPairSettingsTable.id, "global"))
    .limit(1);
  return row ? {
    sourceSettlementOptionId: row.sourceSettlementOptionId,
    targetSettlementOptionId: row.targetSettlementOptionId,
  } : null;
}

export async function savePersistedSwapDefaultPair(pair: ManualPricingCoveragePair) {
  await db.insert(swapDefaultPairSettingsTable)
    .values({
      id: "global",
      sourceSettlementOptionId: pair.sourceSettlementOptionId,
      targetSettlementOptionId: pair.targetSettlementOptionId,
    })
    .onConflictDoUpdate({
      target: swapDefaultPairSettingsTable.id,
      set: {
        sourceSettlementOptionId: pair.sourceSettlementOptionId,
        targetSettlementOptionId: pair.targetSettlementOptionId,
      },
    });
  return pair;
}

export async function getEffectiveSwapDefaultPair(
  coveredRoutes: readonly ManualPricingCoveragePair[],
): Promise<ManualPricingCoveragePair | undefined> {
  const saved = await getPersistedSwapDefaultPair();
  if (saved && coveredRoutes.some((route) =>
    route.sourceSettlementOptionId === saved.sourceSettlementOptionId &&
    route.targetSettlementOptionId === saved.targetSettlementOptionId
  )) {
    return saved;
  }
  return coveredRoutes[0];
}