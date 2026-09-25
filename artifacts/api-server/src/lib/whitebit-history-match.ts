import type { NormalizedDeposit } from "../routes/whitebit";
import { normalizeWhitebitHistoryDeposit, normalizeWhitebitMemo } from "../routes/whitebit";

export type PendingWhitebitOrder = {
  id: string;
  createdAt: Date;
  type: string;
  status: string;
  manualSettlementState: string | null;
  fundingStatus: string | null;
  fundingProviderSource: string | null;
  fromAsset: string;
  fromNetwork: string;
  sourceSettlementOptionId: string | null;
  depositAddress: string | null;
  depositMemo: string | null;
  amount: string;
  fundingDetailsSnapshot: unknown;
  settlementSnapshot: unknown;
};

export type ReadyWhitebitClaim = {
  orderId: string;
  createdAt: Date;
  status: string;
  ticker: string;
  providerTicker: string;
  network: string;
  address: string | null;
  memo: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function units(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function matchesFrozenWhitebitClaim(order: PendingWhitebitOrder, claim: ReadyWhitebitClaim): boolean {
  const funding = asRecord(order.fundingDetailsSnapshot);
  const settlement = asRecord(asRecord(order.settlementSnapshot).funding);
  const mappingAsset = funding.whitebitAssetCode;
  const mappingNetwork = funding.whitebitNetworkCode;
  const hasMappingAsset = typeof mappingAsset === "string" && Boolean(mappingAsset.trim());
  const hasMappingNetwork = typeof mappingNetwork === "string" && Boolean(mappingNetwork.trim());
  const validMappingFields = (mappingAsset == null || hasMappingAsset) &&
    (mappingNetwork == null || hasMappingNetwork) &&
    hasMappingAsset === hasMappingNetwork;
  const expectedProviderTicker = hasMappingAsset
    ? (mappingAsset as string).trim().toUpperCase()
    : order.fromAsset.trim().toUpperCase();
  const expectedProviderNetwork = hasMappingNetwork
    ? (mappingNetwork as string).trim().toUpperCase()
    : order.fromNetwork.trim().toUpperCase();
  return order.id === claim.orderId &&
    order.type === "manual" &&
    order.status === "awaiting funds" &&
    order.manualSettlementState === "awaiting_funds" &&
    order.fundingStatus === "ready_whitebit" &&
    order.fundingProviderSource === "whitebit" &&
    claim.status === "ready" &&
    Boolean(claim.address) &&
    claim.address === order.depositAddress &&
    validMappingFields &&
    claim.ticker.trim().toUpperCase() === order.fromAsset.trim().toUpperCase() &&
    claim.providerTicker.trim().toUpperCase() === expectedProviderTicker &&
    claim.network.trim().toUpperCase() === expectedProviderNetwork &&
    funding.networkId === order.sourceSettlementOptionId?.replace(/^crypto:/, "") &&
    funding.selectedProvider === "whitebit" &&
    funding.addressSource === "live_api" &&
    funding.address === claim.address &&
    settlement.address === claim.address &&
    normalizeWhitebitMemo(order.depositMemo) === normalizeWhitebitMemo(claim.memo) &&
    normalizeWhitebitMemo(funding.memo) === normalizeWhitebitMemo(claim.memo) &&
    normalizeWhitebitMemo(settlement.memo) === normalizeWhitebitMemo(claim.memo);
}

export type WhitebitHistoryMatch =
  | { kind: "none" }
  | { kind: "matched"; deposit: NormalizedDeposit }
  | { kind: "unsafe"; reason: string };

/**
 * Only a single exact, terminal, stable provider deposit is actionable.
 * Nonterminal rows remain pending. An ambiguous or mismatched response is
 * reported to Admin; it never reaches the general deposit processor.
 */
export function matchWhitebitHistoryForOrder(
  order: PendingWhitebitOrder,
  claim: ReadyWhitebitClaim,
  records: Record<string, unknown>[],
): WhitebitHistoryMatch {
  if (!matchesFrozenWhitebitClaim(order, claim)) return { kind: "unsafe", reason: "Frozen order/claim identity changed." };
  let matched: NormalizedDeposit | undefined;
  for (const record of records) {
    const deposit = normalizeWhitebitHistoryDeposit(record);
    if (!deposit) {
      if (Number.isInteger(record.status) && ![3, 7].includes(Number(record.status))) continue;
      return { kind: "unsafe", reason: "Terminal history record has no stable provider identity or valid amount." };
    }
    if (deposit.status === null) return { kind: "unsafe", reason: "History record has an invalid provider status." };
    if (deposit.address !== claim.address ||
        deposit.providerTicker !== claim.providerTicker ||
        deposit.network !== claim.network ||
        normalizeWhitebitMemo(deposit.memo) !== normalizeWhitebitMemo(claim.memo)) {
      return { kind: "unsafe", reason: "History record does not match the frozen provider address/asset/network/memo." };
    }
    if (![3, 7].includes(Number(deposit.status))) continue;
    const expected = units(order.amount);
    if (expected === null || units(deposit.amount) !== expected) {
      return { kind: "unsafe", reason: "Terminal deposit amount differs from the frozen order." };
    }
    if (matched) return { kind: "unsafe", reason: "More than one terminal deposit exists for the frozen order address." };
    matched = deposit;
  }
  return matched ? { kind: "matched", deposit: matched } : { kind: "none" };
}