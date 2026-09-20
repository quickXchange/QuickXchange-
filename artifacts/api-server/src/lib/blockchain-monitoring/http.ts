import { BlockchainMonitorError, sanitizedProviderError } from "./errors";

export async function providerJson<T>(
  endpoint: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { ...init, signal: controller.signal });
    if (!response.ok) throw sanitizedProviderError("PROVIDER");
    try {
      return await response.json() as T;
    } catch {
      throw sanitizedProviderError("INVALID_RESPONSE");
    }
  } catch (error) {
    if (error instanceof BlockchainMonitorError) throw error;
    throw sanitizedProviderError("NETWORK");
  } finally {
    clearTimeout(timer);
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