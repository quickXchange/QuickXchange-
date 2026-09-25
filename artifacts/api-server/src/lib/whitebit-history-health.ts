import { db, whitebitHistoryWorkerStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { whitebitCredentialSourceConfiguration } from "./provider-credentials";

export type WhitebitHistoryCredentialSource = "stored" | "environment";

export type WhitebitHistoryWorkerHealth = {
  status: "disabled" | "configuration_required" | "starting" | "healthy" | "stale" | "auth_error" | "error";
  credentialSource: WhitebitHistoryCredentialSource | null;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

/** An explicit environment identity may only poll orders created after this new boundary. */
export function whitebitHistoryFreshAfter(): Date | null {
  const value = process.env.WHITEBIT_HISTORY_FRESH_AFTER;
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? parsed : null;
}

export function whitebitHistoryWorkerConfiguration(): {
  enabled: boolean;
  source: WhitebitHistoryCredentialSource | null;
} {
  const enabled = process.env.WHITEBIT_HISTORY_WORKER_ENABLED === "true";
  const configured = process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE;
  const canonical = whitebitCredentialSourceConfiguration();
  const configuredSource = configured === "stored" || configured === "environment" ? configured : null;
  const source = !canonical.valid ||
      (canonical.explicit && (!configuredSource || configuredSource !== canonical.source))
    ? null
    : configuredSource;
  // Enabling the environment worker must not opt in to broad reconciliation.
  // It instead requires a separate, immutable fresh-order activation boundary.
  return { enabled: enabled && (source !== "environment" || Boolean(whitebitHistoryFreshAfter())), source };
}

export async function getWhitebitHistoryWorkerHealth(): Promise<WhitebitHistoryWorkerHealth> {
  const { enabled, source } = whitebitHistoryWorkerConfiguration();
  const empty = { credentialSource: source, lastPollAt: null, lastSuccessAt: null, lastErrorAt: null, lastError: null };
  if (!enabled) return { status: "disabled", ...empty };
  if (!source) return { status: "configuration_required", ...empty };
  try {
    const [row] = await db.select().from(whitebitHistoryWorkerStateTable)
      .where(eq(whitebitHistoryWorkerStateTable.id, 1)).limit(1);
    const freshAfter = source === "environment" ? whitebitHistoryFreshAfter() : null;
    if (!row || row.credentialSource !== source ||
      (freshAfter && (!row.activatedAt || row.activatedAt.getTime() < freshAfter.getTime()))) {
      return { status: "starting", ...empty };
    }
    return {
      status: row.lastErrorCode === "WHITEBIT_HISTORY_AUTH_REJECTED" ? "auth_error"
        : row.lastErrorCode ? "error"
        : row.lastSuccessAt && row.activatedAt &&
            row.lastSuccessAt.getTime() >= row.activatedAt.getTime() &&
            Date.now() - row.lastSuccessAt.getTime() < 5 * 60_000 ? "healthy"
        : "stale",
      credentialSource: source,
      lastPollAt: row.lastPollAt?.toISOString() ?? null,
      lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
      lastError: row.lastError,
    };
  } catch {
    return { status: "error", ...empty, lastError: "History worker state is unavailable." };
  }
}