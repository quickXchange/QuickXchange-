import { BlockchainMonitorError, providerFailureDetails, sanitizedProviderError } from "./errors";

// Endpoint identities stay private in memory and are never included in errors.
const cooldowns = new Map<string, { until: number; details: NonNullable<BlockchainMonitorError["providerFailure"]> }>();

export async function providerJson<T>(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const cooldown = cooldowns.get(endpoint);
  if (cooldown && cooldown.until > Date.now()) {
    throw sanitizedProviderError("PROVIDER", {
      ...cooldown.details, retryAfterMs: cooldown.until - Date.now(),
    });
  }
  cooldowns.delete(endpoint);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = (async () => {
    const response = await fetch(endpoint, { ...init, signal: controller.signal });
    if (!response.ok) {
      let body: unknown;
      try { body = await response.json(); } catch { /* Never expose an upstream body. */ }
      const details = providerFailureDetails(body, response.status, response.headers.get("retry-after"));
      if (details.retryAfterMs) {
        if (cooldowns.size >= 256) cooldowns.delete(cooldowns.keys().next().value!);
        cooldowns.set(endpoint, { until: Date.now() + details.retryAfterMs, details });
      }
      throw sanitizedProviderError("PROVIDER", details);
    }
    try {
      const body = await response.json() as T;
      const details = providerFailureDetails(body);
      if (details.retryAfterMs) {
        if (cooldowns.size >= 256) cooldowns.delete(cooldowns.keys().next().value!);
        cooldowns.set(endpoint, { until: Date.now() + details.retryAfterMs, details });
        throw sanitizedProviderError("PROVIDER", details);
      }
      return body;
    } catch (error) {
      if (error instanceof BlockchainMonitorError) throw error;
      throw sanitizedProviderError("INVALID_RESPONSE");
    }
  })();
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(sanitizedProviderError("TIMEOUT"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (error instanceof BlockchainMonitorError) throw error;
    throw sanitizedProviderError("NETWORK");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function providerHeaders(apiKey?: string, headerName = "authorization"): Record<string, string> {
  if (!apiKey || !/^[A-Za-z0-9-]+$/.test(headerName)) return {};
  return { [headerName]: headerName.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : apiKey };
}

export function requireEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw sanitizedProviderError("CONFIGURATION");
  }
}

export function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value : fallback;
}