import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { connect } from "node:tls";
import {
  activateQuickexCredentials,
  getQuickexCredentialStorageState,
  ProviderCredentialStateChangedError,
  quickexCredentialFingerprint,
  QUICKEX_VERIFICATION_VERSION,
  type QuickexCredentials,
} from "./provider-credentials";
import { logger } from "./logger";

const DEFAULT_BASE_URL = "https://quickex.io/api/v2";
const DEFAULT_READ_TIMEOUT_MS = 12_000;
const DEFAULT_CREATE_TIMEOUT_MS = 15_000;
const DEFAULT_CATALOG_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_STALE_TTL_MS = 15 * 60 * 1000;
const PAIR_CATALOG_PAGE_SIZE = 500;
const PAIR_CATALOG_BATCH_PAGES = 4;
const PAIR_CATALOG_MAX_PAGES = 128;

export type QuickexInstrument = {
  currencyTitle: string;
  networkTitle: string;
  slug: string;
  instrumentType: string;
  fullName: string;
  currencyFriendlyTitle: string;
  currencyLogoLink?: string;
  precisionDecimals: number;
  requiresMemo: boolean;
};

const QUICKEX_LOGO_PATHS = new Map([
  ["quickex.io", "/assets/coins/"],
  ["www.quickex.io", "/assets/coins/"],
  ["s2.coinmarketcap.com", "/static/img/coins/"],
]);

export function sanitizeQuickexLogoUrl(value: unknown): string | undefined {
  if (!usableString(value)) return undefined;
  try {
    const parsed = new URL(value);
    const allowedPath = QUICKEX_LOGO_PATHS.get(parsed.hostname.toLowerCase());
    return parsed.protocol === "https:" && allowedPath && parsed.pathname.startsWith(allowedPath)
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export type QuickexRateMode = "FLOATING" | "FIXED";

export type QuickexQuote = {
  instrumentFrom: QuickexInstrument;
  instrumentTo: QuickexInstrument;
  amountToGet: string;
  price: string;
  updatedAt: number;
  finalNetworkFeeAmount?: string;
  generalMinAmount?: string;
  generalMaxAmount?: string;
  rateMode: QuickexRateMode;
};
export type QuickexPair = {
  instrumentFromCurrencyTitle: string;
  instrumentFromNetworkTitle: string;
  instrumentToCurrencyTitle: string;
  instrumentToNetworkTitle: string;
};

type QuickexOrderResponse = {
  orderId?: string | number;
  legacyOrderId?: string;
  id?: string;
  uuid?: string;
  reference?: string;
  depositAddress?: string | {
    orderId?: string | number;
    depositAddress?: string;
    depositAddressMemo?: string | null;
  };
  state?: string;
  amountToGet?: string;
};

let quickexCreateQueue = Promise.resolve();
let runtimeCredentialProofRequired = false;
let runtimeVerifiedCredentialFingerprint: string | undefined;
let runtimeCredentialProofGeneration = 0;

function serializeQuickexCreate<T>(work: () => Promise<T>): Promise<T> {
  const previous = quickexCreateQueue;
  let release!: () => void;
  quickexCreateQueue = new Promise<void>((resolve) => { release = resolve; });
  return previous.then(work).finally(release);
}

export type QuickexErrorCode =
  | "QUOTE_INVALID"
  | "QUOTE_EXPIRED"
  | "QUOTE_MISMATCH"
  | "QUOTE_NOT_CONFIGURED"
  | "QUICKEX_AUTH"
  | "QUICKEX_AUTH_AMBIGUOUS"
  | "QUICKEX_ACCESS_BLOCKED"
  | "QUICKEX_RATE_LIMITED"
  | "QUICKEX_INVALID_ADDRESS"
  | "QUICKEX_INVALID_MEMO"
  | "QUICKEX_RATE_MODE_UNAVAILABLE"
  | "QUICKEX_AMOUNT_TOO_SMALL"
  | "QUICKEX_AMOUNT_TOO_LARGE"
  | "QUICKEX_ROUTE_INVALID"
  | "QUICKEX_VALIDATION"
  | "QUICKEX_MALFORMED_RESPONSE"
  | "QUICKEX_PROVIDER_UNAVAILABLE"
  | "QUICKEX_NETWORK"
  | "QUICKEX_TIMEOUT"
  | "QUICKEX_NOT_CONFIGURED";

export class QuickexApiError extends Error {
  public readonly status: number;
  public readonly code: QuickexErrorCode;
  public readonly providerStatus?: number;
  public readonly retryable: boolean;
  public readonly outcomeUnknown: boolean;
  constructor(message: string, status?: number);
  constructor(
    code: QuickexErrorCode,
    message: string,
    status?: number,
    providerStatus?: number,
    retryable?: boolean,
    outcomeUnknown?: boolean,
  );
  constructor(
    codeOrMessage: QuickexErrorCode | string,
    messageOrStatus?: string | number,
    status = 502,
    providerStatus?: number,
    retryable = false,
    outcomeUnknown = false,
  ) {
    const legacy = typeof messageOrStatus === "number" || messageOrStatus === undefined;
    const message = legacy ? codeOrMessage : messageOrStatus;
    const httpStatus = legacy ? (messageOrStatus as number | undefined) ?? status : status;
    super(message);
    this.name = "QuickexApiError";
    this.code = legacy ? "QUICKEX_VALIDATION" : codeOrMessage as QuickexErrorCode;
    this.status = httpStatus;
    this.providerStatus = legacy ? undefined : providerStatus;
    this.retryable = legacy ? false : retryable;
    this.outcomeUnknown = legacy ? false : outcomeUnknown;
  }
}

let instrumentCache: {
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  data: QuickexInstrument[];
} | undefined;
let instrumentRefresh: Promise<QuickexInstrument[]> | undefined;
let instrumentCacheLastFailureAt: number | undefined;
let instrumentCacheGeneration = 0;
type QuickexPairFilter = {
  fromCurrency?: string;
  fromNetwork?: string;
};
const pairCacheKey = (filter: QuickexPairFilter = {}) =>
  `${filter.fromCurrency?.trim().toUpperCase() ?? "*"}\0${filter.fromNetwork?.trim().toUpperCase() ?? "*"}`;
const pairCache = new Map<string, { expiresAt: number; data: QuickexPair[] }>();
const pairRefresh = new Map<string, Promise<QuickexPair[]>>();
let quickexAddressCache: { address: string; expiresAt: number } | undefined;
let quickexAddressRefresh: Promise<string> | undefined;

export function resetQuickexInstrumentCacheForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Quickex instrument cache resets are only available in tests.");
  }
  instrumentCache = undefined;
  instrumentRefresh = undefined;
  instrumentCacheLastFailureAt = undefined;
  instrumentCacheGeneration += 1;
  pairCache.clear();
  pairRefresh.clear();
}

export function getQuickexInstrumentCacheHealth() {
  const now = Date.now();
  return {
    ageMs: instrumentCache ? Math.max(0, now - instrumentCache.fetchedAt) : null,
    stale: !instrumentCache || instrumentCache.expiresAt <= now,
    lastFailureAt: instrumentCacheLastFailureAt
      ? new Date(instrumentCacheLastFailureAt).toISOString()
      : null,
  };
}

function config() {
  const numberEnv = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };
  return {
    baseUrl: (process.env.QUICKEX_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    readTimeoutMs: numberEnv("QUICKEX_READ_TIMEOUT_MS", DEFAULT_READ_TIMEOUT_MS),
    createTimeoutMs: numberEnv("QUICKEX_CREATE_TIMEOUT_MS", DEFAULT_CREATE_TIMEOUT_MS),
    catalogTimeoutMs: numberEnv("QUICKEX_CATALOG_TIMEOUT_MS", DEFAULT_CATALOG_TIMEOUT_MS),
  };
}

async function credentials() {
  const apiKey = process.env.QUICKEX_API_KEY?.trim();
  const explicitPublicKey = process.env.QUICKEX_PUBLIC_KEY?.trim();
  const explicitSecretKey = process.env.QUICKEX_SECRET_KEY?.trim();
  const stored = await getQuickexCredentialStorageState();
  if (stored.status === "available") {
    return {
      apiKeyConfigured: false,
      publicKeyConfigured: true,
      secretKeyConfigured: true,
      publicKey: stored.credentials.publicKey,
      secretKey: stored.credentials.secretKey,
      credentialSource: "stored" as const,
      updatedAt: stored.updatedAt.toISOString(),
      verificationVersion: stored.verificationVersion,
      verifiedCredentialFingerprint: stored.verifiedCredentialFingerprint,
      verifiedAt: stored.verifiedAt?.toISOString(),
      lastTestedAt: stored.lastTestedAt.toISOString(),
      storageUnavailable: false,
    };
  }
  if (stored.status === "unavailable") {
    return {
      apiKeyConfigured: false,
      publicKeyConfigured: false,
      secretKeyConfigured: false,
      publicKey: undefined,
      secretKey: undefined,
      credentialSource: "stored" as const,
      updatedAt: stored.updatedAt.toISOString(),
      verificationVersion: null,
      verifiedCredentialFingerprint: null,
      verifiedAt: undefined,
      lastTestedAt: undefined,
      storageUnavailable: true,
    };
  }
  const configured = Boolean(apiKey || explicitPublicKey || explicitSecretKey);
  return {
    apiKeyConfigured: Boolean(apiKey), publicKeyConfigured: Boolean(explicitPublicKey),
    secretKeyConfigured: Boolean(explicitSecretKey), publicKey: explicitPublicKey ?? apiKey,
    secretKey: explicitSecretKey,
    credentialSource: configured ? "environment" as const : "none" as const,
    updatedAt: undefined,
    verificationVersion: null,
    verifiedCredentialFingerprint: null,
    verifiedAt: undefined,
    lastTestedAt: undefined,
    storageUnavailable: false,
  };
}

export async function getQuickexCredentialStatus(canManage = false) {
  const keys = await credentials();
  const configured = Boolean(keys.publicKey && keys.secretKey);
  const remotelyAuthenticated = Boolean(
    configured &&
    keys.verificationVersion === QUICKEX_VERIFICATION_VERSION &&
    keys.verifiedCredentialFingerprint &&
    keys.verifiedCredentialFingerprint === quickexCredentialFingerprint({
      publicKey: keys.publicKey!,
      secretKey: keys.secretKey!,
    }) &&
    (!runtimeCredentialProofRequired ||
      runtimeVerifiedCredentialFingerprint === keys.verifiedCredentialFingerprint),
  );
  const signedOrders = remotelyAuthenticated;
  const verificationState = !configured
    ? "not_configured"
    : remotelyAuthenticated
      ? "verified"
      : "unverified";
  return {
    provider: "Quickex", liveQuotes: true, signedOrders,
    configured,
    remotelyAuthenticated,
    verificationState,
    providerReachability: "unknown",
    blockedByProviderPolicy: false,
    apiKeyConfigured: keys.apiKeyConfigured, publicKeyConfigured: keys.publicKeyConfigured,
    secretKeyConfigured: keys.secretKeyConfigured,
    credentialSource: keys.credentialSource,
    canManage,
    updatedAt: keys.updatedAt,
    lastTestedAt: keys.lastTestedAt,
    lastVerifiedAt: keys.verifiedAt,
    mode: keys.storageUnavailable
      ? "Stored credentials unavailable"
      : remotelyAuthenticated
        ? "Verified signed orders"
        : configured
          ? "Configured; verification required"
        : keys.apiKeyConfigured
          ? "Live quotes; signing keys required for orders"
          : "Public live quotes only",
    message: keys.storageUnavailable
      ? "Stored credentials must be updated before signed orders can run."
      : remotelyAuthenticated
        ? "Remote authentication is verified. Signed order creation is enabled."
        : configured
          ? "Credentials are configured but have not passed the current remote authentication proof. Signed orders remain disabled."
          : "Live quotes are enabled. Verified signing credentials are required for orders.",
    documentationUrl: "https://quickex.io/docs/api-v2",
  };
}

function providerErrorText(value: unknown, depth = 0): string {
  if (depth > 4) return "";
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = providerErrorText(item, depth + 1);
      if (candidate) return candidate;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  // Quickex validation failures commonly put the actionable reason under
  // data.address/data.memo while the top-level message is only "Http Exception".
  for (const key of ["address", "memo", "reason", "detail", "error_description", "error", "errors", "data", "message"]) {
    const candidate = record[key];
    const text = providerErrorText(candidate, depth + 1);
    if (text) return text;
  }
  return "";
}

function classifyProvider(status: number, detail: string): QuickexApiError {
  const text = detail.toLowerCase();
  if (status === 401 || /signature|api.?key|auth/.test(text))
    return new QuickexApiError("QUICKEX_AUTH", "Exchange service authorization failed.", 503, status);
  if (status === 403)
    return new QuickexApiError("QUICKEX_ACCESS_BLOCKED", "Exchange service access is blocked by provider or network policy.", 503, status);
  if (status === 429) return new QuickexApiError("QUICKEX_RATE_LIMITED", "Exchange service is temporarily busy.", 429, status, true);
  if (/memo|tag/.test(text)) return new QuickexApiError("QUICKEX_INVALID_MEMO", "The destination or refund memo is invalid.", 400, status);
  if (/address/.test(text)) return new QuickexApiError("QUICKEX_INVALID_ADDRESS", "The destination or refund address is invalid.", 400, status);
  if (/too small|min(imum)? amount/.test(text)) return new QuickexApiError("QUICKEX_AMOUNT_TOO_SMALL", "The amount is below the minimum for this route.", 400, status);
  if (/too large|max(imum)? amount/.test(text)) return new QuickexApiError("QUICKEX_AMOUNT_TOO_LARGE", "The amount is above the maximum for this route.", 400, status);
  if (/rate.?mode|fixed.?rate|floating.?rate/.test(text)) return new QuickexApiError("QUICKEX_RATE_MODE_UNAVAILABLE", "The requested rate type is unavailable for this route.", 422, status);
  if (/route|instrument|currency|network/.test(text)) return new QuickexApiError("QUICKEX_ROUTE_INVALID", "This exchange route is unavailable.", 422, status);
  if (status >= 500) return new QuickexApiError("QUICKEX_PROVIDER_UNAVAILABLE", "Exchange service is temporarily unavailable.", 503, status, true);
  return new QuickexApiError("QUICKEX_VALIDATION", "The exchange service rejected the request.", 400, status, true);
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : {}; } catch {
    if (!response.ok) {
      throw classifyProvider(response.status, text.slice(0, 500));
    }
    throw new QuickexApiError("QUICKEX_MALFORMED_RESPONSE", "The exchange service returned an invalid response.", 502, response.status);
  }
  if (!response.ok) throw classifyProvider(response.status, providerErrorText(parsed));
  return parsed as T;
}

function transportError(error: unknown, creating = false): QuickexApiError {
  const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return new QuickexApiError(
    timeout ? "QUICKEX_TIMEOUT" : "QUICKEX_NETWORK",
    timeout ? "The exchange service did not respond in time." : "Unable to reach the exchange service.",
    503, undefined, !creating, creating,
  );
}

async function probeTlsAddress(address: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const socket = connect({
      host: address,
      port: 443,
      servername: "quickex.io",
      rejectUnauthorized: true,
    });
    const finish = (error?: Error) => {
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve(address);
    };
    socket.setTimeout(5_000, () => finish(new Error("Quickex TLS probe timed out.")));
    socket.once("secureConnect", () => finish());
    socket.once("error", finish);
  });
}

async function resolveReachableQuickexAddress(): Promise<string> {
  if (quickexAddressCache && quickexAddressCache.expiresAt > Date.now()) {
    return quickexAddressCache.address;
  }
  if (quickexAddressRefresh) return quickexAddressRefresh;
  const refresh = (async () => {
    const addresses = [...new Set(
      (await lookup("quickex.io", { all: true, family: 4 })).map(({ address }) => address),
    )];
    if (!addresses.length) throw new Error("Quickex did not resolve to an IPv4 address.");
    const address = await Promise.any(addresses.map(probeTlsAddress));
    quickexAddressCache = { address, expiresAt: Date.now() + CACHE_TTL_MS };
    return address;
  })();
  quickexAddressRefresh = refresh;
  try {
    return await refresh;
  } finally {
    if (quickexAddressRefresh === refresh) quickexAddressRefresh = undefined;
  }
}

async function fetchQuickex(url: string, init: RequestInit, timeout: number): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "quickex.io") {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  }
  const address = await resolveReachableQuickexAddress();
  return await new Promise<Response>((resolve, reject) => {
    const requestHeaders: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      requestHeaders[name] = value;
    });
    requestHeaders.host = parsed.host;
    const request = httpsRequest({
      protocol: "https:",
      hostname: address,
      port: parsed.port ? Number(parsed.port) : 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: init.method,
      headers: requestHeaders,
      servername: parsed.hostname,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.set(name, String(value));
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode ?? 502,
          statusText: response.statusMessage,
          headers,
        }));
      });
      response.on("error", reject);
    });
    request.setTimeout(timeout, () => {
      const error = new Error("Quickex request timed out.");
      error.name = "TimeoutError";
      request.destroy(error);
    });
    request.on("error", (error) => {
      quickexAddressCache = undefined;
      reject(error);
    });
    if (typeof init.body === "string" || init.body instanceof Uint8Array) request.write(init.body);
    else if (init.body !== undefined && init.body !== null) {
      request.destroy(new TypeError("Unsupported Quickex request body."));
      return;
    }
    request.end();
  });
}

async function requestJson<T>(url: string, init: RequestInit, timeout: number, readOnly: boolean): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchQuickex(url, init, timeout);
      return await readJson<T>(response);
    } catch (error) {
      const classified = error instanceof QuickexApiError ? error : transportError(error, !readOnly);
      if (
        readOnly &&
        attempt === 0 &&
        classified.retryable &&
        classified.code !== "QUICKEX_RATE_LIMITED"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw classified;
    }
  }
}

function usableString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function canonicalPositiveInteger(value: unknown): string | undefined {
  const numeric = typeof value === "string" && /^[1-9]\d*$/.test(value)
    ? Number(value)
    : value;
  return Number.isSafeInteger(numeric) && Number(numeric) > 0
    ? String(numeric)
    : undefined;
}
function decimal(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}
function signedDecimal(value: unknown): value is string {
  return typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}
function validInstant(value: unknown): value is string {
  return usableString(value) && Number.isFinite(Date.parse(value));
}
function validateInstrument(value: unknown): QuickexInstrument {
  if (!value || typeof value !== "object") throw new Error();
  const item = value as Record<string, unknown>;
  for (const key of ["currencyTitle", "networkTitle", "slug", "instrumentType", "fullName", "currencyFriendlyTitle"])
    if (!usableString(item[key])) throw new Error();
  if (!Number.isInteger(item.precisionDecimals) || (item.precisionDecimals as number) < 0 || typeof item.requiresMemo !== "boolean") throw new Error();
  const currencyLogoLink = sanitizeQuickexLogoUrl(item.currencyLogoLink);
  return { ...item, currencyLogoLink } as QuickexInstrument;
}

export async function getQuickexInstruments(): Promise<QuickexInstrument[]> {
  const now = Date.now();
  if (instrumentCache && instrumentCache.expiresAt > now) return instrumentCache.data;
  if (instrumentRefresh) return instrumentRefresh;

  const generation = instrumentCacheGeneration;
  const refresh = (async () => {
    try {
      const { baseUrl, catalogTimeoutMs } = config();
      const raw = await requestJson<unknown>(
        `${baseUrl}/instruments/public`,
        { headers: { Accept: "application/json" } },
        catalogTimeoutMs,
        false,
      );
      let data: QuickexInstrument[];
      try {
        if (!Array.isArray(raw) || raw.length === 0) throw new Error();
        data = raw.map(validateInstrument);
      } catch {
        throw new QuickexApiError(
          "QUICKEX_MALFORMED_RESPONSE",
          "The exchange service returned an invalid asset catalog.",
        );
      }
      const fetchedAt = Date.now();
      if (generation === instrumentCacheGeneration) {
        instrumentCache = {
          fetchedAt,
          expiresAt: fetchedAt + CACHE_TTL_MS,
          staleUntil: fetchedAt + CACHE_TTL_MS + CACHE_STALE_TTL_MS,
          data,
        };
      }
      return data;
    } catch (error) {
      const failedAt = Date.now();
      if (generation === instrumentCacheGeneration) instrumentCacheLastFailureAt = failedAt;
      const staleCache = generation === instrumentCacheGeneration &&
        instrumentCache && instrumentCache.staleUntil > failedAt
        ? instrumentCache
        : undefined;
      logger.warn(
        {
          code: error instanceof QuickexApiError ? error.code : "UNKNOWN",
          providerStatus: error instanceof QuickexApiError ? error.providerStatus : undefined,
          cacheAgeMs: staleCache ? failedAt - staleCache.fetchedAt : undefined,
          staleFallback: Boolean(staleCache),
        },
        "Quickex instrument catalog refresh failed",
      );
      if (staleCache) return staleCache.data;
      if (generation === instrumentCacheGeneration) instrumentCache = undefined;
      throw error;
    }
  })();
  instrumentRefresh = refresh;
  try {
    return await refresh;
  } finally {
    if (instrumentRefresh === refresh) instrumentRefresh = undefined;
  }
}

export function getCachedQuickexInstruments(): QuickexInstrument[] | undefined {
  return instrumentCache && instrumentCache.staleUntil > Date.now()
    ? instrumentCache.data
    : undefined;
}

function validatePair(value: unknown): QuickexPair {
  if (!value || typeof value !== "object") throw new Error();
  const pair = value as Record<string, unknown>;
  const from = pair.instrumentFrom && typeof pair.instrumentFrom === "object"
    ? pair.instrumentFrom as Record<string, unknown>
    : pair;
  const to = pair.instrumentTo && typeof pair.instrumentTo === "object"
    ? pair.instrumentTo as Record<string, unknown>
    : pair;
  const keys = [
    from.currencyTitle ?? pair.instrumentFromCurrencyTitle,
    from.networkTitle ?? pair.instrumentFromNetworkTitle,
    to.currencyTitle ?? pair.instrumentToCurrencyTitle,
    to.networkTitle ?? pair.instrumentToNetworkTitle,
  ];
  if (!keys.every(usableString)) throw new Error();
  return {
    instrumentFromCurrencyTitle: keys[0] as string,
    instrumentFromNetworkTitle: keys[1] as string,
    instrumentToCurrencyTitle: keys[2] as string,
    instrumentToNetworkTitle: keys[3] as string,
  };
}

/** Cached active directed routes.  Unlike instruments, not every combination is tradable. */
export async function getQuickexPairs(filter: QuickexPairFilter = {}): Promise<QuickexPair[]> {
  const cacheKey = pairCacheKey(filter);
  const cached = pairCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = pairRefresh.get(cacheKey);
  if (pending) return pending;
  const refresh = (async () => {
    const { baseUrl, catalogTimeoutMs } = config();
    try {
      const raw: unknown[] = [];
      let complete = false;
      for (
        let firstPage = 0;
        firstPage < PAIR_CATALOG_MAX_PAGES && !complete;
        firstPage += PAIR_CATALOG_BATCH_PAGES
      ) {
        const pageCount = Math.min(
          PAIR_CATALOG_BATCH_PAGES,
          PAIR_CATALOG_MAX_PAGES - firstPage,
        );
        const pages = await Promise.all(
          Array.from({ length: pageCount }, async (_, pageIndex) => {
            const offset = (firstPage + pageIndex) * PAIR_CATALOG_PAGE_SIZE;
            const url = new URL(`${baseUrl}/pairs/public`);
            if (filter.fromCurrency) {
              url.searchParams.set("instrumentFromCurrencyTitle", filter.fromCurrency);
            }
            if (filter.fromNetwork) {
              url.searchParams.set("instrumentFromNetworkTitle", filter.fromNetwork);
            }
            url.searchParams.set("offset", String(offset));
            url.searchParams.set("limit", String(PAIR_CATALOG_PAGE_SIZE));
            const page = await requestJson<unknown>(
              url.toString(),
              { headers: { Accept: "application/json" } },
              catalogTimeoutMs,
              false,
            );
            if (!Array.isArray(page)) throw new Error();
            return page;
          }),
        );
        for (const page of pages) raw.push(...page);
        complete = pages.some((page) => page.length < PAIR_CATALOG_PAGE_SIZE);
      }
      if (!complete) {
        throw new QuickexApiError(
          "QUICKEX_MALFORMED_RESPONSE",
          "The exchange service returned an unexpectedly large pair catalog.",
        );
      }
      const seen = new Set<string>();
      const data = raw
        .filter(value => !value || typeof value !== "object" || (value as Record<string, unknown>).isActive !== false)
        .map(validatePair)
        .filter((pair) => {
          const key = [
            pair.instrumentFromCurrencyTitle,
            pair.instrumentFromNetworkTitle,
            pair.instrumentToCurrencyTitle,
            pair.instrumentToNetworkTitle,
          ].join("\0").toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      pairCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    } catch (error) {
      if (error instanceof QuickexApiError) throw error;
      throw new QuickexApiError("QUICKEX_MALFORMED_RESPONSE", "The exchange service returned an invalid pair catalog.");
    }
  })();
  pairRefresh.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    if (pairRefresh.get(cacheKey) === refresh) pairRefresh.delete(cacheKey);
  }
}

export function getCachedQuickexPairs(filter: QuickexPairFilter = {}): QuickexPair[] | undefined {
  return pairCache.get(pairCacheKey(filter))?.data;
}

export async function validateQuickexAddress(input: {
  currencyTitle: string; networkTitle: string; address: string; memo?: string;
}): Promise<void> {
  const { baseUrl, readTimeoutMs } = config();
  const keys = await credentials();
  if (!keys.publicKey || !keys.secretKey) {
    throw new QuickexApiError(
      "QUICKEX_NOT_CONFIGURED",
      "Signed address validation is not configured.",
      503,
    );
  }
  const payload: Record<string, string> = {
    currencyTitle: input.currencyTitle, networkTitle: input.networkTitle, address: input.address,
  };
  if (input.memo) payload.memo = input.memo;
  const body = JSON.stringify(payload);
  try {
    await requestJson<unknown>(
      `${baseUrl}/instruments/validate-address`,
      {
        method: "POST",
        headers: signedHeaders(body, {
          publicKey: keys.publicKey,
          secretKey: keys.secretKey,
        }),
        body,
      },
      readTimeoutMs,
      true,
    );
  } catch (error) {
    if (
      error instanceof QuickexApiError &&
      (error.code === "QUICKEX_AUTH" || error.code === "QUICKEX_ACCESS_BLOCKED") &&
      error.providerStatus === 403
    ) {
      logger.warn(
        { providerStatus: error.providerStatus },
        "Quickex address preflight is forbidden; deferring validation to signed order creation",
      );
      return;
    }
    throw error;
  }
}

async function resolveInstrument(currencyTitle: string, networkTitle: string) {
  const instrument = (await getQuickexInstruments()).find((item) =>
    item.currencyTitle.toUpperCase() === currencyTitle.toUpperCase() && item.networkTitle.toUpperCase() === networkTitle.toUpperCase());
  if (!instrument) throw new QuickexApiError("QUICKEX_ROUTE_INVALID", "This exchange route is unavailable.", 422);
  return instrument;
}

function validateQuotedInstrument(
  value: unknown,
  expected?: QuickexInstrument,
): QuickexInstrument {
  const item = value as Record<string, unknown>;
  if (
    !item ||
    typeof item !== "object" ||
    !usableString(item.currencyTitle) ||
    !usableString(item.networkTitle) ||
    !usableString(item.slug) ||
    !Number.isInteger(item.precisionDecimals) ||
    (item.precisionDecimals as number) < 0
  ) {
    throw new Error();
  }
  if (
    expected &&
    (item.currencyTitle !== expected.currencyTitle ||
      item.networkTitle !== expected.networkTitle ||
      item.slug !== expected.slug)
  ) {
    throw new Error();
  }
  return expected ?? {
    currencyTitle: item.currencyTitle as string,
    networkTitle: item.networkTitle as string,
    slug: item.slug as string,
    precisionDecimals: item.precisionDecimals as number,
    instrumentType: typeof item.instrumentType === "string" ? item.instrumentType : "",
    fullName: typeof item.fullName === "string" ? item.fullName : item.currencyTitle as string,
    currencyFriendlyTitle: typeof item.currencyFriendlyTitle === "string"
      ? item.currencyFriendlyTitle
      : item.currencyTitle as string,
    requiresMemo: typeof item.requiresMemo === "boolean" ? item.requiresMemo : false,
  };
}

function validateQuote(
  value: unknown,
  expectedFrom?: QuickexInstrument,
  expectedTo?: QuickexInstrument,
  expectedRateMode?: QuickexRateMode,
): QuickexQuote {
  const quote = value as Record<string, unknown>;
  let result: QuickexQuote;
  try {
    result = {
      ...quote,
      instrumentFrom: validateQuotedInstrument(quote.instrumentFrom, expectedFrom),
      instrumentTo: validateQuotedInstrument(quote.instrumentTo, expectedTo),
    } as QuickexQuote;
    if (!decimal(result.amountToGet) || !decimal(result.price) || !Number.isFinite(result.updatedAt) || !["FLOATING", "FIXED"].includes(result.rateMode) ||
      (result.finalNetworkFeeAmount !== undefined && !decimal(result.finalNetworkFeeAmount)) ||
      (result.generalMinAmount !== undefined && !decimal(result.generalMinAmount)) ||
      (result.generalMaxAmount !== undefined && !decimal(result.generalMaxAmount))) throw new Error();
  } catch { throw new QuickexApiError("QUICKEX_MALFORMED_RESPONSE", "The exchange service returned an invalid quote."); }
  if (expectedRateMode && result.rateMode !== expectedRateMode) {
    throw new QuickexApiError(
      "QUICKEX_RATE_MODE_UNAVAILABLE",
      `The selected rate type is unavailable for this route.`,
      422,
    );
  }
  return result;
}

export async function getQuickexQuote(input: { fromCurrency: string; fromNetwork: string; toCurrency: string; toNetwork: string; amount: number; rateMode?: QuickexRateMode }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new QuickexApiError("QUICKEX_VALIDATION", "A valid positive amount is required.", 400);
  const rateMode = input.rateMode ?? "FLOATING";
  const [instrumentFrom, instrumentTo] = await Promise.all([resolveInstrument(input.fromCurrency, input.fromNetwork), resolveInstrument(input.toCurrency, input.toNetwork)]);
  const params = new URLSearchParams({ instrumentFromCurrencyTitle: instrumentFrom.currencyTitle, instrumentFromNetworkTitle: instrumentFrom.networkTitle, instrumentToCurrencyTitle: instrumentTo.currencyTitle, instrumentToNetworkTitle: instrumentTo.networkTitle, instrumentFromSlug: instrumentFrom.slug, instrumentToSlug: instrumentTo.slug, claimedDepositAmountCurrency: instrumentFrom.currencyTitle, claimedDepositAmount: String(input.amount), rateMode, exchangeType: "crypto", markup: "0" });
  const { baseUrl, readTimeoutMs } = config();
  const ensureRoute = (quote: QuickexQuote) => {
    if (quote.instrumentFrom.slug !== instrumentFrom.slug || quote.instrumentTo.slug !== instrumentTo.slug)
      throw new QuickexApiError("QUICKEX_MALFORMED_RESPONSE", "The exchange service returned a quote for a different route.");
    return quote;
  };
  try {
    return ensureRoute(validateQuote(
      await requestJson<unknown>(`${baseUrl}/rates/public/one?${params}`, { headers: { Accept: "application/json" } }, readTimeoutMs, true),
      instrumentFrom,
      instrumentTo,
      rateMode,
    ));
  } catch (error) {
    if (!(error instanceof QuickexApiError) || !["QUICKEX_AMOUNT_TOO_SMALL", "QUICKEX_AMOUNT_TOO_LARGE"].includes(error.code)) throw error;
    const limits = new URLSearchParams(params); limits.delete("claimedDepositAmount");
    const quote = ensureRoute(validateQuote(
      await requestJson<unknown>(`${baseUrl}/rates/public/one?${limits}`, { headers: { Accept: "application/json" } }, readTimeoutMs, true),
      instrumentFrom,
      instrumentTo,
      rateMode,
    ));
    const min = error.code === "QUICKEX_AMOUNT_TOO_SMALL";
    const limit = min ? quote.generalMinAmount : quote.generalMaxAmount;
    if (limit) throw new QuickexApiError(error.code, `Enter ${min ? "at least" : "no more than"} ${limit} ${input.fromCurrency} for this route.`, 400, error.providerStatus);
    throw error;
  }
}

function signedHeaders(
  body: string,
  keys: QuickexCredentials,
) {
  if (!keys.publicKey || !keys.secretKey) throw new QuickexApiError("QUICKEX_NOT_CONFIGURED", "Signed orders are not configured.", 503);
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", keys.secretKey).update(`${timestamp}${body}${keys.publicKey}`).digest("base64");
  return { Accept: "application/json", "Content-Type": "application/json", "X-Api-Public-Key": keys.publicKey, "X-Api-Timestamp": timestamp, "X-Api-Signature": signature };
}

type QuickexCreateProof = {
  generation: number;
  fingerprint: string;
};

function requireQuickexCreateProof(
  keys: QuickexCredentials,
): QuickexCreateProof {
  const fingerprint = quickexCredentialFingerprint(keys);
  if (
    runtimeCredentialProofRequired &&
    runtimeVerifiedCredentialFingerprint !== fingerprint
  ) {
    throw new QuickexApiError(
      "QUICKEX_NOT_CONFIGURED",
      "Signed orders do not have a current remote authentication proof.",
      503,
    );
  }
  return {
    generation: runtimeCredentialProofGeneration,
    fingerprint,
  };
}

function assertQuickexCreateProof(
  proof: QuickexCreateProof,
  keys: QuickexCredentials,
): void {
  const fingerprint = quickexCredentialFingerprint(keys);
  if (
    proof.generation !== runtimeCredentialProofGeneration ||
    proof.fingerprint !== fingerprint ||
    (runtimeCredentialProofRequired &&
      runtimeVerifiedCredentialFingerprint !== fingerprint)
  ) {
    throw new QuickexApiError(
      "QUICKEX_NOT_CONFIGURED",
      "Signed order authentication changed before submission.",
      503,
    );
  }
}

export function createQuickexOrder(input: { fromCurrency: string; fromNetwork: string; toCurrency: string; toNetwork: string; amount: number; destinationAddress: string; destinationMemo?: string; refundAddress?: string; refundMemo?: string; email: string; rateMode?: QuickexRateMode; quote?: QuickexQuote }) {
  return serializeQuickexCreate(() => createQuickexOrderSerial(input));
}

async function createQuickexOrderSerial(input: { fromCurrency: string; fromNetwork: string; toCurrency: string; toNetwork: string; amount: number; destinationAddress: string; destinationMemo?: string; refundAddress?: string; refundMemo?: string; email: string; rateMode?: QuickexRateMode; quote?: QuickexQuote }) {
  const rateMode = input.rateMode ?? "FLOATING";
  const quote = input.quote ? validateQuote(input.quote, undefined, undefined, rateMode) : await getQuickexQuote(input);
  if (
    quote.instrumentFrom.currencyTitle !== input.fromCurrency ||
    quote.instrumentFrom.networkTitle !== input.fromNetwork ||
    quote.instrumentTo.currencyTitle !== input.toCurrency ||
    quote.instrumentTo.networkTitle !== input.toNetwork
  ) throw new QuickexApiError("QUICKEX_ROUTE_INVALID", "The quote does not match the requested route.", 422);
  const min = Number(quote.generalMinAmount), max = Number(quote.generalMaxAmount);
  if (Number.isFinite(min) && input.amount < min) throw new QuickexApiError("QUICKEX_AMOUNT_TOO_SMALL", `Enter at least ${quote.generalMinAmount} ${input.fromCurrency} for this route.`, 400);
  if (Number.isFinite(max) && input.amount > max) throw new QuickexApiError("QUICKEX_AMOUNT_TOO_LARGE", `Enter no more than ${quote.generalMaxAmount} ${input.fromCurrency} for this route.`, 400);
  const payload: Record<string, unknown> = { instrumentFrom: { currencyTitle: quote.instrumentFrom.currencyTitle, networkTitle: quote.instrumentFrom.networkTitle }, instrumentTo: { currencyTitle: quote.instrumentTo.currencyTitle, networkTitle: quote.instrumentTo.networkTitle }, destinationAddress: input.destinationAddress, claimedDepositAmount: String(input.amount), claimedPublicRate: { price: quote.price, updatedAt: new Date(quote.updatedAt).toISOString(), claimedAmountToReceive: quote.amountToGet }, claimedNetworkFee: quote.finalNetworkFeeAmount, rateMode, locale: "en" };
  if (input.destinationMemo !== undefined) payload.destinationAddressMemo = input.destinationMemo;
  if (input.refundAddress) payload.refundAddress = input.refundAddress;
  if (input.refundAddress && input.refundMemo !== undefined) payload.refundAddressMemo = input.refundMemo;
  const body = JSON.stringify(payload), { baseUrl, createTimeoutMs } = config();
  let order: QuickexOrderResponse;
  const keys = await credentials();
  if (!keys.publicKey || !keys.secretKey) {
    throw new QuickexApiError("QUICKEX_NOT_CONFIGURED", "Signed orders are not configured.", 503);
  }
  const activeKeys: QuickexCredentials = {
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  };
  const createProof = requireQuickexCreateProof(activeKeys);
  let orderIdsBeforeCreate: Set<number> | undefined;
  try {
    orderIdsBeforeCreate = new Set(
      (await listQuickexOrdersWithCredentials(activeKeys)).map((item) => item.orderId),
    );
  } catch {
    // A numeric ID returned directly by create remains authoritative. The
    // snapshot is only needed for Quickex responses that expose a UUID alone.
  }
  assertQuickexCreateProof(createProof, activeKeys);
  try { order = await requestJson<QuickexOrderResponse>(`${baseUrl}/orders/public/create`, { method: "POST", headers: signedHeaders(body, activeKeys), body }, createTimeoutMs, false); }
  catch (error) {
    if (error instanceof QuickexApiError && (["QUICKEX_TIMEOUT", "QUICKEX_NETWORK", "QUICKEX_MALFORMED_RESPONSE", "QUICKEX_PROVIDER_UNAVAILABLE"].includes(error.code) || (error.providerStatus ?? 0) >= 500))
      throw new QuickexApiError(error.code, error.message, error.status, error.providerStatus, false, true);
    throw error;
  }
  const depositAddress = typeof order.depositAddress === "string" ? order.depositAddress : order.depositAddress?.depositAddress;
  const topLevelOrderId = canonicalPositiveInteger(order.orderId);
  const nestedOrderId = typeof order.depositAddress === "object"
    ? canonicalPositiveInteger(order.depositAddress.orderId)
    : undefined;
  let providerOrderId = nestedOrderId ?? topLevelOrderId;
  if (!providerOrderId && orderIdsBeforeCreate) {
    try {
      for (let attempt = 0; attempt < 3 && !providerOrderId; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        const afterCreate = await listQuickexOrdersWithCredentials(activeKeys);
        const newlyCreated = afterCreate.filter((item) => !orderIdsBeforeCreate!.has(item.orderId));
        if (newlyCreated.length === 1) providerOrderId = String(newlyCreated[0]!.orderId);
        if (newlyCreated.length > 1) break;
      }
    } catch {
      // Preserve the provider UUID and deposit instructions. Status remains
      // safely pending if the exact numeric identity cannot yet be established.
    }
  }
  const providerReference = [
    order.legacyOrderId,
    order.id,
    order.uuid,
    order.reference,
    topLevelOrderId ? undefined : order.orderId,
  ].find(usableString);
  if ((!providerOrderId && !providerReference) || !usableString(depositAddress)) {
    throw new QuickexApiError("QUICKEX_MALFORMED_RESPONSE", "The exchange service returned an incomplete order response.", 502, undefined, false, true);
  }
  return {
    order: {
      orderId: providerReference ?? providerOrderId!,
      providerOrderId,
      providerReference,
      depositAddress,
      depositMemo: typeof order.depositAddress === "object"
        ? order.depositAddress.depositAddressMemo ?? undefined
        : undefined,
      state: order.state,
      amountToGet: order.amountToGet,
    },
    quote,
  };
}

export type QuickexOrderListItem = { orderId: number; providerReference: string | null; destinationAddress: string | null; refundAddress: string | null; claimedDepositAmount: string | null; amountToGet: string | null; amountToWithdrawFact: string | null; instrumentFromCurrencyTitle: string; instrumentFromNetworkTitle: string; instrumentToCurrencyTitle: string; instrumentToNetworkTitle: string; createdAt: string; updatedAt: string; completed: boolean; state: string; };

function validateOrder(value: unknown): QuickexOrderListItem {
  const o = value as Record<string, unknown>;
  const numericOrderId = typeof o?.orderId === "string" && /^[1-9]\d*$/.test(o.orderId)
    ? Number(o.orderId)
    : o?.orderId;
  if (!o || typeof o !== "object" || !Number.isSafeInteger(numericOrderId) || Number(numericOrderId) <= 0 || !usableString(o.instrumentFromCurrencyTitle) || !usableString(o.instrumentToCurrencyTitle) || !usableString(o.instrumentFromNetworkTitle) || !usableString(o.instrumentToNetworkTitle) || !validInstant(o.createdAt) || !validInstant(o.updatedAt) || typeof o.completed !== "boolean" || typeof o.state !== "string") throw new Error();
  for (const key of ["destinationAddress", "refundAddress"]) {
    if (o[key] !== null && typeof o[key] !== "string") throw new Error();
  }
  if (o.claimedDepositAmount !== null && !decimal(o.claimedDepositAmount)) throw new Error();
  for (const key of ["amountToGet", "amountToWithdrawFact"]) {
    if (o[key] !== null && !signedDecimal(o[key])) throw new Error();
  }
  const providerReference = [o.id, o.uuid, o.providerReference, o.reference]
    .find((candidate) => usableString(candidate));
  return {
    ...o,
    orderId: numericOrderId,
    providerReference: providerReference as string | undefined ?? null,
  } as QuickexOrderListItem;
}

export async function listQuickexOrders(): Promise<QuickexOrderListItem[]> {
  const keys = await credentials();
  if (!keys.publicKey || !keys.secretKey) {
    throw new QuickexApiError("QUICKEX_NOT_CONFIGURED", "Signed orders are not configured.", 503);
  }
  return listQuickexOrdersWithCredentials({
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  });
}

async function listQuickexOrdersWithCredentials(
  keys: QuickexCredentials,
  invalidSignature = false,
): Promise<QuickexOrderListItem[]> {
  const { baseUrl, readTimeoutMs } = config();
  const headers = signedHeaders("", keys);
  if (invalidSignature) {
    const bytes = Buffer.from(headers["X-Api-Signature"], "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    headers["X-Api-Signature"] = bytes.toString("base64");
  }
  const raw = await requestJson<unknown>(`${baseUrl}/orders/public`, { headers }, readTimeoutMs, true);
  try { if (!Array.isArray(raw)) throw new Error(); return raw.map(validateOrder); }
  catch { throw new QuickexApiError("QUICKEX_MALFORMED_RESPONSE", "The exchange service returned an invalid order list."); }
}

export function mapQuickexState(state: string | undefined, completed?: boolean) {
  if (completed) return "completed";
  const normalized = (state ?? "").trim().toLowerCase();
  if (!normalized) return "pending";
  if (/refund/.test(normalized)) return "refunded";
  if (/expire|overdue/.test(normalized)) return "expired";
  if (/fail|error|reject|cancel/.test(normalized)) return "failed";
  if (/hold|frozen|verif|kyc|aml/.test(normalized)) return "on hold";
  if (/send|withdraw|payout/.test(normalized)) return "sending payout";
  if (/exchang|trade|convert|process/.test(normalized)) return "exchanging";
  if (/received|confirm/.test(normalized)) return "deposit received";
  if (/created|new|wait|await|deposit|pending/.test(normalized)) return "awaiting deposit";
  return "pending";
}

export const TERMINAL_STATUSES = ["completed", "refunded", "expired", "failed", "cancelled"] as const;
export function isTerminalStatus(status: string) { return (TERMINAL_STATUSES as readonly string[]).includes(status.toLowerCase()); }

export async function testQuickexConnection() {
  const status = await getQuickexCredentialStatus();
  const checkedAt = new Date().toISOString();
  try {
    await getQuickexInstruments();
  } catch {
    return { ok: false, provider: "Quickex", publicApiReachable: false, signedApiReachable: false, remotelyAuthenticated: status.remotelyAuthenticated, authenticationState: "unreachable" as const, blockedByProviderPolicy: false, checkedAt, message: "Quickex public market data is currently unreachable." };
  }
  if (!status.configured) return { ok: false, provider: "Quickex", publicApiReachable: true, signedApiReachable: false, remotelyAuthenticated: false, authenticationState: "not_configured" as const, blockedByProviderPolicy: false, checkedAt, message: "Public market data is reachable, but signing credentials are not configured." };
  if (!status.remotelyAuthenticated) return { ok: false, provider: "Quickex", publicApiReachable: true, signedApiReachable: false, remotelyAuthenticated: false, authenticationState: "ambiguous" as const, blockedByProviderPolicy: false, checkedAt, message: "Credentials are configured but do not have current remote authentication proof. Re-enter them to verify access." };
  try {
    await listQuickexOrders();
    return { ok: true, provider: "Quickex", publicApiReachable: true, signedApiReachable: true, remotelyAuthenticated: true, authenticationState: "verified" as const, blockedByProviderPolicy: false, checkedAt, message: "The signed Quickex V2 Order API is authenticated and reachable. No exchange was created by this diagnostic." };
  } catch (error) {
    const blocked = error instanceof QuickexApiError && error.code === "QUICKEX_ACCESS_BLOCKED";
    const rejected = error instanceof QuickexApiError && error.code === "QUICKEX_AUTH";
    return { ok: false, provider: "Quickex", publicApiReachable: true, signedApiReachable: false, remotelyAuthenticated: false, authenticationState: blocked ? "blocked" as const : rejected ? "rejected" as const : "unreachable" as const, blockedByProviderPolicy: blocked, checkedAt, message: blocked ? "Quickex is blocking signed API access from this network or account policy." : rejected ? "Quickex rejected the configured credentials." : "The signed Quickex API is currently unreachable." };
  }
}

export async function testQuickexCredentials(
  input: QuickexCredentials,
) {
  await getQuickexInstruments();
  await listQuickexOrdersWithCredentials(input); // Signed endpoint must remain queryless.
  try {
    await listQuickexOrdersWithCredentials(input, true);
  } catch (error) {
    if (error instanceof QuickexApiError && error.code === "QUICKEX_AUTH") {
      const verifiedAt = new Date();
      return {
        result: {
          ok: true,
          provider: "Quickex",
          publicApiReachable: true,
          signedApiReachable: true,
          remotelyAuthenticated: true,
          authenticationState: "verified" as const,
          blockedByProviderPolicy: false,
          checkedAt: verifiedAt.toISOString(),
          message: "The signed Quickex V2 Order API is authenticated and reachable. No exchange was created by this diagnostic.",
        },
        verification: {
          version: QUICKEX_VERIFICATION_VERSION as 1,
          fingerprint: quickexCredentialFingerprint(input),
          verifiedAt,
        },
      };
    }
    throw error;
  }
  throw new QuickexApiError(
    "QUICKEX_AUTH_AMBIGUOUS",
    "Quickex did not reject an invalid control signature, so remote authentication could not be proven.",
    503,
  );
}

export function acceptQuickexRuntimeVerification(
  verification: {
    version: number;
    fingerprint: string;
  },
): void {
  if (verification.version !== QUICKEX_VERIFICATION_VERSION) {
    throw new Error("Quickex runtime verification version is unsupported.");
  }
  runtimeCredentialProofRequired = true;
  runtimeVerifiedCredentialFingerprint = verification.fingerprint;
  runtimeCredentialProofGeneration += 1;
}

export function resetQuickexRuntimeVerificationForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Quickex runtime verification reset requires NODE_ENV=test.");
  }
  runtimeCredentialProofRequired = false;
  runtimeVerifiedCredentialFingerprint = undefined;
  runtimeCredentialProofGeneration += 1;
}

export function invalidateQuickexRuntimeVerificationForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Quickex runtime verification invalidation requires NODE_ENV=test.");
  }
  runtimeCredentialProofRequired = true;
  runtimeVerifiedCredentialFingerprint = undefined;
  runtimeCredentialProofGeneration += 1;
}

export async function bootstrapQuickexCredentialVerification(): Promise<
  "not_configured" | "verified" | "superseded"
> {
  runtimeCredentialProofRequired = true;
  runtimeVerifiedCredentialFingerprint = undefined;
  runtimeCredentialProofGeneration += 1;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stored = await getQuickexCredentialStorageState();
    const environmentPublicKey =
      process.env.QUICKEX_PUBLIC_KEY?.trim() ||
      process.env.QUICKEX_API_KEY?.trim();
    const environmentSecretKey = process.env.QUICKEX_SECRET_KEY?.trim();
    const candidate = stored.status === "available"
      ? {
          credentials: stored.credentials,
          source: "stored" as const,
          expectedUpdatedAt: stored.updatedAt,
        }
      : environmentPublicKey && environmentSecretKey
        ? {
            credentials: {
              publicKey: environmentPublicKey,
              secretKey: environmentSecretKey,
            },
            source: "environment" as const,
            expectedUpdatedAt: stored.status === "absent"
              ? null
              : stored.updatedAt,
          }
        : null;
    if (!candidate) return "not_configured";

    const { verification } = await testQuickexCredentials(candidate.credentials);
    try {
      await activateQuickexCredentials(
        candidate.credentials,
        {
          actorClerkUserId: null,
          operatorId: null,
          operatorEmail: null,
          requestId: null,
          action: "provider.quickex_credentials_bootstrap_verified",
          credentialSource: candidate.source,
        },
        verification,
        { expectedUpdatedAt: candidate.expectedUpdatedAt },
      );
      acceptQuickexRuntimeVerification(verification);
      return "verified";
    } catch (error) {
      if (
        error instanceof ProviderCredentialStateChangedError &&
        attempt === 0
      ) continue;
      if (error instanceof ProviderCredentialStateChangedError) {
        return "superseded";
      }
      throw error;
    }
  }
  return "superseded";
}