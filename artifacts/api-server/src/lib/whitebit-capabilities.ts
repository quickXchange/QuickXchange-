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

export type WhitebitCatalogNetwork = {
  providerNetwork: string;
  canDeposit: boolean;
  canWithdraw: boolean;
  confirmations: number | null;
  requiresMemo: boolean;
  metadata: Record<string, unknown>;
};

export type WhitebitCatalogAsset = {
  providerTicker: string;
  normalizedTicker: string;
  name: string;
  precision: number;
  canDeposit: boolean;
  canWithdraw: boolean;
  defaultNetwork: string | null;
  metadata: Record<string, unknown>;
  networks: WhitebitCatalogNetwork[];
};

const catalogNetworkLimit = 128;
function jsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => jsonSafe(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 32).map(([k, v]) => [k, jsonSafe(v, depth + 1)]));
  return undefined;
}

/**
 * Parse the complete public catalog without changing the strict capability
 * parser above. Invalid entries are ignored (fiat and malformed provider
 * rows must never make order funding permissive).
 */
export function parseWhitebitCatalogAssets(value: unknown): WhitebitCatalogAsset[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const result: WhitebitCatalogAsset[] = [];
  for (const [rawTicker, rawValue] of Object.entries(value)) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    const row = rawValue as Record<string, unknown>;
    // WhiteBIT fiat rows have a providers object. A network-only fiat row is
    // also excluded by its well-known settlement network names.
    if (row.providers && typeof row.providers === "object") continue;
    const ticker = rawTicker.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,16}$/.test(ticker) || /^(USD|EUR|GBP|PLN|UAH|TRY|RUB|CHF|CAD|AUD|JPY)$/.test(ticker)) continue;
    const precisionRaw = row.precision ?? row.decimals ?? row.currency_precision;
    const precision = Number.isInteger(precisionRaw) ? Number(precisionRaw) : 8;
    if (precision < 0 || precision > 30) continue;
    const networksRaw = row.networks;
    if (!networksRaw || typeof networksRaw !== "object" || Array.isArray(networksRaw)) continue;
    const networks = networksRaw as Record<string, unknown>;
    const deposits = Array.isArray(networks.deposits) ? networks.deposits : [];
    const withdrawals = Array.isArray(networks.withdraws) ? networks.withdraws : [];
    const names = [...new Set([...deposits, ...withdrawals].filter((n): n is string => typeof n === "string" && !!n.trim()).map((n) => n.trim().toUpperCase()).filter((n) => n.length <= 32))].slice(0, catalogNetworkLimit);
    if (!names.length) continue;
    const confirmations = row.confirmations && typeof row.confirmations === "object" && !Array.isArray(row.confirmations)
      ? row.confirmations as Record<string, unknown> : {};
    const depositSet = new Set(deposits.filter((n): n is string => typeof n === "string").map((n) => n.trim().toUpperCase()));
    const withdrawalSet = new Set(withdrawals.filter((n): n is string => typeof n === "string").map((n) => n.trim().toUpperCase()));
    const memo = row.memo && typeof row.memo === "object" ? row.memo as Record<string, unknown> : {};
    const isMemo = row.is_memo === true;
    const limits = row.limits && typeof row.limits === "object" ? row.limits as Record<string, unknown> : {};
    const depositLimits = limits.deposit && typeof limits.deposit === "object" ? limits.deposit as Record<string, unknown> : {};
    const withdrawLimits = limits.withdraw && typeof limits.withdraw === "object" ? limits.withdraw as Record<string, unknown> : {};
    result.push({
      providerTicker: rawTicker.trim(),
      normalizedTicker: ticker,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 100) : ticker,
      precision,
      canDeposit: row.can_deposit === true,
      canWithdraw: row.can_withdraw === true,
      defaultNetwork: typeof networks.default === "string" ? networks.default.trim().toUpperCase() : null,
      metadata: { providerTicker: rawTicker.trim(), can_deposit: row.can_deposit === true, can_withdraw: row.can_withdraw === true },
      networks: names.map((network) => {
        const rawConfirmation = confirmations[network];
        const bounded = {
          default: network === (typeof networks.default === "string" ? networks.default.trim().toUpperCase() : ""),
          memo: { deposit: memo.deposit ?? null, withdraw: memo.withdraw ?? null, is_memo: isMemo },
          limits: { deposit: jsonSafe(depositLimits[network]), withdraw: jsonSafe(withdrawLimits[network]) },
        };
        return { providerNetwork: network, canDeposit: depositSet.has(network), canWithdraw: withdrawalSet.has(network),
          confirmations: Number.isInteger(rawConfirmation) && Number(rawConfirmation) >= 0 && Number(rawConfirmation) <= 10_000
            ? Number(rawConfirmation) : null,
          requiresMemo: isMemo || Boolean(memo.deposit) || Boolean(memo.withdraw), metadata: bounded };
      }),
    });
  }
  return result;
}

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

export function shouldReserveWhitebitOrderFunding(
  status: {
    enabled: boolean;
    explicitDisabled: boolean;
    credentialsReady: boolean;
    state: string;
  },
  capability: unknown,
): boolean {
  if (capability) return true;
  return !status.explicitDisabled &&
    status.credentialsReady &&
    status.state === "unavailable";
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