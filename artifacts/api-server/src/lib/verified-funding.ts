export function buildVerifiedExplorerUrl(template: string | null | undefined, transactionHash: string): string | undefined {
  const normalized = template?.trim();
  const hash = transactionHash.trim();
  if (!normalized || !hash || !/^https:\/\//i.test(normalized) || !/\{(?:tx|txid|transactionHash)\}/i.test(normalized)) {
    return undefined;
  }
  const rendered = normalized.replace(/\{(?:tx|txid|transactionHash)\}/gi, encodeURIComponent(hash));
  try {
    const parsed = new URL(rendered);
    return parsed.protocol === "https:" && parsed.hostname && !parsed.username && !parsed.password
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function exposeLegacyTransactionHash(orderType: string | undefined, transactionHash: string | null): string | undefined {
  return orderType === "manual" ? undefined : transactionHash || undefined;
}

export function selectWhitebitProviderDepositId(
  transactionId: string | null | undefined,
  uniqueId: string | null | undefined,
): string | undefined {
  return transactionId?.trim() || uniqueId?.trim() || undefined;
}

export type WhitebitExplorerRoute = {
  id: string;
  assetCode: string;
  networkCode: string;
  networkName: string;
  explorerUrlTemplate: string | null;
};

export type WhitebitVerifiedFundingInput = {
  transactionHash: string | null;
  confirmations: number | null;
  detectedAt: Date | null;
  canonicalAssetCode: string;
  frozenRouteId: string | null;
  frozenNetworkCode: string;
  frozenNetworkName: string;
  routes: WhitebitExplorerRoute[];
};

/**
 * Projects an already-recorded WhiteBIT deposit hash into the existing
 * customer-safe verified-funding shape. Route identity comes exclusively from
 * the order's frozen funding snapshot; current routes contribute explorer
 * metadata only when their canonical asset/network identity matches.
 */
export function projectWhitebitVerifiedFunding(input: WhitebitVerifiedFundingInput) {
  const transactionHash = input.transactionHash?.trim();
  if (!transactionHash) return undefined;

  const canonicalAsset = input.canonicalAssetCode.trim().toUpperCase();
  const frozenCode = input.frozenNetworkCode.trim().toUpperCase();
  const matchingAsset = input.routes.filter((route) => route.assetCode.trim().toUpperCase() === canonicalAsset);
  const networkRoute = matchingAsset.find((route) => route.networkCode.trim().toUpperCase() === frozenCode);
  const knownNetwork = input.routes.some((route) => route.networkCode.trim().toUpperCase() === frozenCode);
  const exactRoute = !networkRoute && !knownNetwork && input.frozenRouteId
    ? matchingAsset.find((route) =>
        route.id === input.frozenRouteId &&
        route.networkCode.trim().toUpperCase() === input.frozenNetworkName.trim().toUpperCase())
    : undefined;
  const route = networkRoute ?? exactRoute;
  const detectedAt = input.detectedAt;
  return {
    transactionHash,
    networkCode: route?.networkCode ?? input.frozenNetworkCode,
    networkName: route?.networkName ?? (input.frozenNetworkName || input.frozenNetworkCode),
    confirmations: Number.isInteger(input.confirmations) && (input.confirmations ?? -1) >= 0
      ? input.confirmations!
      : 0,
    detectedAt: detectedAt?.toISOString() ?? null,
    explorerUrl: buildVerifiedExplorerUrl(route?.explorerUrlTemplate, transactionHash),
  };
}