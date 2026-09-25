import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  ordersTable,
  whitebitDepositsTable,
  whitebitOrderAddressesTable,
} from "@workspace/db";
import {
  projectWhitebitVerifiedFunding,
  selectWhitebitProviderDepositId,
} from "./verified-funding";

/**
 * Read-only projection of a stored WhiteBIT chain hash. The deposit is joined
 * to its exact order-address claim and all route identity is taken from the
 * order's frozen funding snapshot; current catalog rows supply metadata only.
 */
async function getMatchingWhitebitOrderDeposit(orderId: string) {
  const [order] = await db.select({
    id: ordersTable.id,
    fromAsset: ordersTable.fromAsset,
    fromNetwork: ordersTable.fromNetwork,
    sourceSettlementOptionId: ordersTable.sourceSettlementOptionId,
    fundingDetailsSnapshot: ordersTable.fundingDetailsSnapshot,
    depositAddress: ordersTable.depositAddress,
    depositMemo: ordersTable.depositMemo,
  }).from(ordersTable).where(and(
    eq(ordersTable.id, orderId),
    eq(ordersTable.type, "manual"),
    eq(ordersTable.fundingStatus, "ready_whitebit"),
    eq(ordersTable.fundingProviderSource, "whitebit"),
  )).limit(1);
  if (!order) return undefined;

  const funding = order.fundingDetailsSnapshot && typeof order.fundingDetailsSnapshot === "object"
    ? order.fundingDetailsSnapshot as Record<string, unknown>
    : {};
  const frozenProviderAsset = typeof funding.whitebitAssetCode === "string"
    ? funding.whitebitAssetCode.trim()
    : order.fromAsset;
  const frozenMappedNetwork = typeof funding.whitebitNetworkCode === "string"
    ? funding.whitebitNetworkCode.trim()
    : "";
  const frozenNetworkCode = frozenMappedNetwork || order.fromNetwork;
  if (!frozenProviderAsset || !frozenNetworkCode) return undefined;

  const [deposit] = await db.select({
    transactionHash: whitebitDepositsTable.transactionHash,
    transactionId: whitebitDepositsTable.transactionId,
    uniqueId: whitebitDepositsTable.uniqueId,
    confirmations: whitebitDepositsTable.confirmationsActual,
    providerCreatedAt: whitebitDepositsTable.providerCreatedAt,
    createdAt: whitebitDepositsTable.createdAt,
    address: whitebitDepositsTable.address,
    memo: whitebitDepositsTable.memo,
    network: whitebitDepositsTable.network,
    ticker: whitebitDepositsTable.ticker,
    providerTicker: whitebitDepositsTable.providerTicker,
    claimAddress: whitebitOrderAddressesTable.address,
    claimMemo: whitebitOrderAddressesTable.memo,
    claimNetwork: whitebitOrderAddressesTable.network,
    claimTicker: whitebitOrderAddressesTable.ticker,
    claimProviderTicker: whitebitOrderAddressesTable.providerTicker,
  }).from(whitebitDepositsTable)
    .innerJoin(
      whitebitOrderAddressesTable,
      eq(whitebitOrderAddressesTable.id, whitebitDepositsTable.orderAddressId),
    )
    .where(and(
      eq(whitebitDepositsTable.orderId, orderId),
      eq(whitebitOrderAddressesTable.orderId, orderId),
      isNull(whitebitDepositsTable.conflict),
      isNull(whitebitDepositsTable.supersededBy),
    ))
    .orderBy(desc(whitebitDepositsTable.providerCreatedAt), desc(whitebitDepositsTable.createdAt))
    .limit(1);
  if (!deposit?.claimAddress ||
      deposit.claimAddress !== order.depositAddress ||
      deposit.address !== deposit.claimAddress ||
      deposit.ticker.trim().toUpperCase() !== order.fromAsset.trim().toUpperCase() ||
      deposit.claimTicker.trim().toUpperCase() !== order.fromAsset.trim().toUpperCase() ||
      deposit.providerTicker.trim().toUpperCase() !== frozenProviderAsset.toUpperCase() ||
      deposit.claimProviderTicker.trim().toUpperCase() !== frozenProviderAsset.toUpperCase() ||
      !deposit.network ||
      deposit.network.trim().toUpperCase() !== deposit.claimNetwork.trim().toUpperCase() ||
      deposit.claimNetwork.trim().toUpperCase() !== frozenNetworkCode.toUpperCase() ||
      (deposit.claimMemo ?? "") !== (order.depositMemo ?? "") ||
      (deposit.memo ?? "") !== (deposit.claimMemo ?? "")) return undefined;

  const frozenRouteId = typeof funding.networkId === "string" &&
      funding.networkId === order.sourceSettlementOptionId?.replace(/^crypto:/, "")
    ? funding.networkId
    : null;
  return {
    order,
    deposit,
    frozenRouteId,
    frozenNetworkCode,
  };
}

export async function getWhitebitProviderDepositId(orderId: string) {
  const match = await getMatchingWhitebitOrderDeposit(orderId);
  if (!match) return undefined;
  return selectWhitebitProviderDepositId(match.deposit.transactionId, match.deposit.uniqueId);
}

export async function getWhitebitVerifiedFundingTransaction(orderId: string) {
  const match = await getMatchingWhitebitOrderDeposit(orderId);
  if (!match?.deposit.transactionHash) return undefined;
  const { order, deposit, frozenRouteId, frozenNetworkCode } = match;
  const routes = await db.select({
    id: cryptoAssetNetworksTable.id,
    assetCode: cryptoAssetsTable.code,
    networkCode: cryptoAssetNetworksTable.networkCode,
    networkName: cryptoAssetNetworksTable.networkName,
    explorerUrlTemplate: cryptoAssetNetworksTable.explorerUrlTemplate,
  }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(or(
      sql`upper(${cryptoAssetsTable.code}) = upper(${order.fromAsset})`,
      sql`upper(${cryptoAssetNetworksTable.networkCode}) = upper(${frozenNetworkCode})`,
    ));

  return projectWhitebitVerifiedFunding({
    transactionHash: deposit.transactionHash,
    confirmations: deposit.confirmations,
    detectedAt: deposit.providerCreatedAt ?? deposit.createdAt,
    canonicalAssetCode: order.fromAsset,
    frozenRouteId,
    frozenNetworkCode,
    frozenNetworkName: order.fromNetwork,
    routes,
  });
}