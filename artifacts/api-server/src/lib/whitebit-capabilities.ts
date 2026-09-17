import { eq } from "drizzle-orm";
import {
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  db,
  whitebitProviderSettingsTable,
} from "@workspace/db";
import { getWhitebitCredentialStorageState } from "./provider-credentials";

export type WhitebitAssetCapability = {
  ticker: string;
  canDeposit: true;
  depositNetworks: string[];
  confirmations: Record<string, number>;
};

export type WhitebitCapabilitySnapshot = {
  fetchedAt: number;
  assets: WhitebitAssetCapability[];
};

const CAPABILITY_TTL_MS = 60_000;
let cached: WhitebitCapabilitySnapshot | null = null;
let refresh: Promise<WhitebitCapabilitySnapshot> | null = null;

export function parseWhitebitAssets(value: unknown): WhitebitAssetCapability[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const assets: WhitebitAssetCapability[] = [];
  for (const [rawTicker, rawAsset] of Object.entries(value)) {
    if (!rawTicker || !rawAsset || typeof rawAsset !== "object" || Array.isArray(rawAsset)) return null;
    const asset = rawAsset as Record<string, unknown>;
    if (asset.can_deposit !== true) continue;
    const networks = asset.networks;
    if (!networks || typeof networks !== "object" || Array.isArray(networks)) return null;
    const deposits = (networks as Record<string, unknown>).deposits;
    // WhiteBIT can temporarily report can_deposit=true with no deposit
    // networks. Exclude that asset rather than invalidating every healthy
    // capability; malformed populated network lists still fail closed.
    if (deposits === undefined) continue;
    if (!Array.isArray(deposits) || deposits.some((network) => typeof network !== "string" || !network.trim())) return null;
    const confirmationsRaw = asset.confirmations;
    if (confirmationsRaw !== undefined && (!confirmationsRaw || typeof confirmationsRaw !== "object" || Array.isArray(confirmationsRaw))) return null;
    const confirmations: Record<string, number> = {};
    for (const [network, count] of Object.entries((confirmationsRaw ?? {}) as Record<string, unknown>)) {
      if (!Number.isInteger(count) || Number(count) < 0) return null;
      confirmations[network.trim().toUpperCase()] = Number(count);
    }
    assets.push({
      ticker: rawTicker.trim().toUpperCase(),
      canDeposit: true,
      depositNetworks: deposits.map((network) => network.trim().toUpperCase()),
      confirmations,
    });
  }
  return assets;
}

async function fetchCapabilities(): Promise<WhitebitCapabilitySnapshot> {
  const response = await fetch("https://whitebit.com/api/v4/public/assets", {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`WhiteBIT capabilities returned ${response.status}`);
  const parsed = parseWhitebitAssets(await response.json());
  if (!parsed || parsed.length === 0) throw new Error("WhiteBIT capabilities response is malformed");
  return { fetchedAt: Date.now(), assets: parsed };
}

export async function getWhitebitCapabilities(): Promise<WhitebitCapabilitySnapshot> {
  if (cached && Date.now() - cached.fetchedAt <= CAPABILITY_TTL_MS) return cached;
  if (refresh) return refresh;
  refresh = fetchCapabilities().then((snapshot) => {
    cached = snapshot;
    return snapshot;
  }).finally(() => {
    refresh = null;
  });
  try {
    return await refresh;
  } catch (error) {
    // A stale capability matrix must never authorize a new deposit address.
    throw error;
  }
}

export function resetWhitebitCapabilityCacheForTests() {
  cached = null;
  refresh = null;
}

export function matchWhitebitCapability(
  snapshot: WhitebitCapabilitySnapshot,
  assetCode: string,
  networkCode: string,
) {
  const ticker = assetCode.trim().toUpperCase();
  const network = networkCode.trim().toUpperCase();
  const asset = snapshot.assets.find((candidate) => candidate.ticker === ticker);
  if (!asset || !asset.depositNetworks.includes(network)) return null;
  return {
    providerTicker: asset.ticker,
    providerNetwork: network,
    requiredConfirmations: asset.confirmations[network] ?? null,
  };
}

export async function whitebitSwapStatus() {
  const storedCredentials = await getWhitebitCredentialStorageState();
  const credentialsReady = storedCredentials.status === "available" ||
    Boolean(process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET);
  let setting: typeof whitebitProviderSettingsTable.$inferSelect | undefined;
  try {
    [setting] = await db.select().from(whitebitProviderSettingsTable)
      .where(eq(whitebitProviderSettingsTable.provider, "whitebit")).limit(1);
  } catch {
    // The setting table is additive; an unmigrated installation uses the
    // credential-readiness default and can still fall back safely.
    setting = undefined;
  }
  const disabled = setting?.disabled ?? true;
  try {
    const snapshot = await getWhitebitCapabilities();
    const rows = await db.select({
      assetCode: cryptoAssetsTable.code,
      networkCode: cryptoAssetNetworksTable.networkCode,
      assetEnabled: cryptoAssetsTable.enabled,
      networkEnabled: cryptoAssetNetworksTable.enabled,
      assetLifecycle: cryptoAssetsTable.lifecycle,
      networkLifecycle: cryptoAssetNetworksTable.lifecycle,
    }).from(cryptoAssetNetworksTable)
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetNetworksTable.assetId, cryptoAssetsTable.id));
    const matched = rows.filter((row) =>
      row.assetEnabled && row.networkEnabled &&
      row.assetLifecycle !== "deprecated" && row.networkLifecycle !== "deprecated" &&
      matchWhitebitCapability(snapshot, row.assetCode, row.networkCode),
    ).length;
    return {
      provider: "whitebit" as const,
      enabled: !disabled && credentialsReady,
      explicitDisabled: disabled,
      credentialsReady,
      state: disabled ? "disabled" as const : !credentialsReady ? "not_configured" as const : "ready" as const,
      lastCapabilitySyncAt: new Date(snapshot.fetchedAt).toISOString(),
      matchedRouteCount: matched,
      webhookReady: Boolean(process.env.WHITEBIT_WEBHOOK_API_KEY && process.env.WHITEBIT_WEBHOOK_SECRET),
    };
  } catch (error) {
    return {
      provider: "whitebit" as const,
      enabled: false,
      explicitDisabled: disabled,
      credentialsReady,
      state: disabled ? "disabled" as const : "unavailable" as const,
      lastCapabilitySyncAt: null,
      matchedRouteCount: 0,
      webhookReady: Boolean(process.env.WHITEBIT_WEBHOOK_API_KEY && process.env.WHITEBIT_WEBHOOK_SECRET),
      error: error instanceof Error ? error.message : "WhiteBIT capabilities unavailable",
    };
  }
}

export async function isWhitebitSwapEnabled(assetCode: string, networkCode: string) {
  const status = await whitebitSwapStatus();
  if (!status.enabled) return null;
  try {
    const snapshot = await getWhitebitCapabilities();
    return matchWhitebitCapability(snapshot, assetCode, networkCode);
  } catch {
    return null;
  }
}