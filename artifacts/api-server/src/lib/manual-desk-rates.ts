import { ApiError } from "./api-error";
import { listEnabledFiatCurrencies } from "./fiat-currencies";

const DEFAULT_ONEFORGE_BASE_URL = "https://api.1forge.com";
const DEFAULT_COINBASE_USD_RATES_URL = "https://api.coinbase.com/v2/exchange-rates?currency=USD";
const DEFAULT_KRAKEN_XMR_USD_TICKER_URL =
  "https://api.kraken.com/0/public/Ticker?pair=XMRUSD";
const REQUEST_TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 30_000;
const MAX_CONTRACT_SIGNIFICANT_DIGITS = 15;

export const MAX_MANUAL_DESK_TARGET_PRECISION = 8;

type DecimalValue = {
  coefficient: bigint; scale: number;
  observedAt?: string; timestampKind?: "upstreamObservedAt" | "fetchedAt";
  provider?: "1Forge" | "manual" | "Coinbase" | "USD identity" | "test adapter";
};
type ManualDeskRateValue = string | number;
type ValidatedRates = Record<string, DecimalValue>;
type RateCacheEntry = { value: ValidatedRates; expiresAt: number; fetchedAt: number };

export type ManualDeskRateAdapter = () => Promise<Record<string, ManualDeskRateValue>>;
export type ManualDeskMarketAdapters = {
  fiat: ManualDeskRateAdapter;
  crypto: ManualDeskRateAdapter;
};

let adapterForTests: ManualDeskRateAdapter | undefined;
let marketAdaptersForTests: ManualDeskMarketAdapters | undefined;
let fiatCachedRates: RateCacheEntry | undefined;
let cryptoCachedRates: RateCacheEntry | undefined;
let fiatRequestInFlight: Promise<ValidatedRates> | undefined;
let cryptoRequestInFlight: Promise<ValidatedRates> | undefined;
let fiatLastFailureAt: number | undefined;
let fiatCacheGeneration = 0;

function resetRateState() {
  fiatCachedRates = undefined;
  cryptoCachedRates = undefined;
  fiatRequestInFlight = undefined;
  cryptoRequestInFlight = undefined;
  fiatLastFailureAt = undefined;
  fiatCacheGeneration++;
}

/**
 * Currency catalog edits change the required 1Forge pair set, so a cached
 * response must never outlive a catalog mutation.
 */
export function invalidateManualDeskFiatRateCache() {
  fiatCacheGeneration++;
  fiatCachedRates = undefined;
  fiatRequestInFlight = undefined;
  fiatLastFailureAt = undefined;
}

/**
 * Installs a deterministic rate source for isolated tests. It is intentionally
 * only available when the process is running under the test environment.
 */
export function configureManualDeskRateAdapterForTests(adapter?: ManualDeskRateAdapter) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Manual desk rate adapters are only available in tests.");
  }
  adapterForTests = adapter;
  marketAdaptersForTests = undefined;
  resetRateState();
}

export function configureManualDeskMarketAdaptersForTests(
  adapters?: ManualDeskMarketAdapters,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Manual desk market adapters are only available in tests.");
  }
  adapterForTests = undefined;
  marketAdaptersForTests = adapters;
  resetRateState();
}

function unavailable(): never {
  throw new ApiError(
    "MANUAL_DESK_RATE_UNAVAILABLE",
    "A reference rate is temporarily unavailable. Please try again.",
    503,
    true,
  );
}

function parsePositiveDecimal(value: unknown): DecimalValue | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  const match = /^(?:([0-9]+)(?:\.([0-9]*))?|\.([0-9]+))(?:[eE]([+-]?[0-9]+))?$/.exec(text);
  if (!match) return undefined;
  const fraction = match[2] ?? match[3] ?? "";
  const integer = match[1] ?? "0";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return undefined;

  let coefficient = BigInt(`${integer}${fraction}`);
  if (coefficient <= 0n) return undefined;
  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  if (scale > 100) return undefined;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale--;
  }
  return { coefficient, scale };
}

function validateRates(value: unknown): ValidatedRates {
  if (!value || typeof value !== "object" || Array.isArray(value)) unavailable();
  const rates: ValidatedRates = {};
  for (const [currency, rawRate] of Object.entries(value)) {
    const normalizedCurrency = currency.toUpperCase();
    const rate = parsePositiveDecimal(rawRate);
    if (/^[A-Z0-9]{2,15}$/.test(normalizedCurrency) && rate) {
      rates[normalizedCurrency] = rate;
    }
  }
  if (!rates.USD) unavailable();
  return rates;
}

function decimalToString(value: DecimalValue): string {
  const digits = value.coefficient.toString().padStart(value.scale + 1, "0");
  return value.scale === 0
    ? digits
    : `${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}`;
}

function atomicUnitsToDecimalString(units: bigint, precision: number): string {
  let coefficient = units;
  let scale = precision;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale--;
  }
  const digits = coefficient.toString().padStart(scale + 1, "0");
  return scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function invertDecimal(value: unknown): string {
  const parsed = parsePositiveDecimal(value);
  if (!parsed) unavailable();
  const scale = 30;
  let coefficient =
    (10n ** BigInt(scale + parsed.scale)) / parsed.coefficient;
  if (coefficient <= 0n) unavailable();
  let normalizedScale = scale;
  while (normalizedScale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    normalizedScale--;
  }
  return decimalToString({ coefficient, scale: normalizedScale });
}

async function safelyLoadAdapter(adapter: ManualDeskRateAdapter): Promise<ValidatedRates> {
  try {
    const rates = validateRates(await adapter());
    const fetchedAt = new Date().toISOString();
    for (const rate of Object.values(rates)) {
      rate.observedAt ??= fetchedAt;
      rate.timestampKind ??= "fetchedAt";
    }
    return rates;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    unavailable();
  }
}

async function loadFiatRates(): Promise<ValidatedRates> {
  if (marketAdaptersForTests) {
    return safelyLoadAdapter(marketAdaptersForTests.fiat);
  }
  const baseUrl = (
    process.env.NODE_ENV === "test"
      ? process.env.ONEFORGE_BASE_URL?.trim() || DEFAULT_ONEFORGE_BASE_URL
      : DEFAULT_ONEFORGE_BASE_URL
  ).replace(/\/+$/, "");
  const url = new URL(`${baseUrl}/quotes`);
  const enabled = await listEnabledFiatCurrencies();
  const manual = new Map<string, DecimalValue>();
  for (const row of enabled) {
    const code = row.code.toUpperCase();
    if (code === "USD") continue;
    if (row.rateMode === "manual") {
      const parsed = parsePositiveDecimal(row.manualRate);
      if (!parsed) unavailable();
      parsed.provider = "manual";
      parsed.observedAt = new Date().toISOString();
      parsed.timestampKind = "fetchedAt";
      manual.set(code, parsed);
    }
  }
  const pairs = enabled
    .map(({ code }) => code.toUpperCase())
    .filter((code) => code !== "USD" && !manual.has(code))
    .flatMap((code) => [`${code}/USD`, `USD/${code}`]);
  if (pairs.length === 0) return { USD: { coefficient: 1n, scale: 0, provider: "USD identity" }, ...Object.fromEntries(manual) };
  const apiKey = process.env.ONEFORGE_API_KEY?.trim();
  if (!apiKey) unavailable();
  url.searchParams.set("pairs", pairs.join(","));
  url.searchParams.set("api_key", apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) unavailable();
    const body: unknown = await response.json();
    if (!Array.isArray(body)) unavailable();

    const quotes = new Map<string, { value: unknown; observedAt?: string }>();
    for (const raw of body) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) unavailable();
      const quote = raw as Record<string, unknown>;
      const rawSymbol = quote.symbol ?? quote.s;
      const rawPrice = quote.price ?? quote.p;
      if (typeof rawSymbol !== "string") unavailable();
      const symbol = rawSymbol.toUpperCase().replace(/[^A-Z]/g, "");
      if (!parsePositiveDecimal(rawPrice)) unavailable();
      const rawObservedAt = typeof quote.t === "number" && Number.isFinite(quote.t)
        ? new Date(quote.t < 10_000_000_000 ? quote.t * 1_000 : quote.t).toISOString()
        : undefined;
      quotes.set(symbol, { value: rawPrice, observedAt: rawObservedAt });
    }

    const normalized: Record<string, ManualDeskRateValue> = { USD: "1" };
    const observations: Record<string, string | undefined> = {};
    for (const row of enabled) {
      const code = row.code.toUpperCase();
      if (code === "USD") continue;
      if (manual.has(code)) {
        normalized[code] = decimalToString(manual.get(code)!);
        observations[code] = manual.get(code)!.observedAt;
        continue;
      }
      const direct = quotes.get(`USD${code}`);
      const inverse = quotes.get(`${code}USD`);
      if (direct !== undefined) {
        normalized[code] = direct.value as ManualDeskRateValue;
        observations[code] = direct.observedAt;
      } else if (inverse !== undefined) {
        normalized[code] = invertDecimal(inverse.value);
        observations[code] = inverse.observedAt;
      } else {
        // 1Forge omits unsupported symbols from an otherwise successful
        // batch response. Keep the supported subset usable so one custom or
        // unsupported catalog currency cannot disable every Swap route.
        // A request that actually needs this missing currency still fails
        // closed when getManualDeskReferenceRate cannot find its rate.
        continue;
      }
    }
    const validated = validateRates(normalized);
    for (const [currency, rate] of Object.entries(validated)) {
      rate.provider = manual.has(currency) ? "manual" : currency === "USD" ? "USD identity" : "1Forge";
      rate.observedAt = observations[currency] ?? new Date().toISOString();
      rate.timestampKind = observations[currency] ? "upstreamObservedAt" : "fetchedAt";
    }
    return validated;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    unavailable();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCryptoRates(requestedCurrencies: string[] = []): Promise<ValidatedRates> {
  if (marketAdaptersForTests) {
    return safelyLoadAdapter(marketAdaptersForTests.crypto);
  }
  const url = process.env.COINBASE_USD_RATES_URL?.trim() ||
    DEFAULT_COINBASE_USD_RATES_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) unavailable();
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) unavailable();
    const data = (body as { data?: { currency?: unknown; rates?: unknown } }).data;
    if (data?.currency !== "USD" || !data.rates || typeof data.rates !== "object" || Array.isArray(data.rates)) {
      unavailable();
    }
    const fiatCurrencies = new Set(
      (await listEnabledFiatCurrencies()).map(({ code }) => code.toUpperCase()),
    );
    fiatCurrencies.add("USD");
    const cryptoRates: Record<string, ManualDeskRateValue> = { USD: 1 };
    for (const [currency, value] of Object.entries(data.rates)) {
      if (!fiatCurrencies.has(currency.toUpperCase())) {
        cryptoRates[currency] = value as ManualDeskRateValue;
      }
    }
    // Coinbase is authoritative for all supported assets. Kraken is only a
    // narrowly-scoped fallback for XMR, and its ticker is USD per XMR while
    // this loader exposes units per USD.
    const requested = new Set(requestedCurrencies.map(currency => currency.toUpperCase()));
    const coinbaseHasXmr = Object.keys(cryptoRates)
      .some(currency => currency.toUpperCase() === "XMR");
    if (requested.has("XMR") && !coinbaseHasXmr) {
      const krakenUrl = process.env.KRAKEN_XMR_USD_TICKER_URL?.trim() ||
        DEFAULT_KRAKEN_XMR_USD_TICKER_URL;
      const krakenController = new AbortController();
      const krakenTimeout = setTimeout(() => krakenController.abort(), REQUEST_TIMEOUT_MS);
      try {
        const krakenResponse = await fetch(krakenUrl, {
          signal: krakenController.signal,
          headers: { accept: "application/json" },
        });
        if (!krakenResponse.ok) unavailable();
        const krakenBody: unknown = await krakenResponse.json();
        if (
          !krakenBody ||
          typeof krakenBody !== "object" ||
          Array.isArray(krakenBody)
        ) unavailable();
        const body = krakenBody as {
          error?: unknown;
          result?: unknown;
        };
        if (
          !Array.isArray(body.error) ||
          body.error.length !== 0 ||
          !body.result ||
          typeof body.result !== "object" ||
          Array.isArray(body.result)
        ) unavailable();
        const entries = Object.entries(body.result);
        if (entries.length !== 1) unavailable();
        const ticker = entries[0]?.[1];
        if (!ticker || typeof ticker !== "object" || Array.isArray(ticker)) unavailable();
        const close = (ticker as { c?: unknown }).c;
        if (!Array.isArray(close) || close.length < 1) unavailable();
        const closePrice = parsePositiveDecimal(close[0]);
        if (!closePrice) unavailable();
        cryptoRates.XMR = invertDecimal(decimalToString(closePrice));
      } catch (error) {
        if (error instanceof ApiError) throw error;
        unavailable();
      } finally {
        clearTimeout(krakenTimeout);
      }
    }
    return validateRates(cryptoRates);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    unavailable();
  } finally {
    clearTimeout(timeout);
  }
}

async function getCachedRates(
  market: "fiat" | "crypto",
  requiredCurrencies: string[] = [],
): Promise<ValidatedRates> {
  const now = Date.now();
  const cached = market === "fiat" ? fiatCachedRates : cryptoCachedRates;
  const required = requiredCurrencies.map(currency => currency.toUpperCase());
  if (
    cached &&
    cached.expiresAt > now &&
    required.every(currency => Boolean(cached.value[currency]))
  ) return cached.value;
  const inFlight = market === "fiat" ? fiatRequestInFlight : cryptoRequestInFlight;
  if (inFlight) return inFlight;

  const requestGeneration = market === "fiat" ? fiatCacheGeneration : 0;
  const request = (market === "fiat" ? loadFiatRates() : loadCryptoRates(required))
      .then((rates) => {
        const fetchedAt = Date.now();
        const fetchedAtIso = new Date(fetchedAt).toISOString();
        // Completion time belongs to the fetched rates, not each quote
        // evaluation. This also means cached reuse retains immutable evidence.
        for (const rate of Object.values(rates)) {
          rate.observedAt ??= fetchedAtIso;
          rate.timestampKind ??= "fetchedAt";
        }
        const entry = { value: rates, expiresAt: fetchedAt + CACHE_TTL_MS, fetchedAt };
        if (market === "fiat") {
          if (requestGeneration === fiatCacheGeneration) {
            fiatCachedRates = entry;
          }
        } else {
          cryptoCachedRates = entry;
        }
        return rates;
      })
      .catch((error) => {
        if (market === "fiat" && requestGeneration === fiatCacheGeneration) {
          fiatLastFailureAt = Date.now();
        }
        throw error;
      })
      .finally(() => {
        if (market === "fiat") {
          if (requestGeneration === fiatCacheGeneration) {
            fiatRequestInFlight = undefined;
          }
        } else {
          cryptoRequestInFlight = undefined;
        }
      });
  if (market === "fiat") fiatRequestInFlight = request;
  else cryptoRequestInFlight = request;
  return request;
}

async function getUsdRates(
  sourceCurrency: string,
  targetCurrency: string,
): Promise<ValidatedRates> {
  if (adapterForTests) return safelyLoadAdapter(adapterForTests);

  const fiatCurrencies = new Set(
    (await listEnabledFiatCurrencies()).map(({ code }) => code.toUpperCase()),
  );
  fiatCurrencies.add("USD");
  const currencies = [sourceCurrency, targetCurrency]
    .map(currency => currency.toUpperCase());
  const needsFiatRates = currencies.some(
    currency => fiatCurrencies.has(currency) && currency !== "USD",
  );
  const needsCryptoRates = currencies.some(
    currency => !fiatCurrencies.has(currency),
  );
  const [fiatRates, initialCryptoRates] = await Promise.all([
    needsFiatRates ? getCachedRates("fiat") : Promise.resolve({ USD: { coefficient: 1n, scale: 0 } }),
    needsCryptoRates ? getCachedRates("crypto", currencies.filter(currency => !fiatCurrencies.has(currency))) : Promise.resolve({ USD: { coefficient: 1n, scale: 0 } }),
  ]);
  const initialCryptoRateMap = initialCryptoRates as ValidatedRates;
  // A concurrent request may have started a Coinbase-only refresh for a
  // different asset. Ensure an XMR caller gets its narrowly-scoped fallback
  // even when it joined that in-flight request.
  const cryptoCurrencies = currencies.filter(currency => !fiatCurrencies.has(currency));
  const cryptoRates: ValidatedRates = needsCryptoRates &&
    cryptoCurrencies.some(currency => !initialCryptoRateMap[currency]) &&
    cryptoCurrencies.includes("XMR")
    ? await getCachedRates("crypto", cryptoCurrencies)
    : initialCryptoRateMap;
  return { ...fiatRates, ...cryptoRates };
}

export function getManualDeskRateProviderStatus() {
  const now = Date.now();
  const configured = Boolean(process.env.ONEFORGE_API_KEY?.trim());
  const ageMs = fiatCachedRates ? Math.max(0, now - fiatCachedRates.fetchedAt) : undefined;
  const stale = ageMs !== undefined && ageMs >= CACHE_TTL_MS;
  return {
    provider: "1Forge",
    configured,
    state: fiatRequestInFlight
      ? "loading" as const
      : !fiatCachedRates
        ? "unavailable" as const
        : stale
          ? "stale" as const
          : "healthy" as const,
    fetchedAt: fiatCachedRates
      ? new Date(fiatCachedRates.fetchedAt).toISOString()
      : undefined,
    ageMs,
    lastFailureAt: fiatLastFailureAt
      ? new Date(fiatLastFailureAt).toISOString()
      : undefined,
    rates: fiatCachedRates
      ? Object.entries(fiatCachedRates.value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, rate]) => ({
          currency,
          unitsPerUsd: decimalToString(rate),
        }))
      : [],
  };
}

/**
 * Warms the enabled-fiat rate cache for the admin health view. Provider errors
 * intentionally remain internal; callers receive safe health rather than a
 * credential-bearing upstream error.
 */
export async function refreshManualDeskRateProviderStatus() {
  try {
    await getCachedRates("fiat");
  } catch {
    // The status object conveys unavailable/failure state without exposing
    // provider details or credentials.
  }
  return getManualDeskRateProviderStatus();
}

export async function getManualDeskReferenceRate(input: {
  sourceCurrency: string;
  targetCurrency: string;
  markupBasisPoints?: number;
  adjustmentDirection?: "MARKUP" | "GIVE_MORE";
  exactRate?: string | null;
}) {
  const markupBasisPoints = input.markupBasisPoints ?? 60;
  const adjustmentDirection = input.adjustmentDirection ?? "MARKUP";
  if (
    !Number.isInteger(markupBasisPoints) ||
    markupBasisPoints < 0 ||
    (adjustmentDirection === "MARKUP" && markupBasisPoints >= 10_000)
  ) unavailable();

  if (input.exactRate != null) {
    const parsed = parsePositiveDecimal(input.exactRate);
    if (!parsed) unavailable();
    const multiplier = adjustmentDirection === "GIVE_MORE"
      ? BigInt(10_000 + markupBasisPoints)
      : BigInt(10_000 - markupBasisPoints);
    const adjustedCoefficient = parsed.coefficient * multiplier;
    const adjusted = {
      coefficient: adjustedCoefficient,
      scale: parsed.scale + 4,
    };
    while (adjusted.scale > 0 && adjusted.coefficient % 10n === 0n) {
      adjusted.coefficient /= 10n;
      adjusted.scale--;
    }
    const exact = decimalToString(adjusted);
    const rate = Number(exact);
    if (!Number.isFinite(rate) || rate <= 0) unavailable();
    return rate;
  }
  const rates = await getUsdRates(input.sourceCurrency, input.targetCurrency);
  const sourceUnitsPerUsd = rates[input.sourceCurrency.toUpperCase()];
  const targetUnitsPerUsd = rates[input.targetCurrency.toUpperCase()];
  if (!sourceUnitsPerUsd || !targetUnitsPerUsd) unavailable();

  const scale = 30;
  const numerator =
    targetUnitsPerUsd.coefficient *
    (10n ** BigInt(sourceUnitsPerUsd.scale)) *
    BigInt(adjustmentDirection === "GIVE_MORE" ? 10_000 + markupBasisPoints : 10_000 - markupBasisPoints) *
    (10n ** BigInt(scale));
  const denominator =
    sourceUnitsPerUsd.coefficient *
    (10n ** BigInt(targetUnitsPerUsd.scale)) *
    10_000n;
  let coefficient = numerator / denominator;
  if (coefficient <= 0n) unavailable();

  let normalizedScale = scale;
  while (normalizedScale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    normalizedScale--;
  }
  const rate = Number(decimalToString({ coefficient, scale: normalizedScale }));
  if (!Number.isFinite(rate) || rate <= 0) unavailable();
  return rate;
}

export async function getManualDeskEstimate(input: {
  sourceCurrency: string;
  targetCurrency: string;
  targetPrecision: number;
  amount: number;
  markupBasisPoints?: number;
  adjustmentDirection?: "MARKUP" | "GIVE_MORE";
  fixedFee?: string | null;
  exactRate?: string | null;
}) {
  if (
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    !Number.isInteger(input.targetPrecision) ||
    input.targetPrecision < 0 ||
    input.targetPrecision > MAX_MANUAL_DESK_TARGET_PRECISION
  ) unavailable();
  const amount = parsePositiveDecimal(input.amount);
  const exactBaseRate = input.exactRate == null ? undefined : parsePositiveDecimal(input.exactRate);
  if (!amount || (input.exactRate != null && !exactBaseRate)) unavailable();
  const rates = exactBaseRate ? undefined : await getUsdRates(input.sourceCurrency, input.targetCurrency);
  const sourceUnitsPerUsd = rates?.[input.sourceCurrency.toUpperCase()] ??
    { coefficient: 1n, scale: 0, provider: "manual" as const };
  const targetUnitsPerUsd = rates?.[input.targetCurrency.toUpperCase()] ?? exactBaseRate;
  if (!targetUnitsPerUsd) unavailable();
  const fiatCurrencies = exactBaseRate
    ? new Set<string>()
    : new Set((await listEnabledFiatCurrencies()).map(({ code }) => code.toUpperCase()));
  const referenceLeg = (currency: string, rate: DecimalValue): {
    currency: string; unitsPerUsd: string;
    provider: "1Forge" | "manual" | "Coinbase" | "USD identity" | "test adapter";
    source: string; observedAt: string; timestampKind: "upstreamObservedAt" | "fetchedAt";
  } => ({
    currency: currency.toUpperCase(),
    unitsPerUsd: decimalToString(rate),
    provider: exactBaseRate
      ? "manual"
      : currency.toUpperCase() === "USD"
      ? "USD identity"
      : rate.provider === "manual"
        ? "manual"
        : (adapterForTests || marketAdaptersForTests)
        ? "test adapter"
        : fiatCurrencies.has(currency.toUpperCase())
          ? "1Forge"
          : "Coinbase",
    source: exactBaseRate
      ? "exact path override"
      : currency.toUpperCase() === "USD"
      ? "identity"
      : rate.provider === "manual"
        ? "manual"
        : (adapterForTests || marketAdaptersForTests)
        ? "test"
        : fiatCurrencies.has(currency.toUpperCase())
          ? "1Forge"
          : "Coinbase exchange rates",
    // 1Forge response observation times are not retained by the old cache
    // payload; this is the trusted cache/fetch completion observation point.
    observedAt: rate.observedAt ?? new Date().toISOString(),
    timestampKind: rate.timestampKind ?? "fetchedAt",
  });

  const atomicScale = 10n ** BigInt(input.targetPrecision);
  const grossNumerator = exactBaseRate
    ? amount.coefficient * exactBaseRate.coefficient * atomicScale
    : amount.coefficient * targetUnitsPerUsd.coefficient *
      (10n ** BigInt(sourceUnitsPerUsd.scale)) * atomicScale;
  const grossDenominator = exactBaseRate
    ? 10n ** BigInt(amount.scale + exactBaseRate.scale)
    : sourceUnitsPerUsd.coefficient *
      (10n ** BigInt(amount.scale + targetUnitsPerUsd.scale));
  const grossAtomicUnits = grossNumerator / grossDenominator;
  const markupBasisPoints = input.markupBasisPoints ?? 60;
  if (!Number.isInteger(markupBasisPoints) ||
      markupBasisPoints < 0 || markupBasisPoints > 10_000) unavailable();
  const percentageFeeAtomicUnits = input.adjustmentDirection === "GIVE_MORE"
    ? (grossAtomicUnits * BigInt(markupBasisPoints)) / 10_000n
    : (grossAtomicUnits * BigInt(markupBasisPoints) + 9_999n) / 10_000n;
  const parsedFixedFee = input.fixedFee == null
    ? { coefficient: 0n, scale: 0 }
    : parsePositiveDecimal(input.fixedFee) ??
      (/^0(?:\.0+)?$/.test(input.fixedFee) ? { coefficient: 0n, scale: 0 } : undefined);
  if (!parsedFixedFee) unavailable();
  const fixedNumerator = parsedFixedFee.coefficient * atomicScale;
  const fixedDenominator = 10n ** BigInt(parsedFixedFee.scale);
  const fixedFeeAtomicUnits =
    (fixedNumerator + fixedDenominator - 1n) / fixedDenominator;
  const feeAtomicUnits = input.adjustmentDirection === "GIVE_MORE"
    ? fixedFeeAtomicUnits
    : percentageFeeAtomicUnits + fixedFeeAtomicUnits;
  const receiveAtomicUnits = input.adjustmentDirection === "GIVE_MORE"
    ? grossAtomicUnits + percentageFeeAtomicUnits - fixedFeeAtomicUnits
    : grossAtomicUnits - feeAtomicUnits;
  if (grossAtomicUnits <= 0n || receiveAtomicUnits <= 0n) {
    throw new ApiError(
      "MANUAL_DESK_FEE_EXCEEDS_AMOUNT",
      "The pricing fees are greater than the gross market amount.",
      422,
    );
  }

  const atomicUnitsToNumber = (units: bigint) => {
    const decimal = atomicUnitsToDecimalString(units, input.targetPrecision);
    const significantDigits = decimal.replace(".", "").replace(/^0+/, "") || "0";
    if (significantDigits.length > MAX_CONTRACT_SIGNIFICANT_DIGITS) unavailable();
    const parsed = Number(decimal);
    const expectedDecimal = parsePositiveDecimal(decimal);
    const roundTripped = parsePositiveDecimal(parsed);
    if (
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      !expectedDecimal ||
      !roundTripped ||
      roundTripped.coefficient !== expectedDecimal.coefficient ||
      roundTripped.scale !== expectedDecimal.scale
    ) unavailable();
    return parsed;
  };
  const grossMarketAmount = atomicUnitsToNumber(grossAtomicUnits);
  const percentageCommission = percentageFeeAtomicUnits === 0n
    ? 0
    : atomicUnitsToNumber(percentageFeeAtomicUnits);
  const fixedCommission = fixedFeeAtomicUnits === 0n
    ? 0
    : atomicUnitsToNumber(fixedFeeAtomicUnits);
  const totalFee = feeAtomicUnits === 0n ? 0 : atomicUnitsToNumber(feeAtomicUnits);
  const receiveAmount = atomicUnitsToNumber(receiveAtomicUnits);
  // Signed snapshot policy: final rate is receive/input, truncated (never
  // rounded up) to 30 base-10 fractional places, then canonically de-zeroed.
  const finalRateScale = 30;
  const finalRateAtomic =
    (receiveAtomicUnits * (10n ** BigInt(amount.scale + finalRateScale))) /
    (atomicScale * amount.coefficient);
  if (finalRateAtomic <= 0n) unavailable();
  const finalRateExact = atomicUnitsToDecimalString(finalRateAtomic, finalRateScale);
  const rate = Number(finalRateExact);
  if (!Number.isFinite(rate) || rate <= 0) unavailable();
  return {
    grossMarketAmount,
    percentageCommission,
    fixedCommission,
    totalFee,
    receiveAmount,
    rate,
    fee: totalFee,
    exact: {
      grossMarketAmount: atomicUnitsToDecimalString(grossAtomicUnits, input.targetPrecision),
      percentageCommission: atomicUnitsToDecimalString(percentageFeeAtomicUnits, input.targetPrecision),
      fixedCommission: atomicUnitsToDecimalString(fixedFeeAtomicUnits, input.targetPrecision),
      totalFee: atomicUnitsToDecimalString(feeAtomicUnits, input.targetPrecision),
      receiveAmount: atomicUnitsToDecimalString(receiveAtomicUnits, input.targetPrecision),
      finalRate: finalRateExact,
      sourceReference: referenceLeg(input.sourceCurrency, sourceUnitsPerUsd),
      targetReference: referenceLeg(input.targetCurrency, targetUnitsPerUsd),
    },
  };
}

/**
 * Converts a source amount to an approximate current USD value. Analytics uses
 * this best-effort helper so an unavailable market must never prevent order
 * counts from being returned.
 */
export async function getCurrentUsdSourceValue(
  sourceCurrency: string,
  amount: string | number,
) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) unavailable();
  const rates = await getUsdRates(sourceCurrency, "USD");
  const sourceUnitsPerUsd = rates[sourceCurrency.toUpperCase()];
  if (!sourceUnitsPerUsd) unavailable();
  const unitsPerUsd = Number(decimalToString(sourceUnitsPerUsd));
  const usdValue = numericAmount / unitsPerUsd;
  if (!Number.isFinite(unitsPerUsd) || unitsPerUsd <= 0 ||
      !Number.isFinite(usdValue) || usdValue < 0) unavailable();
  return {
    usdValue,
    observedAt: sourceUnitsPerUsd.observedAt ?? new Date().toISOString(),
  };
}