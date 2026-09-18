import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, manualDeskPricingRulesTable, ordersTable } from "@workspace/db";
import { evaluateManualPricingCoverage } from "./manual-desk-pricing";
import { listPublicManualCryptoSettlementOptions } from "./manual-crypto";
import { listPublicFiatSettlementOptions } from "./payment-methods";
import {
  getQuickexPublicPairs,
  listExecutableProviderCapabilities,
} from "./provider-capabilities";

const RESULT_LIMIT = 6;
const HISTORY_DAYS = 90;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_STALE_MS = 60 * 60_000;

type PopularSide = {
  settlementOptionId: string;
  asset: string;
  network: string;
  label: string;
  kind?: "crypto-network" | "fiat-payment-method";
  logoUrl?: string;
  networkLogoUrl?: string;
  paymentMethodId?: string;
};

type PopularPair = {
  mode: "convert" | "swap";
  source: PopularSide;
  target: PopularSide;
  orderCount: number;
  fallback: boolean;
};

export type PopularExchangePairsResult = {
  convert: PopularPair[];
  swap: PopularPair[];
  generatedAt: string;
};

type RankedOrderRoute = {
  type: string;
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
  sourceSettlementOptionId: string | null;
  targetSettlementOptionId: string | null;
  orderCount: number;
};

let cache: {
  expiresAt: number;
  staleUntil: number;
  data: PopularExchangePairsResult;
} | undefined;
let refreshPromise: Promise<PopularExchangePairsResult> | undefined;

const normalize = (value: string) => value.trim().toUpperCase();
const routeKey = (source: PopularSide, target: PopularSide) =>
  `${source.settlementOptionId}\0${target.settlementOptionId}`;

async function rankCompletedOrders(): Promise<RankedOrderRoute[]> {
  const fromAsset = sql<string>`upper(trim(${ordersTable.fromAsset}))`;
  const fromNetwork = sql<string>`upper(trim(${ordersTable.fromNetwork}))`;
  const toAsset = sql<string>`upper(trim(${ordersTable.toAsset}))`;
  const toNetwork = sql<string>`upper(trim(${ordersTable.toNetwork}))`;
  const orderCount = sql<number>`count(*)::int`;
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60_000);
  return db.select({
    type: ordersTable.type,
    fromAsset,
    fromNetwork,
    toAsset,
    toNetwork,
    sourceSettlementOptionId: ordersTable.sourceSettlementOptionId,
    targetSettlementOptionId: ordersTable.targetSettlementOptionId,
    orderCount,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      eq(ordersTable.outcomeUnknown, false),
      eq(ordersTable.isTest, false),
      inArray(ordersTable.type, ["instant", "manual"]),
      gte(ordersTable.createdAt, since),
    ))
    .groupBy(
      ordersTable.type,
      fromAsset,
      fromNetwork,
      toAsset,
      toNetwork,
      ordersTable.sourceSettlementOptionId,
      ordersTable.targetSettlementOptionId,
    )
    .orderBy(desc(orderCount), fromAsset, fromNetwork, toAsset, toNetwork)
    .limit(200);
}

function appendFallbacks(
  ranked: PopularPair[],
  fallbacks: PopularPair[],
): PopularPair[] {
  const seen = new Set(ranked.map(pair => routeKey(pair.source, pair.target)));
  const result = [...ranked];
  for (const pair of fallbacks) {
    if (result.length >= RESULT_LIMIT) break;
    const key = routeKey(pair.source, pair.target);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pair);
  }
  return result.slice(0, RESULT_LIMIT);
}

async function calculatePopularPairs(): Promise<PopularExchangePairsResult> {
  const [rankedRoutes, capabilities, executableRoutes, cryptoOptions, fiatOptions, pricingRules] =
    await Promise.all([
      rankCompletedOrders(),
      listExecutableProviderCapabilities(),
      getQuickexPublicPairs({}),
      listPublicManualCryptoSettlementOptions(),
      listPublicFiatSettlementOptions(),
      db.select().from(manualDeskPricingRulesTable)
        .where(eq(manualDeskPricingRulesTable.enabled, true)),
    ]);

  const capabilityByRoute = new Map(capabilities.map(capability => [
    `${normalize(capability.assetCode)}\0${normalize(capability.networkCode)}`,
    capability,
  ]));
  const executableRouteKeys = new Set(executableRoutes.map(route =>
    `${normalize(route.fromAsset)}\0${normalize(route.fromNetwork)}\0${normalize(route.toAsset)}\0${normalize(route.toNetwork)}`
  ));
  const convertRanked = rankedRoutes.flatMap((route): PopularPair[] => {
    if (route.type !== "instant") return [];
    if (!executableRouteKeys.has(
      `${normalize(route.fromAsset)}\0${normalize(route.fromNetwork)}\0${normalize(route.toAsset)}\0${normalize(route.toNetwork)}`
    )) return [];
    const source = capabilityByRoute.get(`${normalize(route.fromAsset)}\0${normalize(route.fromNetwork)}`);
    const target = capabilityByRoute.get(`${normalize(route.toAsset)}\0${normalize(route.toNetwork)}`);
    if (!source || !target || source.networkId === target.networkId) return [];
    return [{
      mode: "convert",
      source: {
        settlementOptionId: `api:${source.providerId}:${source.networkId}`,
        asset: source.assetCode,
        network: source.networkCode,
        label: source.assetCode,
        kind: "crypto-network",
        logoUrl: source.logoObjectPath ? `/api/storage${source.logoObjectPath}` : undefined,
        networkLogoUrl: source.networkLogoObjectPath ? `/api/storage${source.networkLogoObjectPath}` : undefined,
      },
      target: {
        settlementOptionId: `api:${target.providerId}:${target.networkId}`,
        asset: target.assetCode,
        network: target.networkCode,
        label: target.assetCode,
        kind: "crypto-network",
        logoUrl: target.logoObjectPath ? `/api/storage${target.logoObjectPath}` : undefined,
        networkLogoUrl: target.networkLogoObjectPath ? `/api/storage${target.networkLogoObjectPath}` : undefined,
      },
      orderCount: route.orderCount,
      fallback: false,
    }];
  });

  const convertFallbacks: PopularPair[] = [];
  for (const route of executableRoutes) {
      const source = capabilityByRoute.get(`${normalize(route.fromAsset)}\0${normalize(route.fromNetwork)}`);
      const target = capabilityByRoute.get(`${normalize(route.toAsset)}\0${normalize(route.toNetwork)}`);
      if (!source || !target) continue;
      convertFallbacks.push({
        mode: "convert",
        source: {
          settlementOptionId: `api:${source.providerId}:${source.networkId}`,
          asset: source.assetCode,
          network: source.networkCode,
          label: source.assetCode,
          kind: "crypto-network",
          logoUrl: source.logoObjectPath ? `/api/storage${source.logoObjectPath}` : undefined,
          networkLogoUrl: source.networkLogoObjectPath ? `/api/storage${source.networkLogoObjectPath}` : undefined,
        },
        target: {
          settlementOptionId: `api:${target.providerId}:${target.networkId}`,
          asset: target.assetCode,
          network: target.networkCode,
          label: target.assetCode,
          kind: "crypto-network",
          logoUrl: target.logoObjectPath ? `/api/storage${target.logoObjectPath}` : undefined,
          networkLogoUrl: target.networkLogoObjectPath ? `/api/storage${target.networkLogoObjectPath}` : undefined,
        },
        orderCount: 0,
        fallback: true,
      });
      if (convertFallbacks.length >= RESULT_LIMIT * 3) break;
  }

  const manualOptions = [...cryptoOptions, ...fiatOptions];
  const optionById = new Map(manualOptions.map(option => [option.id, option]));
  const coverage = evaluateManualPricingCoverage(pricingRules, manualOptions);
  const coveredKeys = new Set(coverage.coveredRoutes.map(route =>
    `${route.sourceSettlementOptionId}\0${route.targetSettlementOptionId}`));
  const sideFromOption = (option: (typeof manualOptions)[number]): PopularSide => ({
    settlementOptionId: option.id,
    asset: option.assetCode,
    network: option.routeNetwork,
    label: option.kind === "fiat-payment-method" ? option.title : option.assetCode,
    kind: option.kind,
    logoUrl: option.logoUrl,
    networkLogoUrl: option.kind === "crypto-network" ? option.networkLogoUrl : undefined,
    paymentMethodId: option.kind === "fiat-payment-method" ? option.paymentMethodId : undefined,
  });
  const swapRanked = rankedRoutes.flatMap((route): PopularPair[] => {
    if (
      route.type !== "manual" ||
      !route.sourceSettlementOptionId ||
      !route.targetSettlementOptionId
    ) return [];
    const source = optionById.get(route.sourceSettlementOptionId);
    const target = optionById.get(route.targetSettlementOptionId);
    if (
      !source ||
      !target ||
      !coveredKeys.has(`${source.id}\0${target.id}`)
    ) return [];
    return [{
      mode: "swap",
      source: sideFromOption(source),
      target: sideFromOption(target),
      orderCount: route.orderCount,
      fallback: false,
    }];
  });
  const swapFallbacks = coverage.coveredRoutes.flatMap((route): PopularPair[] => {
    const source = optionById.get(route.sourceSettlementOptionId);
    const target = optionById.get(route.targetSettlementOptionId);
    if (!source || !target) return [];
    return [{
      mode: "swap",
      source: sideFromOption(source),
      target: sideFromOption(target),
      orderCount: 0,
      fallback: true,
    }];
  }).sort((left, right) => {
    const leftCryptoToPayment =
      left.source.kind === "crypto-network" && left.target.kind === "fiat-payment-method";
    const rightCryptoToPayment =
      right.source.kind === "crypto-network" && right.target.kind === "fiat-payment-method";
    return Number(rightCryptoToPayment) - Number(leftCryptoToPayment) ||
      routeKey(left.source, left.target).localeCompare(routeKey(right.source, right.target));
  });

  return {
    convert: appendFallbacks(convertRanked, convertFallbacks),
    swap: appendFallbacks(swapRanked, swapFallbacks),
    generatedAt: new Date().toISOString(),
  };
}

async function refreshPopularPairs(): Promise<PopularExchangePairsResult> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = calculatePopularPairs().then((data) => {
    const now = Date.now();
    cache = {
      data,
      expiresAt: now + CACHE_TTL_MS,
      staleUntil: now + CACHE_STALE_MS,
    };
    return data;
  }).finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

export async function getPopularExchangePairs(): Promise<PopularExchangePairsResult> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.data;
  if (cache && cache.staleUntil > now) {
    void refreshPopularPairs();
    return cache.data;
  }
  return refreshPopularPairs();
}

export function invalidatePopularExchangePairsCache(): void {
  cache = undefined;
}

const refreshTimer = setInterval(() => {
  void refreshPopularPairs().catch(() => undefined);
}, CACHE_TTL_MS);
refreshTimer.unref();