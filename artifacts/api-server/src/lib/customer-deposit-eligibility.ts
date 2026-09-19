import {
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  type CryptoAssetNetwork,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  getWhitebitCapabilities,
  matchWhitebitCapability,
  whitebitSwapStatus,
  type WhitebitCapabilitySnapshot,
} from "./whitebit-capabilities";
import {
  isSyntacticallyValidManualWalletAddress,
  isSyntacticallyValidManualWalletMemo,
} from "./manual-wallet-validation";

type EligibilityNetwork = Pick<
  CryptoAssetNetwork,
  | "id"
  | "networkCode"
  | "networkName"
  | "networkFamily"
  | "depositProvider"
  | "requiresMemo"
  | "sharedDepositAddress"
  | "sharedDepositMemo"
>;

export type CustomerDepositEligibilityContext = {
  whitebitReady: boolean;
  whitebitCapabilities: WhitebitCapabilitySnapshot | null;
};

type EligibilityExecutor = Pick<typeof db, "select" | "update">;

export async function createCustomerDepositEligibilityContext(): Promise<CustomerDepositEligibilityContext> {
  const status = await whitebitSwapStatus();
  if (!status.enabled || status.state !== "ready" || !status.credentialsReady) {
    return { whitebitReady: false, whitebitCapabilities: null };
  }
  try {
    return {
      whitebitReady: true,
      whitebitCapabilities: await getWhitebitCapabilities(),
    };
  } catch {
    return { whitebitReady: false, whitebitCapabilities: null };
  }
}

export function hasUsableSavedReceivingWallet(network: EligibilityNetwork): boolean {
  if (!isSyntacticallyValidManualWalletAddress(network, network.sharedDepositAddress)) return false;
  return !network.requiresMemo ||
    isSyntacticallyValidManualWalletMemo(network, network.sharedDepositMemo ?? "");
}

export function isCustomerDepositEligible(
  assetCode: string,
  network: EligibilityNetwork,
  context: CustomerDepositEligibilityContext,
): boolean {
  if (network.depositProvider === "none") return false;
  if (hasUsableSavedReceivingWallet(network)) return true;
  if (
    network.depositProvider === "whitebit" &&
    context.whitebitReady &&
    context.whitebitCapabilities
  ) {
    return Boolean(matchWhitebitCapability(
      context.whitebitCapabilities,
      assetCode,
      network.networkCode,
    ));
  }
  return false;
}

export async function reconcileCryptoCustomerDepositEligibilityWithExecutor(
  executor: EligibilityExecutor,
  context: CustomerDepositEligibilityContext,
) {
    const rows = await executor.select({
      network: cryptoAssetNetworksTable,
      assetCode: cryptoAssetsTable.code,
    }).from(cryptoAssetNetworksTable)
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id))
      .for("update");
    const eligibleIds = new Set(rows
      .filter(({ assetCode, network }) => isCustomerDepositEligible(assetCode, network, context))
      .map(({ network }) => network.id));
    const enabledIds = [...eligibleIds];
    const disabledIds = rows
      .filter(({ network }) => !eligibleIds.has(network.id))
      .map(({ network }) => network.id);
    if (enabledIds.length) {
      await executor.update(cryptoAssetNetworksTable)
        .set({ customerDepositsEnabled: true })
        .where(inArray(cryptoAssetNetworksTable.id, enabledIds));
    }
    if (disabledIds.length) {
      await executor.update(cryptoAssetNetworksTable)
        .set({ customerDepositsEnabled: false })
        .where(inArray(cryptoAssetNetworksTable.id, disabledIds));
    }
    return {
      enabled: enabledIds.length,
      remainedDisabled: disabledIds.length,
      changed: rows.filter(({ network }) =>
        network.customerDepositsEnabled !== eligibleIds.has(network.id)
      ).length,
    };
}

export async function reconcileCryptoCustomerDepositEligibility() {
  const context = await createCustomerDepositEligibilityContext();
  return db.transaction(async (tx) => {
    return reconcileCryptoCustomerDepositEligibilityWithExecutor(tx, context);
  });
}