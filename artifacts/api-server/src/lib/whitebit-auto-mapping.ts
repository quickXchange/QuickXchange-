import type { WhitebitCatalogAsset } from "./whitebit-capabilities";

export type WhitebitAutoMappingRoute = {
  networkId: string;
  assetCode: string;
  networkCode: string;
  assetEnabled: boolean;
  assetLifecycle: string;
  networkEnabled: boolean;
  networkLifecycle: string;
  executionMode: string;
  depositProvider: string;
  customerDepositsEnabled: boolean;
  whitebitAssetCode: string | null;
  whitebitNetworkCode: string | null;
};

export type WhitebitAutoMappingClassification = {
  networkId: string;
  assetCode: string;
  networkCode: string;
  status: "automatic" | "owner_selection" | "unsupported" | "existing_mapping" | "protected";
  ambiguous: boolean;
  reason: string;
  suggestedAssetCode: string | null;
  suggestedNetworkCode: string | null;
  options: string[];
  willApply: boolean;
};

const normalize = (value: string | null | undefined) => value?.trim().toUpperCase() ?? "";
const sameChainAliases: Record<string, readonly string[]> = {
  AVAXC: ["AVAXC", "CCHAIN", "AVALANCHE", "AVALANCHEC"],
  SPL: ["SPL", "SOL", "SOLANA", "SOLANASPL"],
  SOL: ["SPL", "SOL", "SOLANA", "SOLANASPL"],
  SOLANA: ["SPL", "SOL", "SOLANA", "SOLANASPL"],
  ERC20: ["ERC20", "ETH", "ETHEREUM"],
  ETH: ["ERC20", "ETH", "ETHEREUM"],
  TRC20: ["TRC20", "TRON"],
  TRON: ["TRC20", "TRON"],
  BEP20: ["BEP20", "BSC", "BNB"],
  BSC: ["BEP20", "BSC", "BNB"],
  BTC: ["BTC", "BITCOIN"],
  BITCOIN: ["BTC", "BITCOIN"],
  BASE: ["BASE", "BASECHAIN"],
  BASECHAIN: ["BASE", "BASECHAIN"],
};

export function plausibleWhitebitDepositNetworks(
  internalNetworkCode: string,
  providerNetworks: readonly string[],
  assetCode?: string,
) {
  const internalNetwork = normalize(internalNetworkCode);
  const normalizedNetworks = [...new Set(providerNetworks.map(normalize))].sort();
  if (
    normalize(assetCode) === "XLM" && internalNetwork === "XLM" &&
    normalizedNetworks.length === 1 && normalizedNetworks[0] === "STELLAR"
  ) return normalizedNetworks;
  if (
    normalize(assetCode) === "XRP" && internalNetwork === "XRPL" &&
    normalizedNetworks.length === 1 && normalizedNetworks[0] === "XRP"
  ) return normalizedNetworks;
  return normalizedNetworks.filter(providerNetwork => {
    if (internalNetwork === providerNetwork) return true;
    return Boolean(sameChainAliases[internalNetwork]?.includes(providerNetwork));
  });
}

export function isWhitebitRouteMappingPlausible(
  networkId: string,
  assetCode: string,
  internalNetworkCode: string,
  mappedAssetCode: string | null | undefined,
  mappedNetworkCode: string | null | undefined,
  providerNetworks: readonly string[],
) {
  const mappedAsset = normalize(mappedAssetCode);
  if (isWhitebitRouteIdentityException(networkId, assetCode, mappedAssetCode)) return false;
  const mappedNetwork = normalize(mappedNetworkCode) || normalize(internalNetworkCode);
  if (
    networkId === "bnb-bnb" && normalize(assetCode) === "BNB" &&
    normalize(internalNetworkCode) === "BNB" && normalize(mappedAssetCode ?? assetCode) === "BNB" &&
    mappedNetwork === "BEP20" && providerNetworks.map(normalize).includes("BEP20")
  ) return true;
  return Boolean(mappedNetwork && plausibleWhitebitDepositNetworks(
    internalNetworkCode,
    providerNetworks,
    mappedAsset || assetCode,
  ).includes(mappedNetwork));
}

export function isWhitebitRouteIdentityException(
  networkId: string,
  assetCode: string,
  mappedAssetCode: string | null | undefined,
) {
  return networkId === "usdt0-polygon" &&
    normalize(assetCode) === "USDT" &&
    normalize(mappedAssetCode ?? assetCode) === "USDT";
}

/**
 * Purely classify a route using only the public deposit-capability catalog.
 * No display names, blockchain monitoring identities, withdrawal networks,
 * credentials, or provider-side address operations are used as evidence.
 */
export function classifyWhitebitAutoMapping(
  route: WhitebitAutoMappingRoute,
  catalog: readonly WhitebitCatalogAsset[],
): WhitebitAutoMappingClassification {
  const hasExistingMapping = route.whitebitAssetCode !== null || route.whitebitNetworkCode !== null;
  const canMutate = route.assetEnabled && route.assetLifecycle === "active" &&
    route.networkEnabled && route.networkLifecycle === "active" &&
    route.executionMode === "manual" &&
    !hasExistingMapping;
  const base = {
    networkId: route.networkId,
    assetCode: route.assetCode,
    networkCode: route.networkCode,
  };

  if (route.customerDepositsEnabled && route.depositProvider === "whitebit") {
    return {
      ...base, status: "protected",
      ambiguous: false,
      reason: "This WhiteBIT-provider route has Customer Deposits enabled; its route settings and identity are protected.",
      suggestedAssetCode: null, suggestedNetworkCode: null, options: [], willApply: false,
    };
  }
  if (hasExistingMapping) {
    return {
      ...base, status: "existing_mapping",
      ambiguous: false,
      reason: "An explicit WhiteBIT identity already exists and will not be overwritten.",
      suggestedAssetCode: null, suggestedNetworkCode: null, options: [], willApply: false,
    };
  }
  if (route.networkId === "usdt0-polygon") {
    return {
      ...base,
      status: "unsupported",
      ambiguous: false,
      reason: "This route's immutable token identity is USDT0, not USDT; require explicit Owner identity review before mapping.",
      suggestedAssetCode: null,
      suggestedNetworkCode: null,
      options: [],
      willApply: false,
    };
  }

  const ticker = normalize(route.assetCode);
  const network = normalize(route.networkCode);
  const matchingAssets = catalog.filter(asset => asset.normalizedTicker === ticker);
  const asset = matchingAssets.length === 1 ? matchingAssets[0] : undefined;
  const allOptions = [...new Set(matchingAssets.flatMap(candidate =>
    candidate.canDeposit
      ? candidate.networks.filter(item => item.canDeposit).map(item => normalize(item.providerNetwork))
      : [],
  ))].sort();
  const plausibleOptions = plausibleWhitebitDepositNetworks(network, allOptions, ticker);
  const options = plausibleOptions;
  let providerNetwork: string | null = null;
  let reason = "";

  if (matchingAssets.length > 1) {
    reason = "WhiteBIT returned an ambiguous asset identity; select a mapping manually.";
  } else if (asset && options.includes(network)) {
    providerNetwork = network;
    reason = "Canonical asset and network exactly match a unique advertised WhiteBIT deposit route.";
  } else if (
    ticker === "BTC" && network === "BITCOIN" && asset &&
    allOptions.length === 1 && allOptions[0] === "BTC"
  ) {
    providerNetwork = "BTC";
    reason = "BTC/BITCOIN is mapped to BTC only because BTC is its sole advertised deposit network.";
  } else if (
    ticker === "XLM" && network === "XLM" && asset &&
    allOptions.length === 1 && allOptions[0] === "STELLAR"
  ) {
    providerNetwork = "STELLAR";
    reason = "XLM/XLM is mapped to STELLAR only because STELLAR is XLM's sole advertised deposit network.";
  } else if (
    ticker === "XRP" && network === "XRPL" && asset &&
    allOptions.length === 1 && allOptions[0] === "XRP"
  ) {
    providerNetwork = "XRP";
    reason = "XRP/XRPL is mapped to XRP only because XRP is its sole advertised deposit network.";
  } else if (plausibleOptions.length) {
    reason = `WhiteBIT advertises ${ticker} deposit networks, but none is an unambiguous canonical match; Owner selection is required.`;
  } else {
    reason = `WhiteBIT does not advertise a plausible same-chain deposit network for ${ticker} on ${network}.`;
  }

  const status = providerNetwork
    ? "automatic"
    : plausibleOptions.length || matchingAssets.length > 1 ? "owner_selection" : "unsupported";
  const willApply = Boolean(providerNetwork && canMutate);
  if (providerNetwork && !canMutate) {
    reason = "The route is not an active Manual Swap route eligible for identity-only updates.";
  }

  return {
    ...base,
    status,
    ambiguous: matchingAssets.length > 1 || plausibleOptions.length > 1,
    reason,
    suggestedAssetCode: providerNetwork ? ticker : null,
    suggestedNetworkCode: providerNetwork,
    options,
    willApply,
  };
}

export function classifyWhitebitAutoMappings(
  routes: readonly WhitebitAutoMappingRoute[],
  catalog: readonly WhitebitCatalogAsset[],
) {
  return routes.map(route => classifyWhitebitAutoMapping(route, catalog));
}