import { db, whitebitHistoryWorkerStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { whitebitCredentialSourceConfiguration, whitebitHistoricalReconciliationAllowed } from "./provider-credentials";

export type WhitebitHistoryCredentialSource = "stored" | "environment";

export type WhitebitHistoryWorkerHealth = {
  status: "disabled" | "configuration_required" | "starting" | "healthy" | "stale" | "auth_error" | "error";
  credentialSource: WhitebitHistoryCredentialSource | null;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
};

export function whitebitHistoryWorkerConfiguration(): {
  enabled: boolean;
  source: WhitebitHistoryCredentialSource | null;
} {
  const enabled = process.env.WHITEBIT_HISTORY_WORKER_ENABLED === "true" &&
    whitebitHistoricalReconciliationAllowed();
  const configured = process.env.WHITEBIT_HISTORY_CREDENTIAL_SOURCE;
  const canonical = whitebitCredentialSourceConfiguration();
  const configuredSource = configured === "stored" || configured === "environment" ? configured : null;
  const source = !canonical.valid ||
      (canonical.explicit && (!configuredSource || configuredSource !== canonical.source))
    ? null
    : configuredSource;
  return { enabled, source };
}

export async function getWhitebitHistoryWorkerHealth(): Promise<WhitebitHistoryWorkerHealth> {
  const { enabled, source } = whitebitHistoryWorkerConfiguration();
  const empty = { credentialSource: source, lastPollAt: null, lastSuccessAt: null, lastErrorAt: null, lastError: null };
  if (!enabled) return { status: "disabled", ...empty };
  if (!source) return { status: "configuration_required", ...empty };
  try {
    const [row] = await db.select().from(whitebitHistoryWorkerStateTable)
      .where(eq(whitebitHistoryWorkerStateTable.id, 1)).limit(1);
    if (!row || row.credentialSource !== source) return { status: "starting", ...empty };
    return {
      status: row.lastErrorCode === "WHITEBIT_HISTORY_AUTH_REJECTED" ? "auth_error"
        : row.lastErrorCode ? "error"
        : row.lastSuccessAt && Date.now() - row.lastSuccessAt.getTime() < 5 * 60_000 ? "healthy"
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