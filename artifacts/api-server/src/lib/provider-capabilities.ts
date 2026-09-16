import { eq } from "drizzle-orm";
import { cryptoAssetNetworksTable, cryptoAssetsTable, db } from "@workspace/db";
import { ApiError } from "./api-error";
import {
  getQuickexCredentialStatus,
  getCachedQuickexInstruments,
  getCachedQuickexPairs,
  getQuickexInstruments,
  getQuickexPairs,
  getQuickexQuote,
  type QuickexInstrument,
  type QuickexRateMode,
} from "./quickex";

const QUICKEX_PROVIDER_ID = "quickex";
const QUICKEX_NETWORK_TITLE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "btc-bitcoin": ["Bitcoin", "BTC"],
  "eth-ethereum": ["Ethereum", "ERC20"],
  "usdt-erc20": ["ERC20", "Ethereum"],
  "usdt-trc20": ["TRC20", "Tron"],
  "usdt-bep20": ["BEP20", "BNB Smart Chain"],
  "usdc-erc20": ["ERC20", "Ethereum"],
  "usdc-solana": ["SPL", "Solana"],
  "xrp-xrpl": ["Ripple", "XRPL", "XRP Ledger"],
  "ltc-litecoin": ["Litecoin", "LTC"],
};

const capabilityKey = (currencyTitle: string, networkTitle: string) =>
  `${currencyTitle.trim().toUpperCase()}\0${networkTitle.trim().toUpperCase()}`;

const providerAssetId = (value: string) =>
  `provider:${QUICKEX_PROVIDER_ID}:asset:${encodeURIComponent(value.trim().toLowerCase())}`;

const providerInstrumentId = (value: string) =>
  `instrument:${encodeURIComponent(value.trim().toLowerCase())}`;

type InstantRouteInput = {
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  amount: number;
  rateMode?: QuickexRateMode;
  sourceSettlementOptionId?: string;
  targetSettlementOptionId?: string;
};

export type ProviderCapability = {
  providerId: typeof QUICKEX_PROVIDER_ID;
  providerName: "Quickex";
  networkId: string;
  assetId: string;
  assetCode: string;
  networkCode: string;
  networkName: string;
  requiresMemo: boolean;
  decimals: number;
  lifecycle: "active" | "restricted" | "deprecated";
  regions: string[];
  logoObjectPath?: string | null;
  networkLogoObjectPath?: string | null;
};

async function quickexIsConfigured() {
  const status = await getQuickexCredentialStatus();
  return status.signedOrders;
}

export async function listExecutableProviderCapabilities(
  options: { cacheOnly?: boolean } = {},
): Promise<ProviderCapability[]> {
  let instruments: QuickexInstrument[];
  let pairs;
  try {
    if (!await quickexIsConfigured()) return [];
    if (options.cacheOnly) {
      instruments = getCachedQuickexInstruments() ?? [];
      pairs = getCachedQuickexPairs() ?? [];
      if (!instruments.length || !pairs.length) return [];
    } else {
      [instruments, pairs] = await Promise.all([
        getQuickexInstruments(),
        getQuickexPairs(),
      ]);
    }
  } catch {
    return [];
  }
  const rows = await db.select({ asset: cryptoAssetsTable, network: cryptoAssetNetworksTable })
    .from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id));
  const candidates: ProviderCapability[] = instruments.flatMap((instrument) => {
    const assetRows = rows.filter(({ asset }) =>
      asset.code.trim().toUpperCase() === instrument.currencyTitle.trim().toUpperCase()
    );
    const mappedRows = assetRows.filter(({ network }) => {
      const titles = new Set([
        network.networkCode,
        network.networkName,
        ...(QUICKEX_NETWORK_TITLE_ALIASES[network.id] ?? []),
      ].map(title => title.trim().toUpperCase()));
      return titles.has(instrument.networkTitle.trim().toUpperCase());
    });
    if (mappedRows.length > 1) return [];
    const mapped = mappedRows[0];
    if (mapped) {
      const { asset, network } = mapped;
      if (
        !asset.enabled ||
        !network.enabled ||
        asset.lifecycle === "deprecated" ||
        network.lifecycle === "deprecated" ||
        network.executionMode === "catalog"
      ) return [];
      return [{
        providerId: QUICKEX_PROVIDER_ID,
        providerName: "Quickex",
        networkId: network.id,
        assetId: asset.id,
        assetCode: instrument.currencyTitle,
        networkCode: instrument.networkTitle,
        networkName: network.networkName,
        requiresMemo: instrument.requiresMemo,
        decimals: network.decimals,
        lifecycle: network.lifecycle as ProviderCapability["lifecycle"],
        regions: network.regions,
        logoObjectPath: asset.logoObjectPath,
        networkLogoObjectPath: network.logoObjectPath,
      }];
    }
    if (assetRows.some(({ asset }) => !asset.enabled || asset.lifecycle === "deprecated")) {
      return [];
    }
    return [{
      providerId: QUICKEX_PROVIDER_ID,
      providerName: "Quickex",
      networkId: providerInstrumentId(instrument.slug),
      assetId: providerAssetId(instrument.currencyTitle),
      assetCode: instrument.currencyTitle,
      networkCode: instrument.networkTitle,
      networkName: instrument.networkTitle,
      requiresMemo: instrument.requiresMemo,
      decimals: instrument.precisionDecimals,
      lifecycle: "active",
      regions: [],
      logoObjectPath: null,
      networkLogoObjectPath: null,
    }];
  });
  const candidateCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = capabilityKey(candidate.assetCode, candidate.networkCode);
    candidateCounts.set(key, (candidateCounts.get(key) ?? 0) + 1);
  }
  const unambiguousCandidates = candidates.filter(candidate =>
    candidateCounts.get(capabilityKey(candidate.assetCode, candidate.networkCode)) === 1
  );
  const candidateKeys = new Set(unambiguousCandidates.map((item) =>
    capabilityKey(item.assetCode, item.networkCode)
  ));
  const executableKeys = new Set<string>();
  for (const pair of pairs) {
    const sourceKey = capabilityKey(
      pair.instrumentFromCurrencyTitle,
      pair.instrumentFromNetworkTitle,
    );
    const targetKey = capabilityKey(
      pair.instrumentToCurrencyTitle,
      pair.instrumentToNetworkTitle,
    );
    if (candidateKeys.has(sourceKey) && candidateKeys.has(targetKey)) {
      executableKeys.add(sourceKey);
      executableKeys.add(targetKey);
    }
  }
  return unambiguousCandidates.filter((item) =>
    executableKeys.has(capabilityKey(item.assetCode, item.networkCode))
  );
}

export async function listPublicProviderSettlementOptions(
  options: { cacheOnly?: boolean } = {},
) {
  return (await listExecutableProviderCapabilities(options)).map((capability) => ({
    id: `api:${capability.providerId}:${capability.networkId}`,
    assetId: capability.assetId,
    assetCode: capability.assetCode,
    routeNetwork: capability.networkCode,
    kind: "crypto-network" as const,
    title: `${capability.assetCode} ${capability.networkName}`,
    direction: "both" as const,
    networkSlug: capability.networkId,
    networkTitle: capability.networkName,
    requiresMemo: capability.requiresMemo,
    fields: [],
    customerDepositsEnabled: false,
    executionMode: "api" as const,
    providerId: capability.providerId,
    lifecycle: capability.lifecycle,
    regions: capability.regions,
    countries: [],
    logoUrl: capability.logoObjectPath ? `/api/storage${capability.logoObjectPath}` : undefined,
    networkLogoUrl: capability.networkLogoObjectPath ? `/api/storage${capability.networkLogoObjectPath}` : undefined,
  }));
}

export async function getQuickexPublicCapabilityConfig() {
  const credentialStatus = await getQuickexCredentialStatus();
  if (!credentialStatus.configured) {
    return { provider: "Quickex" as const, instruments: [], pairs: [], signedOrders: false };
  }
  if (!credentialStatus.signedOrders) {
    throw new ApiError(
      "QUICKEX_NOT_CONFIGURED",
      "Convert is temporarily unavailable while the exchange connection is verified.",
      503,
    );
  }
  // Public Convert configuration must not turn a transient catalog failure
  // into a valid-looking empty result that the client caches for five minutes.
  // Warm both catalogs here so transport failures remain explicit 5xx errors.
  const [instruments, pairs] = await Promise.all([
    getQuickexInstruments(),
    getQuickexPairs(),
  ]);
  const capabilities = await listExecutableProviderCapabilities({ cacheOnly: true });
  if (!capabilities.length) {
    return { provider: "Quickex" as const, instruments: [], pairs: [], signedOrders: false };
  }
  const allowed = new Set(capabilities.map((item) =>
    `${item.assetCode.toUpperCase()}\0${item.networkCode.toUpperCase()}`
  ));
  const publicInstruments = instruments.filter((item) =>
    allowed.has(`${item.currencyTitle.toUpperCase()}\0${item.networkTitle.toUpperCase()}`)
  );
  const publicPairs = pairs.filter((pair) =>
    allowed.has(`${pair.instrumentFromCurrencyTitle.toUpperCase()}\0${pair.instrumentFromNetworkTitle.toUpperCase()}`) &&
    allowed.has(`${pair.instrumentToCurrencyTitle.toUpperCase()}\0${pair.instrumentToNetworkTitle.toUpperCase()}`)
  ).map((pair) => ({
    fromAsset: pair.instrumentFromCurrencyTitle,
    fromNetwork: pair.instrumentFromNetworkTitle,
    toAsset: pair.instrumentToCurrencyTitle,
    toNetwork: pair.instrumentToNetworkTitle,
  }));
  return {
    provider: "Quickex" as const,
    instruments: publicInstruments,
    pairs: publicPairs,
    signedOrders: true,
  };
}

export async function assertExecutableQuickexRoute(input: InstantRouteInput) {
  const capabilities = await listExecutableProviderCapabilities();
  const find = (asset: string, network: string) => capabilities.find((item) =>
    item.assetCode.toUpperCase() === asset.toUpperCase() &&
    item.networkCode.toUpperCase() === network.toUpperCase()
  );
  const source = find(input.fromAsset, input.fromNetwork);
  const target = find(input.toAsset, input.toNetwork);
  if (!source || !target) {
    throw new ApiError("PROVIDER_ROUTE_UNAVAILABLE", "This instant exchange route is unavailable.", 422);
  }
  const pairs = await getQuickexPairs();
  if (
    (input.sourceSettlementOptionId &&
      input.sourceSettlementOptionId !== `api:${source.providerId}:${source.networkId}`) ||
    (input.targetSettlementOptionId &&
      input.targetSettlementOptionId !== `api:${target.providerId}:${target.networkId}`) ||
    !pairs.some((pair) =>
      pair.instrumentFromCurrencyTitle.toUpperCase() === source.assetCode.toUpperCase() &&
      pair.instrumentFromNetworkTitle.toUpperCase() === source.networkCode.toUpperCase() &&
      pair.instrumentToCurrencyTitle.toUpperCase() === target.assetCode.toUpperCase() &&
      pair.instrumentToNetworkTitle.toUpperCase() === target.networkCode.toUpperCase()
    )
  ) {
    throw new ApiError("PROVIDER_ROUTE_UNAVAILABLE", "This instant exchange route is unavailable.", 422);
  }
  return { source, target };
}

export async function buildProviderQuoteTicket(input: InstantRouteInput) {
  const { source, target } = await assertExecutableQuickexRoute(input);
  const quote = await getQuickexQuote({
    fromCurrency: source.assetCode,
    fromNetwork: source.networkCode,
    toCurrency: target.assetCode,
    toNetwork: target.networkCode,
    amount: input.amount,
    rateMode: input.rateMode,
  });
  return {
    v: 2 as const,
    type: "instant" as const,
    fromAsset: quote.instrumentFrom.currencyTitle,
    fromNetwork: quote.instrumentFrom.networkTitle,
    toAsset: quote.instrumentTo.currencyTitle,
    toNetwork: quote.instrumentTo.networkTitle,
    amount: input.amount,
    receiveAmount: Number(quote.amountToGet),
    rate: Number(quote.amountToGet) / input.amount,
    fee: Number(quote.finalNetworkFeeAmount ?? 0),
    sourceSettlementOptionId: `api:${source.providerId}:${source.networkId}`,
    targetSettlementOptionId: `api:${target.providerId}:${target.networkId}`,
    provider: "Quickex",
    rateMode: quote.rateMode,
    quickexQuote: quote,
    expiresAt: Date.now() + 120_000,
  };
}