import { DatabaseLockClient, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ApiError } from "./api-error";

type Tx = Parameters<Parameters<typeof import("@workspace/db").db.transaction>[0]>[0];
const prefix = "qx:manual-wallet:";
let localSaveActive = false;

/** One bounded control session per process; no transaction spans RPC calls.
 * Session termination releases every lock, including on process failure. */
export async function withManualWalletOperationLock<T>(
  ids: string[], action: (assertActive: () => void) => Promise<T>,
): Promise<T> {
  if (localSaveActive) throw busy();
  const client = new DatabaseLockClient({ ...pool.options,
    connectionTimeoutMillis: 5_000, application_name: "qx-manual-wallet-lock" });
  localSaveActive = true;
  let lost = false;
  client.on("error", () => { lost = true; });
  try {
    await client.connect();
    for (const id of [...new Set(ids)].sort()) {
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [prefix + id]);
      if (!result.rows[0]?.locked) throw busy();
    }
    return await action(() => { if (lost) throw new ApiError(
      "MANUAL_WALLET_LOCK_LOST", "Wallet verification ownership was lost. Deposits were not activated; refresh and retry.", 409); });
  } finally {
    await client.end().catch(() => undefined);
    localSaveActive = false;
  }
}

export async function assertNoManualWalletOperation(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    const result = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${prefix + id}, 0)) AS locked`);
    if (!result.rows[0]?.locked) throw busy();
  }
}

const busy = () => new ApiError("MANUAL_WALLET_OPERATION_ACTIVE",
  "A wallet save is still verifying. Wait for it to finish, then review and retry this action.", 409);
