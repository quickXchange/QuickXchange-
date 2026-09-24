import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, lte, or, sql } from "drizzle-orm";
import {
  db,
  customerProfilesTable,
  customersTable,
  whitebitDepositAddressesTable,
  whitebitHistoryCheckpointsTable,
  whitebitOrderHistoryCheckpointsTable,
  whitebitDepositsTable,
  whitebitOrderAddressesTable,
  whitebitLedgerEntriesTable,
  whitebitWebhookDeliveriesTable,
  ordersTable,
  whitebitProviderSettingsTable,
  cryptoAssetsTable,
  cryptoAssetNetworksTable,
  whitebitAssetMappingsTable,
  whitebitNetworkMappingsTable,
} from "@workspace/db";
import { requireCustomer } from "../lib/customer-auth";
import { ApiError } from "../lib/api-error";
import { requireOperator, requireOwner } from "../lib/operator-auth";
import { isWhitebitSwapEnabled, parseWhitebitCatalogAssets } from "../lib/whitebit-capabilities";
import { getWhitebitCredentialStorageState, type WhitebitCredentials } from "../lib/provider-credentials";
import { updateOrderAndQueueStatusNotificationTx } from "../lib/customer-status-notifications";
import { enqueueSwapTelegramNotification } from "../lib/telegram-swap-notifications";
import { signedCryptoRouteId } from "../lib/manual-crypto";
import { isSyntacticallyValidManualWalletAddress, isSyntacticallyValidManualWalletMemo } from "../lib/manual-wallet-validation";

const api = "https://whitebit.com";
let orderAddressTableAvailable: boolean | undefined;
type WhitebitTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const WHITEBIT_CALLING_STALE_MS = 30_000;

async function hasOrderAddressTable() {
  if (orderAddressTableAvailable !== undefined) return orderAddressTableAvailable;
  try {
    await db.select({ id: whitebitOrderAddressesTable.id }).from(whitebitOrderAddressesTable).limit(1);
    await db.select({ provider: whitebitProviderSettingsTable.provider }).from(whitebitProviderSettingsTable).limit(1);
    orderAddressTableAvailable = true;
  } catch {
    orderAddressTableAvailable = false;
  }
  return orderAddressTableAvailable;
}

async function credentials(override?: WhitebitCredentials): Promise<{ key: string; secret: string }> {
  if (override) return { key: override.apiKey, secret: override.secretKey };
  const stored = await getWhitebitCredentialStorageState();
  if (stored.status === "available") {
    return { key: stored.credentials.apiKey, secret: stored.credentials.secretKey };
  }
  const key = process.env.WHITEBIT_API_KEY;
  const secret = process.env.WHITEBIT_API_SECRET;
  if (!key || !secret) throw new ApiError("WHITEBIT_NOT_CONFIGURED", "WhiteBIT is not configured.", 503);
  return { key, secret };
}

async function whitebitPost<T>(path: string, params: Record<string, unknown>, override?: WhitebitCredentials): Promise<T> {
  const { key, secret } = await credentials(override);
  const nonceResult = await db.execute<{ last_nonce: string }>(sql`
    INSERT INTO whitebit_api_nonce (id, last_nonce)
    VALUES (1, GREATEST(floor(extract(epoch from clock_timestamp()) * 1000)::numeric, 1))
    ON CONFLICT (id) DO UPDATE SET last_nonce =
      GREATEST(whitebit_api_nonce.last_nonce + 1, floor(extract(epoch from clock_timestamp()) * 1000)::numeric)
    RETURNING last_nonce
  `);
  const requestNonce = Number(nonceResult.rows[0]?.last_nonce);
  if (!Number.isSafeInteger(requestNonce)) throw new ApiError("WHITEBIT_NONCE_UNAVAILABLE", "WhiteBIT nonce allocation failed.", 503);
  const body = JSON.stringify({ request: path, nonce: requestNonce, ...params });
  const payload = Buffer.from(body).toString("base64");
  const signature = crypto.createHmac("sha512", secret).update(payload).digest("hex");
  const response = await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-TXC-APIKEY": key, "X-TXC-PAYLOAD": payload, "X-TXC-SIGNATURE": signature },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const definitive = classifyWhitebitHttpStatus(response.status) === "definitive";
    throw new ApiError(
      definitive ? "WHITEBIT_PROVIDER_DEFINITIVE" : "WHITEBIT_PROVIDER_ERROR",
      definitive ? "WhiteBIT rejected the address request." : "WhiteBIT provider outcome is unknown.",
      definitive ? 502 : 503,
    );
  }
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new ApiError("WHITEBIT_INVALID_RESPONSE", "WhiteBIT returned an invalid response.", 502);
  return value as T;
}

export async function testWhitebitSignedConnection(candidate?: WhitebitCredentials) {
  await whitebitPost("/api/v4/main-account/balance", {}, candidate);
  return {
    ok: true,
    provider: "whitebit" as const,
    signedApiReachable: true,
    checkedAt: new Date().toISOString(),
    message: "WhiteBIT accepted the signed API credentials.",
  };
}

export async function verifyWhitebitDepositAddressPermission(
  ticker: string,
  network: string,
  candidate?: WhitebitCredentials,
) {
  const result = await whitebitPost<Record<string, unknown>>(
    "/api/v4/main-account/create-new-address",
    {
      ticker,
      network,
    },
    candidate,
  );
  const parsed = parseWhitebitAddressResponse(result);
  if (!parsed?.address.trim()) {
    throw new ApiError(
      "WHITEBIT_ADDRESS_PERMISSION_UNVERIFIED",
      `WhiteBIT did not return a valid ${ticker}/${network} deposit address.`,
      502,
    );
  }
  return parsed;
}

export async function verifyWhitebitAddressCreationPermission(
  candidate?: WhitebitCredentials,
) {
  return verifyWhitebitDepositAddressPermission("BTC", "BTC", candidate);
}

export function classifyWhitebitHttpStatus(status: number): "definitive" | "ambiguous" {
  return status >= 400 && status < 500 && ![408, 409, 429].includes(status)
    ? "definitive" : "ambiguous";
}

async function validateOrderDepositInstructions(
  orderId: string,
  assetCode: string,
  networkCode: string,
  instructions: { address: string; memo: string | null },
): Promise<{ address: string; memo: string } | null> {
  const [order] = await db.select({
    sourceSettlementOptionId: ordersTable.sourceSettlementOptionId,
    fundingDetailsSnapshot: ordersTable.fundingDetailsSnapshot,
    fromAsset: ordersTable.fromAsset,
    fromNetwork: ordersTable.fromNetwork,
  }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order ||
    order.fromAsset.trim().toUpperCase() !== assetCode.trim().toUpperCase() ||
    order.fromNetwork.trim().toUpperCase() !== networkCode.trim().toUpperCase()
  ) return null;
  const funding = (order.fundingDetailsSnapshot ?? {}) as Record<string, unknown>;
  const routeId = signedCryptoRouteId({
    id: order.sourceSettlementOptionId ?? "",
    networkId: typeof funding.networkId === "string" ? funding.networkId : null,
  });
  if (!routeId) return null;
  const [exactRoute] = await db.select({
    route: cryptoAssetNetworksTable,
    assetCode: cryptoAssetsTable.code,
  }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(eq(cryptoAssetNetworksTable.id, routeId)).limit(1);
  if (!exactRoute ||
    exactRoute.assetCode.toUpperCase() !== assetCode.trim().toUpperCase()
  ) return null;
  const address = instructions.address.trim();
  const memo = instructions.memo?.trim() ?? "";
  if (!isSyntacticallyValidManualWalletAddress(exactRoute.route, address) ||
    (exactRoute.route.requiresMemo && !memo) ||
    (memo && !isSyntacticallyValidManualWalletMemo(exactRoute.route, memo))
  ) return null;
  return { address, memo };
}

/**
 * Provision the funding address for a manual Swap after its order row has
 * been inserted. The order-address claim is the irreversible-call fence:
 * retries return the same result and never call WhiteBIT twice.
 */
export async function provisionSwapFundingAddress(input: {
  orderId: string;
  assetCode: string;
  networkCode: string;
  manualAddress: string;
  manualMemo: string;
  manualFallbackUsable?: boolean;
  chosenWhitebit: boolean;
  expectedClaimToken?: string;
}) {
  const fallback = async (reason: string) => {
    const usable = input.manualFallbackUsable ?? Boolean(input.manualAddress.trim());
    await db.transaction(async (tx) => {
        const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, input.orderId)).limit(1);
        if (!order) return;
        const current = (order.fundingDetailsSnapshot ?? (order.settlementSnapshot as Record<string, unknown> | null)?.funding ?? {}) as Record<string, unknown>;
        const funding = {
          ...current,
          address: usable ? input.manualAddress : "",
          memo: usable ? input.manualMemo : "",
          source: "whitebit",
          selectedProvider: "whitebit",
          addressSource: usable ? "manual_fallback" : "unavailable",
          status: usable ? "manual_fallback" : "unavailable",
          manualFallbackAddress: input.manualAddress,
          manualFallbackMemo: input.manualMemo,
        };
        const settlement = { ...((order.settlementSnapshot ?? {}) as Record<string, unknown>), funding };
        await tx.update(whitebitOrderAddressesTable).set({
          status: "unresolved",
          providerError: reason,
          updatedAt: new Date(),
        }).where(and(
          eq(whitebitOrderAddressesTable.orderId, input.orderId),
          sql`${whitebitOrderAddressesTable.status} IN ('claiming', 'calling')`,
        ));
        await tx.update(ordersTable).set({
          depositAddress: usable ? input.manualAddress : "",
          depositMemo: usable ? input.manualMemo : "",
          fundingStatus: usable ? "ready_manual" : "unresolved",
          fundingProviderError: reason,
          providerState: usable ? "whitebit_fallback" : "whitebit_address_unresolved",
          outcomeUnknown: false,
          fundingProviderSource: "whitebit",
          settlementSnapshot: settlement,
          fundingDetailsSnapshot: funding,
          updatedAt: new Date(),
        }).where(and(eq(ordersTable.id, input.orderId), sql`${ordersTable.fundingStatus} IN ('provisioning', 'unresolved')`));
      });
    return usable;
  };
  if (!input.chosenWhitebit) {
    return { source: "manual" as const, address: input.manualAddress, memo: input.manualMemo, unresolved: false };
  }
  const capability = await isWhitebitSwapEnabled(input.assetCode, input.networkCode);
  if (!capability || !(await hasOrderAddressTable())) {
    const usedFallback = await fallback("WhiteBIT capability or address storage is unavailable.");
    return { source: "whitebit" as const, address: usedFallback ? input.manualAddress : null, memo: usedFallback ? input.manualMemo : null, unresolved: !usedFallback };
  }
  const claimed = await db.transaction(async (tx) => {
    // Credential activation takes the credentials lock before the provider lock.
    // Keep that order here to avoid a rotation/provisioning deadlock.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('rook:whitebit:credentials', 0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
    const [setting] = await tx.select().from(whitebitProviderSettingsTable)
      .where(eq(whitebitProviderSettingsTable.provider, "whitebit")).limit(1);
    const storedCredentials = await getWhitebitCredentialStorageState(tx);
    const credentialsReady = storedCredentials.status === "available" ||
      Boolean(process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET);
    const credentialSnapshot: WhitebitCredentials | undefined = storedCredentials.status === "available"
      ? storedCredentials.credentials
      : process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
        ? { apiKey: process.env.WHITEBIT_API_KEY, secretKey: process.env.WHITEBIT_API_SECRET }
        : undefined;
    if (!setting || setting.disabled || !credentialsReady) return { claim: undefined, row: undefined, disabled: true };
    const [claim] = await tx.insert(whitebitOrderAddressesTable).values({
      orderId: input.orderId,
      ticker: input.assetCode.trim().toUpperCase(),
      providerTicker: capability.providerTicker,
      network: capability.providerNetwork,
      status: "claiming",
    }).onConflictDoNothing({ target: whitebitOrderAddressesTable.orderId }).returning();
    const row = claim ?? (await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.orderId, input.orderId)).limit(1))[0];
    return { claim, row, disabled: false, credentialSnapshot };
  });
   if (claimed.disabled) {
      const usedFallback = await fallback("WhiteBIT is disabled or not configured.");
      return { source: "whitebit" as const, address: usedFallback ? input.manualAddress : null, memo: usedFallback ? input.manualMemo : null, unresolved: !usedFallback };
   }
  const claim = claimed.claim;
  const row = claimed.row;
    if (!row) {
      const usedFallback = await fallback("WhiteBIT address claim could not be created.");
      return { source: "whitebit" as const, address: usedFallback ? input.manualAddress : null, memo: usedFallback ? input.manualMemo : null, unresolved: !usedFallback };
    }
  if (row.status === "ready" && row.address) {
    return { source: "whitebit" as const, address: row.address, memo: row.memo ?? "", unresolved: false, confirmations: capability.requiredConfirmations };
  }
  const expectedClaimToken = input.expectedClaimToken ?? (claim?.claimToken ?? row.claimToken);
  if (row.status !== "claiming" || !expectedClaimToken) return { source: "whitebit" as const, address: null, memo: null, unresolved: false };
  const [calling] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
    return tx.update(whitebitOrderAddressesTable).set({ status: "calling", updatedAt: new Date() })
      .where(and(eq(whitebitOrderAddressesTable.orderId, input.orderId),
        eq(whitebitOrderAddressesTable.claimToken, expectedClaimToken),
        eq(whitebitOrderAddressesTable.status, "claiming"))).returning();
  });
  if (!calling) return { source: "whitebit" as const, address: null, memo: null, unresolved: false };
  let result: Record<string, unknown>;
  try {
    result = await whitebitPost<Record<string, unknown>>("/api/v4/main-account/create-new-address", {
      ticker: capability.providerTicker,
      network: capability.providerNetwork,
    }, claimed.credentialSnapshot);
  } catch (error) {
    const definitive = error instanceof ApiError && error.code === "WHITEBIT_PROVIDER_DEFINITIVE";
    await finalizeClaimAndOrder(input.orderId, calling.id, {
      status: "unresolved",
      providerError: definitive
        ? "WhiteBIT rejected the unique address request. Verify create-new-address access for this API key and recover the order address."
        : "Provider outcome is unknown; operator recovery is required.",
    });
    const usedFallback = await fallback(definitive
      ? "WhiteBIT rejected the unique address request."
      : "WhiteBIT provider outcome is unknown; manual fallback selected.");
    return { source: "whitebit" as const, address: usedFallback ? input.manualAddress : null, memo: usedFallback ? input.manualMemo : null, unresolved: !usedFallback };
  }
  const parsedAddress = parseWhitebitAddressResponse(result);
  const validatedAddress = parsedAddress
    ? await validateOrderDepositInstructions(input.orderId, input.assetCode, input.networkCode, parsedAddress)
    : null;
  if (!validatedAddress) {
    await finalizeClaimAndOrder(input.orderId, calling.id, {
      status: "unresolved",
      providerError: "WhiteBIT response did not contain valid instructions for the exact order route.",
    });
    const usedFallback = await fallback("WhiteBIT response did not contain valid instructions for the exact order route.");
    return { source: "whitebit" as const, address: usedFallback ? input.manualAddress : null, memo: usedFallback ? input.manualMemo : null, unresolved: !usedFallback };
  }
   let saved: Awaited<ReturnType<typeof finalizeClaimAndOrder>>;
   try {
     saved = await finalizeClaimAndOrder(input.orderId, calling.id, {
        address: validatedAddress.address,
        memo: validatedAddress.memo,
       status: "ready",
       providerError: null,
     });
   } catch (error) {
     const reused = error instanceof ApiError && error.code === "WHITEBIT_ORDER_ADDRESS_REUSED";
     const usedFallback = await fallback(reused
       ? "WhiteBIT returned an address already assigned to another order."
       : "WhiteBIT address could not be assigned durably.");
     return {
       source: "whitebit" as const,
       address: usedFallback ? input.manualAddress : null,
       memo: usedFallback ? input.manualMemo : null,
       unresolved: !usedFallback,
     };
   }
   if (!saved?.address) {
     await fallback("WhiteBIT address finalization was unavailable.");
     return { source: "whitebit" as const, address: input.manualFallbackUsable ? input.manualAddress : null, memo: input.manualFallbackUsable ? input.manualMemo : null, unresolved: !input.manualFallbackUsable };
   }
   return { source: "whitebit" as const, address: saved.address, memo: saved.memo ?? "", unresolved: false, confirmations: capability.requiredConfirmations };
}

function providerIdentity(record: Record<string, unknown>, envelopeId?: string): string {
  const transactionId = typeof record.transaction_id === "string" ? record.transaction_id : typeof record.transactionId === "string" ? record.transactionId : "";
  const uniqueId = typeof record.unique_id === "string" ? record.unique_id : typeof record.uniqueId === "string" ? record.uniqueId : "";
  if (transactionId) return `transaction:${transactionId}`;
  if (uniqueId) return `unique:${uniqueId}`;
  return `provisional:${envelopeId ?? "unidentified"}`;
}

function hasStableIdentity(record: Record<string, unknown>): boolean {
  return (typeof record.transaction_id === "string" && record.transaction_id.length > 0) ||
    (typeof record.transactionId === "string" && record.transactionId.length > 0) ||
    (typeof record.unique_id === "string" && record.unique_id.length > 0) ||
    (typeof record.uniqueId === "string" && record.uniqueId.length > 0);
}

export function assetIdentity(ticker: string, network: string): { ticker: string; network: string; providerTicker: string } {
  const raw = ticker.trim().toUpperCase();
  let base = raw;
  let resolvedNetwork = network.trim().toUpperCase();
  const separator = raw.lastIndexOf("_");
  const aliases: Record<string, string> = { ETH: "ERC20", ERC20: "ERC20", TRX: "TRC20", TRC20: "TRC20", BSC: "BEP20", BEP20: "BEP20" };
  if (separator > 0) {
    const suffix = raw.slice(separator + 1);
    if (aliases[suffix] && (!resolvedNetwork || aliases[suffix] === aliases[resolvedNetwork])) {
      base = raw.slice(0, separator);
      resolvedNetwork = aliases[resolvedNetwork] ?? aliases[suffix];
    }
  }
  return { ticker: base, network: resolvedNetwork, providerTicker: raw };
}

function decimal(value: unknown, positive: boolean): string | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) return null;
  if (positive && /^0(?:\.0{1,18})?$/.test(value)) return null;
  return value;
}

function decimalEqual(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return normalize(left) === normalize(right);
}

export function parseWhitebitAddressResponse(value: unknown): { address: string; memo: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const account = (value as { account?: unknown }).account;
  if (!account || typeof account !== "object" || typeof (account as { address?: unknown }).address !== "string") return null;
  const address = (account as { address: string }).address.trim();
  if (!address) return null;
  return { address, memo: typeof (account as { memo?: unknown }).memo === "string" ? (account as { memo: string }).memo : null };
}

/**
 * Reconciles the durable provider claim into every order funding projection.
 * This is intentionally DB-only: replaying an order after a process crash must
 * never invoke create-new-address a second time.
 */
async function finalizeSwapFundingFromClaimTx(tx: WhitebitTransaction, orderId: string) {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order || order.type !== "manual" ||
      !["provisioning", "unresolved"].includes(order.fundingStatus) ||
      (order.fundingStatus === "unresolved" && order.fundingProviderSource !== "whitebit")) return order;
    if (order.providerState === "whitebit_fallback" && order.fundingStatus === "ready_manual") return order;
    let [claim] = await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.orderId, orderId)).limit(1);
    if (!claim && order.fundingProviderSource === "whitebit") {
      await tx.insert(whitebitOrderAddressesTable).values({
        orderId,
        ticker: order.fromAsset.trim().toUpperCase(),
        providerTicker: order.fromAsset.trim().toUpperCase(),
        network: (order.fromNetwork ?? "").trim().toUpperCase(),
        status: "unresolved",
        providerError: "WhiteBIT address claim was unavailable; operator recovery is required.",
      }).onConflictDoNothing({ target: whitebitOrderAddressesTable.orderId });
      [claim] = await tx.select().from(whitebitOrderAddressesTable)
        .where(eq(whitebitOrderAddressesTable.orderId, orderId)).limit(1);
    }
    if (!claim || claim.status === "claiming") return order;
    if (claim.status === "calling") {
      const cutoff = new Date(Date.now() - WHITEBIT_CALLING_STALE_MS);
      if (claim.updatedAt > cutoff) return order;
      await tx.update(whitebitOrderAddressesTable).set({
        status: "unresolved",
        providerError: "WhiteBIT provider call lease expired; operator recovery is required.",
        updatedAt: new Date(),
      }).where(and(
        eq(whitebitOrderAddressesTable.id, claim.id),
        eq(whitebitOrderAddressesTable.status, "calling"),
        lte(whitebitOrderAddressesTable.updatedAt, cutoff),
      ));
      [claim] = await tx.select().from(whitebitOrderAddressesTable)
        .where(eq(whitebitOrderAddressesTable.id, claim.id)).limit(1);
    }
    const current = (order.fundingDetailsSnapshot ?? (order.settlementSnapshot as Record<string, unknown> | null)?.funding ?? {}) as Record<string, unknown>;
    const settlement = { ...((order.settlementSnapshot ?? {}) as Record<string, unknown>) };
    let funding: Record<string, unknown>;
    let status: "ready_whitebit" | "ready_manual" | "unresolved";
    let source: "whitebit";
    if (claim.status === "ready" && claim.address) {
      funding = {
        ...current,
        address: claim.address,
        memo: claim.memo ?? "",
        source: "whitebit",
        selectedProvider: "whitebit",
        addressSource: "live_api",
        status: "ready",
      };
      status = "ready_whitebit";
      source = "whitebit";
    } else {
      const fallbackAddress = String(current.manualFallbackAddress ?? "");
      const fallbackMemo = String(current.manualFallbackMemo ?? "");
      const fallbackUsable = Boolean(fallbackAddress.trim()) &&
        (!Boolean(current.requiresMemo) || Boolean(fallbackMemo.trim()));
      funding = fallbackUsable
        ? {
            ...current,
            address: fallbackAddress,
            memo: fallbackMemo,
            source: "whitebit",
            selectedProvider: "whitebit",
            addressSource: "manual_fallback",
            status: "manual_fallback",
          }
        : {
            ...current,
            address: "",
            memo: "",
            source: "whitebit",
            selectedProvider: "whitebit",
            addressSource: "unavailable",
            status: "unavailable",
          };
      status = fallbackUsable ? "ready_manual" : "unresolved";
      source = "whitebit";
    }
    settlement.funding = funding;
    const [updated] = await tx.update(ordersTable).set({
      depositAddress: String(funding.address ?? ""),
      depositMemo: String(funding.memo ?? ""),
      fundingStatus: status,
      fundingProviderSource: source,
      fundingProviderError: status === "unresolved" ? "WhiteBIT address provisioning requires operator recovery." : claim.providerError,
      settlementSnapshot: settlement,
      fundingDetailsSnapshot: funding,
      outcomeUnknown: false,
      providerState: status === "ready_manual" ? "whitebit_fallback" : status === "unresolved" ? "whitebit_address_unresolved" : source,
      updatedAt: new Date(),
    }).where(and(
      eq(ordersTable.id, orderId),
      sql`${ordersTable.fundingStatus} IN ('provisioning', 'unresolved')`,
    )).returning();
    return updated ?? order;
}

export async function finalizeSwapFundingFromClaim(orderId: string) {
  return db.transaction((tx) => finalizeSwapFundingFromClaimTx(tx, orderId));
}

async function finalizeClaimAndOrder(
  orderId: string,
  claimId: string,
  patch: {
    status: "ready" | "failed" | "unresolved";
    address?: string | null;
    memo?: string | null;
    providerError?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    if (patch.status === "ready" && patch.address?.trim()) {
      const normalizedAddress = patch.address.trim();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"whitebit-order-address:" + normalizedAddress}))`);
      const [assigned] = await tx.select({ id: whitebitOrderAddressesTable.id })
        .from(whitebitOrderAddressesTable)
        .where(and(
          eq(whitebitOrderAddressesTable.address, normalizedAddress),
          eq(whitebitOrderAddressesTable.status, "ready"),
          sql`${whitebitOrderAddressesTable.id} <> ${claimId}`,
        ))
        .limit(1);
      if (assigned) {
        throw new ApiError(
          "WHITEBIT_ORDER_ADDRESS_REUSED",
          "WhiteBIT returned an address already assigned to another Swap order.",
          409,
        );
      }
    }
    await tx.update(whitebitOrderAddressesTable).set({
      ...patch,
      updatedAt: new Date(),
    }).where(and(
      eq(whitebitOrderAddressesTable.id, claimId),
      sql`${whitebitOrderAddressesTable.status} IN ('claiming', 'calling')`,
    ));
    await finalizeSwapFundingFromClaimTx(tx, orderId);
    const [claim] = await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.id, claimId)).limit(1);
    return claim;
  });
}

async function finalizeUnresolvedSwapFunding(
  orderId: string,
  ticker: string,
  network: string,
  reason: string,
) {
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(whitebitOrderAddressesTable)
        .where(eq(whitebitOrderAddressesTable.orderId, orderId)).limit(1);
      if (!existing) {
        await tx.insert(whitebitOrderAddressesTable).values({
          orderId,
          ticker: ticker.trim().toUpperCase(),
          providerTicker: ticker.trim().toUpperCase(),
          network: network.trim().toUpperCase(),
          status: "unresolved",
          providerError: reason,
        });
      } else if (existing.status === "claiming") {
        await tx.update(whitebitOrderAddressesTable).set({
          status: "unresolved",
          providerError: reason,
          updatedAt: new Date(),
        }).where(eq(whitebitOrderAddressesTable.id, existing.id));
      }
      await finalizeSwapFundingFromClaimTx(tx, orderId);
    });
  } catch {
    // If 0073 is not installed, still terminate the immutable order decision.
    await db.update(ordersTable).set({
      depositAddress: "",
      depositMemo: "",
      fundingStatus: "unresolved",
      fundingProviderSource: "whitebit",
      fundingProviderError: reason,
      outcomeUnknown: true,
      providerState: "whitebit_address_unresolved",
      updatedAt: new Date(),
    }).where(and(eq(ordersTable.id, orderId), eq(ordersTable.fundingStatus, "provisioning")));
  }
}

function normalizedNetwork(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function verifyWhitebitSignature(raw: Buffer, payloadHeader: string, signature: string, secret: string): boolean {
  const encoded = raw.toString("base64");
  const expected = crypto.createHmac("sha512", secret).update(encoded).digest("hex");
  return payloadHeader === encoded &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function isCreditEligible(event: string, status: unknown, addressKnown: boolean): boolean {
  return addressKnown && event === "deposit.processed" && [3, 7].includes(Number(status));
}

export function historyRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  if (!value || typeof value !== "object") throw new ApiError("WHITEBIT_INVALID_RESPONSE", "WhiteBIT history response is malformed.", 502);
  const candidate = (value as { records?: unknown; data?: unknown }).records ?? (value as { data?: unknown }).data;
  if (!Array.isArray(candidate)) throw new ApiError("WHITEBIT_INVALID_RESPONSE", "WhiteBIT history response is malformed.", 502);
  return candidate.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
}

type NormalizedDeposit = {
  address: string; ticker: string; providerTicker: string; network: string; memo: string | null;
  amount: string; fee: string; status: number | null; event: string;
  transactionHash: string | null; uniqueId: string | null; transactionId: string | null;
  confirmationsActual?: number | null; confirmationsRequired?: number | null;
  envelopeId?: string; payloadDigest?: string; rawPayload: Record<string, unknown>;
};

export async function processNormalizedDeposit(tx: WhitebitTransaction, input: NormalizedDeposit): Promise<boolean> {
  const stable = Boolean(input.transactionId || input.uniqueId);
  const identity = stable
    ? providerIdentity({ transactionId: input.transactionId ?? undefined, uniqueId: input.uniqueId ?? undefined })
    : providerIdentity({}, input.envelopeId);
  const rows = await tx.select().from(whitebitDepositAddressesTable).where(and(
    eq(whitebitDepositAddressesTable.address, input.address),
    eq(whitebitDepositAddressesTable.ticker, input.ticker),
    eq(whitebitDepositAddressesTable.network, input.network),
    input.memo === null ? sql`${whitebitDepositAddressesTable.memo} IS NULL` : eq(whitebitDepositAddressesTable.memo, input.memo),
  )).limit(2);
  const addressRow = rows.length === 1 ? rows[0] : undefined;
  let orderRows: typeof whitebitOrderAddressesTable.$inferSelect[] = [];
  if (await hasOrderAddressTable()) {
    orderRows = await tx.select().from(whitebitOrderAddressesTable).where(and(
      eq(whitebitOrderAddressesTable.address, input.address),
      eq(whitebitOrderAddressesTable.ticker, input.ticker),
      eq(whitebitOrderAddressesTable.network, input.network),
      input.memo === null ? sql`${whitebitOrderAddressesTable.memo} IS NULL` : eq(whitebitOrderAddressesTable.memo, input.memo),
      eq(whitebitOrderAddressesTable.status, "ready"),
    )).limit(2);
  }
  const orderAddressRow = orderRows.length === 1 ? orderRows[0] : undefined;
  const ambiguousMapping = orderRows.length > 1 || rows.length > 1 ||
    (rows.length === 1 && orderRows.length > 0);
  const terminal = input.event === "deposit.processed" && [3, 7].includes(Number(input.status));
  const lockAliases = [input.transactionId, input.uniqueId, input.transactionHash]
    .filter((value): value is string => Boolean(value)).sort();
  for (const alias of lockAliases) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${alias}))`);
  }
  if (!lockAliases.length) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${identity}))`);
  const aliases = [];
  if (input.transactionId) aliases.push(eq(whitebitDepositsTable.transactionId, input.transactionId));
  if (input.uniqueId) aliases.push(eq(whitebitDepositsTable.uniqueId, input.uniqueId));
  const aliasMatches = aliases.length ? await tx.select().from(whitebitDepositsTable).where(or(...aliases)).limit(2) : [];
  const aliased = aliasMatches[0];
  const [inserted] = aliased ? [undefined] : await tx.insert(whitebitDepositsTable).values({
    customerId: ambiguousMapping || orderAddressRow ? null : addressRow?.customerId ?? null,
    addressId: ambiguousMapping || orderAddressRow ? null : addressRow?.id ?? null,
    orderAddressId: ambiguousMapping ? null : orderAddressRow?.id ?? null,
    orderId: ambiguousMapping ? null : orderAddressRow?.orderId ?? null,
    ticker: input.ticker, providerTicker: input.providerTicker, network: input.network,
    address: input.address, memo: input.memo, amount: input.amount, fee: input.fee,
    status: terminal ? "processed" : input.event === "deposit.accepted" ? "accepted" : "updated",
    providerStatus: input.status, transactionHash: input.transactionHash,
      confirmationsActual: input.confirmationsActual ?? null,
      confirmationsRequired: input.confirmationsRequired ?? null,
    uniqueId: input.uniqueId, transactionId: input.transactionId, envelopeId: input.envelopeId,
     payloadDigest: input.payloadDigest, providerIdentity: identity, rawPayload: input.rawPayload,
     conflict: ambiguousMapping ? "Address tuple matches multiple order/account mappings; quarantined for operator review." : null,
  }).onConflictDoNothing({ target: whitebitDepositsTable.providerIdentity }).returning();
  const deposit = aliased ?? inserted ?? (await tx.select().from(whitebitDepositsTable)
    .where(eq(whitebitDepositsTable.providerIdentity, identity)).limit(1))[0];
  if (!deposit) return false;
  if (deposit.creditedAt && (!decimalEqual(deposit.amount, input.amount) || !decimalEqual(deposit.fee, input.fee) ||
      deposit.ticker !== input.ticker || deposit.network !== input.network)) {
    await tx.update(whitebitDepositsTable).set({
      conflict: "Terminal replay disagrees with immutable credited economic fields.",
      rawPayload: input.rawPayload, updatedAt: new Date(),
    }).where(eq(whitebitDepositsTable.id, deposit.id));
    return false;
  }
  const rank = (value: string): number => ({ unknown: 0, accepted: 1, updated: 2, processed: 3 }[value] ?? 0);
  const nextStatus = rank(input.event === "deposit.processed" && terminal ? "processed" : input.event === "deposit.accepted" ? "accepted" : "updated") > rank(deposit.status)
    ? (input.event === "deposit.processed" && terminal ? "processed" : input.event === "deposit.accepted" ? "accepted" : "updated") : deposit.status;
  const nextAmount = terminal || rank(deposit.status) < 3 ? input.amount : deposit.amount;
  await tx.update(whitebitDepositsTable).set({
     customerId: ambiguousMapping ? null : deposit.customerId ?? (orderAddressRow ? null : addressRow?.customerId) ?? null,
     addressId: ambiguousMapping ? null : deposit.addressId ?? (orderAddressRow ? null : addressRow?.id) ?? null,
     orderAddressId: ambiguousMapping ? null : deposit.orderAddressId ?? orderAddressRow?.id ?? null,
     orderId: ambiguousMapping ? null : deposit.orderId ?? orderAddressRow?.orderId ?? null,
    status: nextStatus, amount: nextAmount, fee: terminal ? input.fee : deposit.fee,
    providerStatus: terminal ? input.status : deposit.providerStatus,
    transactionHash: input.transactionHash ?? deposit.transactionHash,
     confirmationsActual: input.confirmationsActual ?? deposit.confirmationsActual,
     confirmationsRequired: input.confirmationsRequired ?? deposit.confirmationsRequired,
    uniqueId: input.uniqueId ?? deposit.uniqueId,
    transactionId: input.transactionId ?? deposit.transactionId,
     providerIdentity: stable ? identity : deposit.providerIdentity,
     conflict: ambiguousMapping
       ? "Address tuple matches multiple order/account mappings; quarantined for operator review."
       : deposit.conflict,
    updatedAt: new Date(), rawPayload: input.rawPayload,
  }).where(eq(whitebitDepositsTable.id, deposit.id));
  if (!ambiguousMapping && terminal && stable && orderAddressRow) {
    const [order] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderAddressRow.orderId))
      .limit(1);
    if (
      order?.type === "manual" &&
      order.manualSettlementState === "awaiting_funds"
    ) {
      const now = new Date();
      const updated = await updateOrderAndQueueStatusNotificationTx(
        tx,
        order,
        {
          manualSettlementState: "funds_confirmed",
          manualSettlementStateUpdatedAt: now,
          manualSettlementFundedAt: order.manualSettlementFundedAt ?? now,
          status: "processing",
        },
        undefined,
        {
          action: "order.deposit_confirmed",
          actorType: "system",
          details: {
            provider: "whitebit",
            depositId: deposit.id,
            providerIdentity: identity,
            transactionHash: input.transactionHash,
          },
        },
      );
      if (updated) {
        await enqueueSwapTelegramNotification(
          tx,
          updated,
          "payment_received",
          {
            amount: nextAmount,
            asset: input.ticker,
            network: input.network,
          },
        );
      }
    }
  }
  if (ambiguousMapping || !terminal || !stable || !addressRow?.customerId || orderAddressRow) return false;
  const [ledger] = await tx.insert(whitebitLedgerEntriesTable).values({
    customerId: addressRow.customerId, ticker: input.ticker, amount: nextAmount,
    sourceKey: `whitebit:deposit:${deposit.id}`, depositId: deposit.id,
  }).onConflictDoNothing({ target: whitebitLedgerEntriesTable.sourceKey }).returning();
  await tx.update(whitebitDepositsTable).set({ creditedAt: new Date(), status: "processed", updatedAt: new Date() }).where(eq(whitebitDepositsTable.id, deposit.id));
  return Boolean(ledger);
}

export async function replayHistoryRecord(record: Record<string, unknown>): Promise<boolean> {
  const address = typeof record.address === "string" ? record.address : "";
  const rawTicker = (typeof record.ticker === "string" ? record.ticker : typeof record.currency === "string" ? record.currency : "").trim().toUpperCase();
  const network = normalizedNetwork(record.network);
  const asset = assetIdentity(rawTicker, network);
  const amount = decimal(record.amount, true);
  const fee = decimal(record.fee ?? "0", false);
  if (!address || !asset.ticker || !amount || !fee || !hasStableIdentity(record)) return false;
  const uniqueId = typeof record.unique_id === "string" ? record.unique_id : typeof record.uniqueId === "string" ? record.uniqueId : null;
  const transactionId = typeof record.transaction_id === "string" ? record.transaction_id : typeof record.transactionId === "string" ? record.transactionId : null;
  return db.transaction((tx) => processNormalizedDeposit(tx, {
    address, ticker: asset.ticker, providerTicker: asset.providerTicker, network: asset.network,
    memo: typeof record.memo === "string" ? record.memo : null, amount, fee, status: Number.isInteger(record.status) ? Number(record.status) : null,
    event: "deposit.processed", transactionHash: typeof record.transactionHash === "string" ? record.transactionHash : typeof record.transaction_hash === "string" ? record.transaction_hash : null,
    uniqueId, transactionId, rawPayload: record,
  }));
}

function customerId(req: Parameters<typeof requireCustomer>[0], res: Parameters<typeof requireCustomer>[1]): Promise<string> {
  const clerkId = res.locals.customerClerkUserId as string;
  return db.select({ id: customersTable.id }).from(customersTable)
    .innerJoin(customerProfilesTable, eq(customerProfilesTable.customerId, customersTable.id))
    .where(eq(customerProfilesTable.clerkUserId, clerkId)).limit(1)
    .then(([row]) => {
      if (!row) throw new ApiError("CUSTOMER_NOT_FOUND", "Customer profile not found.", 404);
      return row.id;
    });
}

const router: IRouter = Router();
router.use("/account", requireCustomer);

router.post("/account/deposits/address", async (req, res): Promise<void> => {
  const ticker = typeof req.body?.ticker === "string" ? req.body.ticker.trim().toUpperCase() : "";
  const network = typeof req.body?.network === "string" ? req.body.network.trim().toUpperCase() : "";
  if (!ticker || ticker.length > 32 || network.length > 64) throw new ApiError("VALIDATION_ERROR", "Ticker and network are required.", 400);
  const providerTicker = ticker;
  const id = await customerId(req, res);
  const [existing] = await db.select().from(whitebitDepositAddressesTable)
    .where(and(eq(whitebitDepositAddressesTable.customerId, id), eq(whitebitDepositAddressesTable.ticker, ticker), eq(whitebitDepositAddressesTable.network, network))).limit(1);
  if (existing?.status === "ready" || existing?.status === "pending") {
    res.status(200).json({ id: existing.id, ticker, network, address: existing.address, memo: existing.memo, status: existing.status });
    return;
  }
  const [claim] = await db.insert(whitebitDepositAddressesTable).values({ customerId: id, ticker, providerTicker, network, status: "provisioning" })
    .onConflictDoNothing({ target: [whitebitDepositAddressesTable.customerId, whitebitDepositAddressesTable.ticker, whitebitDepositAddressesTable.network] }).returning();
  const row = claim ?? (await db.select().from(whitebitDepositAddressesTable).where(and(eq(whitebitDepositAddressesTable.customerId, id), eq(whitebitDepositAddressesTable.ticker, ticker), eq(whitebitDepositAddressesTable.network, network))).limit(1))[0];
  if (!row) throw new ApiError("WHITEBIT_ADDRESS_UNAVAILABLE", "The deposit address could not be reserved.", 503);
  if (!claim && row.status === "provisioning") {
    throw new ApiError("WHITEBIT_ADDRESS_PROVISIONING", "A deposit address request is already being resolved.", 409);
  }
  if (row.status !== "provisioning") {
    res.json({ id: row.id, ticker, network, address: row.address, memo: row.memo, status: row.status });
    return;
  }
  let result: Record<string, unknown>;
  try {
    result = await whitebitPost<Record<string, unknown>>("/api/v4/main-account/create-new-address", { ticker, ...(network ? { network } : {}) });
  } catch (error) {
    await db.update(whitebitDepositAddressesTable).set({ status: "unresolved", providerError: "Provider outcome is unknown; operator reconciliation required.", updatedAt: new Date() }).where(eq(whitebitDepositAddressesTable.id, row.id));
    throw error;
  }
  const parsedAddress = parseWhitebitAddressResponse(result);
  const address = parsedAddress?.address ?? null;
  if (!address) {
    await db.update(whitebitDepositAddressesTable).set({ status: "unresolved", providerError: "WhiteBIT response did not contain an address.", updatedAt: new Date() }).where(eq(whitebitDepositAddressesTable.id, row.id));
    throw new ApiError("WHITEBIT_ADDRESS_UNRESOLVED", "WhiteBIT did not return a deposit address.", 502);
  }
  const memo = parsedAddress?.memo ?? null;
  const [saved] = await db.update(whitebitDepositAddressesTable).set({ address, memo, status: "ready", updatedAt: new Date() }).where(eq(whitebitDepositAddressesTable.id, row.id)).returning();
  res.status(201).json({ id: saved.id, ticker, network, address: saved.address, memo: saved.memo, status: saved.status });
});

router.get("/account/deposits", async (req, res): Promise<void> => {
  const id = await customerId(req, res);
  const rows = await db.select().from(whitebitDepositsTable).where(and(
    eq(whitebitDepositsTable.customerId, id),
    sql`${whitebitDepositsTable.providerIdentity} NOT LIKE 'provisional:%'`,
  )).orderBy(desc(whitebitDepositsTable.createdAt)).limit(100);
  res.json(rows);
});

router.get("/account/balances", async (req, res): Promise<void> => {
  const id = await customerId(req, res);
  const rows = await db.select({ ticker: whitebitLedgerEntriesTable.ticker, balance: sql<string>`coalesce(sum(${whitebitLedgerEntriesTable.amount}), 0)::text` })
    .from(whitebitLedgerEntriesTable).where(eq(whitebitLedgerEntriesTable.customerId, id)).groupBy(whitebitLedgerEntriesTable.ticker);
  res.json(rows);
});

export default router;

export const whitebitOperatorRouter: IRouter = Router();

async function fetchWhitebitCatalog() {
  const response = await fetch(`${api}/api/v4/public/assets`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new ApiError("WHITEBIT_CATALOG_UNAVAILABLE", "WhiteBIT asset catalog is unavailable.", 502);
  const catalog = parseWhitebitCatalogAssets(await response.json());
  if (!catalog.length) throw new ApiError("WHITEBIT_CATALOG_INVALID", "WhiteBIT returned an invalid asset catalog.", 502);
  return catalog;
}

whitebitOperatorRouter.get("/admin/whitebit/assets/preview", requireOperator, async (_req, res): Promise<void> => {
  const catalog = await fetchWhitebitCatalog();
  const existing = await db.select({ code: cryptoAssetsTable.code }).from(cryptoAssetsTable);
  const mapped = await db.select({ ticker: whitebitAssetMappingsTable.normalizedTicker, providerTicker: whitebitAssetMappingsTable.providerTicker }).from(whitebitAssetMappingsTable);
  const existingTickers = new Set([
    ...existing.map((row) => row.code.trim().toUpperCase()),
    ...mapped.flatMap((row) => [row.ticker.trim().toUpperCase(), row.providerTicker.trim().toUpperCase()]),
  ]);
  const missing = catalog.filter((asset) => !existingTickers.has(asset.normalizedTicker));
  res.json({ total: catalog.length, alreadyExisting: catalog.length - missing.length, missing: missing.length, assets: missing });
});

whitebitOperatorRouter.post("/admin/whitebit/assets/import", requireOwner, async (req, res): Promise<void> => {
  const selected: unknown[] = Array.isArray(req.body?.providerTickers) ? req.body.providerTickers : [];
  if (!selected.length || selected.length > 128 || selected.some((x: unknown) => typeof x !== "string" || !/^[A-Z0-9]{2,16}$/.test(x))) {
    throw new ApiError("VALIDATION_ERROR", "providerTickers must be 1–128 uppercase alphanumeric tickers.", 400);
  }
  const wanted = new Set((selected as string[]).map((ticker) => ticker.trim().toUpperCase()));
  const catalog = (await fetchWhitebitCatalog()).filter((asset) => wanted.has(asset.normalizedTicker));
  const catalogTickers = new Set(catalog.map((asset) => asset.normalizedTicker));
  const imported: string[] = [];
  const skipped: string[] = [...wanted].filter((ticker) => !catalogTickers.has(ticker));
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-asset-catalog-import'))`);
    for (const asset of catalog) {
      const existing = await tx.select({ id: cryptoAssetsTable.id, code: cryptoAssetsTable.code }).from(cryptoAssetsTable);
      const mappings = await tx.select({ normalizedTicker: whitebitAssetMappingsTable.normalizedTicker, providerTicker: whitebitAssetMappingsTable.providerTicker }).from(whitebitAssetMappingsTable);
      if (existing.some((row) => row.code.trim().toUpperCase() === asset.normalizedTicker) ||
          mappings.some((row) => row.normalizedTicker.trim().toUpperCase() === asset.normalizedTicker || row.providerTicker.trim().toUpperCase() === asset.providerTicker.trim().toUpperCase())) { skipped.push(asset.normalizedTicker); continue; }
      const base = `whitebit-${asset.normalizedTicker.toLowerCase()}`.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
      const assetId = base || `whitebit-asset-${crypto.randomBytes(5).toString("hex")}`;
      const [created] = await tx.insert(cryptoAssetsTable)
        .values({ id: assetId, code: asset.normalizedTicker, name: asset.name, decimals: asset.precision, lifecycle: "active", enabled: false })
        .onConflictDoNothing()
        .returning({ id: cryptoAssetsTable.id });
      if (!created) {
        skipped.push(asset.normalizedTicker);
        continue;
      }
      await tx.insert(whitebitAssetMappingsTable).values({
        id: `${assetId}-mapping`, assetId, providerTicker: asset.providerTicker, normalizedTicker: asset.normalizedTicker,
        providerName: asset.name, precision: asset.precision, metadata: asset.metadata,
      });
      for (const network of asset.networks) {
        const networkId = `${assetId}-${network.providerNetwork.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, Math.max(1, 81 - assetId.length - 1))}`;
        await tx.insert(cryptoAssetNetworksTable).values({
          id: networkId, assetId, networkCode: network.providerNetwork, networkName: network.providerNetwork,
          decimals: asset.precision, executionMode: "api", lifecycle: "active", enabled: false,
          depositProvider: "whitebit",
          customerDepositsEnabled: false, requiresMemo: network.requiresMemo, requiredConfirmations: network.confirmations ?? 0,
          sharedDepositAddress: "", sharedDepositMemo: null,
        });
        await tx.insert(whitebitNetworkMappingsTable).values({
          id: `${networkId}-mapping`, assetNetworkId: networkId, providerNetwork: network.providerNetwork,
          normalizedNetwork: network.providerNetwork.toUpperCase(), canDeposit: network.canDeposit, canWithdraw: network.canWithdraw,
          metadata: network.metadata,
        });
      }
      imported.push(asset.normalizedTicker);
    }
  });
  res.status(201).json({ imported, skipped });
});
whitebitOperatorRouter.post("/admin/whitebit/reconcile", requireOwner, async (_req, res): Promise<void> => {
  const limit = 500;
  const maxPages = 100;
  let records = 0;
  let credited = 0;
  let pages = 0;
  const incompleteAddresses: Array<{ kind: "account" | "order"; id: string; reason: string }> = [];
  const addresses = await db.select().from(whitebitDepositAddressesTable).where(eq(whitebitDepositAddressesTable.status, "ready"));
  for (const address of addresses) {
    const [checkpoint] = await db.select().from(whitebitHistoryCheckpointsTable)
      .where(eq(whitebitHistoryCheckpointsTable.addressId, address.id)).limit(1);
    let offset = 0;
    let complete = false;
    let newestStable: string | null = null;
    let addressPages = 0;
    while (addressPages < maxPages) {
      const response = await whitebitPost<unknown>("/api/v4/main-account/history", {
        transactionMethod: 1, ticker: address.providerTicker,
        address: address.address, ...(address.memo !== null ? { memo: address.memo } : {}),
        limit, offset,
      });
      const page = historyRecords(response);
      const envelope = response && typeof response === "object" && !Array.isArray(response) ? response as { total?: unknown } : {};
      const hasTotal = typeof envelope.total === "number";
      const total = hasTotal ? envelope.total as number : null;
      pages += 1;
      addressPages += 1;
      if (!page.length && (total === null || offset >= total)) { complete = true; break; }
      for (const record of page) {
        const stable = hasStableIdentity(record);
        if (stable && newestStable === null) newestStable = providerIdentity(record);
        if (stable && checkpoint?.highWaterIdentity && providerIdentity(record) === checkpoint.highWaterIdentity) {
          complete = true;
          break;
        }
        if (await replayHistoryRecord(record)) credited += 1;
        records += 1;
      }
      const exhausted = hasTotal ? offset + page.length >= total! : page.length < limit;
      const atProviderCap = offset + page.length >= 10_000 && !exhausted && !complete;
      if (atProviderCap) {
        incompleteAddresses.push({ kind: "account", id: address.id, reason: "Provider history exceeded the 10,000-record reconciliation boundary." });
        break;
      }
      if (complete || exhausted) {
        complete = true;
        break;
      }
      offset += page.length;
    }
    if (!complete && !incompleteAddresses.some((item) => item.id === address.id)) {
      incompleteAddresses.push({ kind: "account", id: address.id, reason: "WhiteBIT history did not reach a safe terminal page." });
    }
    if (complete && newestStable) {
      await db.insert(whitebitHistoryCheckpointsTable).values({ addressId: address.id, highWaterIdentity: newestStable })
        .onConflictDoUpdate({ target: whitebitHistoryCheckpointsTable.addressId, set: { highWaterIdentity: newestStable, updatedAt: new Date() } });
    }
  }
  // Swap funding addresses are also reconciled through the canonical processor.
  // They intentionally have no customer ledger side effect.
  if (await hasOrderAddressTable()) {
    const orderAddresses = await db.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.status, "ready"));
    for (const address of orderAddresses) {
      const [checkpoint] = await db.select().from(whitebitOrderHistoryCheckpointsTable)
        .where(eq(whitebitOrderHistoryCheckpointsTable.orderAddressId, address.id)).limit(1);
      let offset = 0;
      let newestStable: string | null = null;
      let complete = false;
      for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
        const response = await whitebitPost<unknown>("/api/v4/main-account/history", {
          transactionMethod: 1, ticker: address.providerTicker, address: address.address,
          ...(address.memo !== null ? { memo: address.memo } : {}), limit: 500, offset,
        });
        const page = historyRecords(response);
        const envelope = response && typeof response === "object" && !Array.isArray(response)
          ? response as { total?: unknown } : {};
        const total = typeof envelope.total === "number" ? envelope.total : null;
        pages += 1;
        if (!page.length && (total === null || offset >= total)) { complete = true; break; }
        for (const record of page) {
          const stable = hasStableIdentity(record);
          if (stable && newestStable === null) newestStable = providerIdentity(record);
          if (stable && checkpoint?.highWaterIdentity && providerIdentity(record) === checkpoint.highWaterIdentity) {
            complete = true;
            break;
          }
          if (await replayHistoryRecord(record)) credited += 1;
          records += 1;
        }
        const exhausted = total !== null ? offset + page.length >= total : page.length < 500;
        const atProviderCap = offset + page.length >= 10_000 && !exhausted && !complete;
        if (atProviderCap) {
          incompleteAddresses.push({ kind: "order", id: address.id, reason: "Provider history exceeded the 10,000-record reconciliation boundary." });
          break;
        }
        if (complete || exhausted) {
          complete = true;
          break;
        }
        offset += page.length;
      }
      if (!complete && !incompleteAddresses.some((item) => item.id === address.id)) {
        incompleteAddresses.push({ kind: "order", id: address.id, reason: "WhiteBIT history did not reach a safe terminal page." });
      }
      if (complete && newestStable) {
        await db.insert(whitebitOrderHistoryCheckpointsTable).values({
          orderAddressId: address.id, highWaterIdentity: newestStable,
        }).onConflictDoUpdate({
          target: whitebitOrderHistoryCheckpointsTable.orderAddressId,
          set: { highWaterIdentity: newestStable, updatedAt: new Date() },
        });
      }
    }
  }
  res.json({ pages, records, credited, incompleteAddresses });
});
whitebitOperatorRouter.get("/admin/whitebit/balance", async (_req, res): Promise<void> => {
  const value = await whitebitPost<unknown>("/api/v4/main-account/balance", {});
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("WHITEBIT_INVALID_RESPONSE", "WhiteBIT returned an invalid balance response.", 502);
  const output: Record<string, string> = {};
  for (const [ticker, row] of Object.entries(value)) {
    if (typeof row === "string") output[ticker] = row;
    else if (row && typeof row === "object" && typeof (row as { main_balance?: unknown }).main_balance === "string") output[ticker] = (row as { main_balance: string }).main_balance;
  }
  res.json(output);
});
whitebitOperatorRouter.post("/admin/whitebit/recover-address", requireOwner, async (req, res): Promise<void> => {
  const id = typeof req.body?.id === "string" ? req.body.id : "";
  const address = typeof req.body?.address === "string" ? req.body.address : "";
  const memo = typeof req.body?.memo === "string" ? req.body.memo : null;
  if (!id || !address) throw new ApiError("VALIDATION_ERROR", "Address recovery requires the address record id and confirmed provider address.", 400);
  const [row] = await db.update(whitebitDepositAddressesTable)
    .set({ address, memo, status: "ready", providerError: null, updatedAt: new Date() })
    .where(and(eq(whitebitDepositAddressesTable.id, id), eq(whitebitDepositAddressesTable.status, "unresolved")))
    .returning();
  if (!row) throw new ApiError("WHITEBIT_ADDRESS_RECOVERY_INVALID", "Only an unresolved address can be recovered.", 409);
  res.json({ id: row.id, ticker: row.ticker, network: row.network, address: row.address, memo: row.memo, status: row.status });
});
whitebitOperatorRouter.post("/admin/whitebit/recover-order-address", requireOwner, async (req, res): Promise<void> => {
  const id = typeof req.body?.id === "string" ? req.body.id : "";
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const memo = typeof req.body?.memo === "string" ? req.body.memo : null;
  if (!id || !address) throw new ApiError("VALIDATION_ERROR", "Order address recovery requires the record id and confirmed provider address.", 400);
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(whitebitOrderAddressesTable)
      .where(eq(whitebitOrderAddressesTable.id, id)).limit(1);
    if (!existing) throw new ApiError("WHITEBIT_ADDRESS_RECOVERY_INVALID", "Only an unresolved order address can be recovered.", 409);
    const [order] = await tx.select({
      fundingStatus: ordersTable.fundingStatus,
      providerState: ordersTable.providerState,
    }).from(ordersTable).where(eq(ordersTable.id, existing.orderId)).limit(1);
    if (order?.fundingStatus === "ready_manual" && order.providerState === "whitebit_fallback") {
      throw new ApiError(
        "WHITEBIT_ORDER_ALREADY_FALLBACK",
        "This order already exposed its manual fallback address and cannot switch deposit addresses.",
        409,
      );
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"whitebit-order-address:" + address}))`);
    const [assigned] = await tx.select({ id: whitebitOrderAddressesTable.id })
      .from(whitebitOrderAddressesTable)
      .where(and(
        eq(whitebitOrderAddressesTable.address, address),
        eq(whitebitOrderAddressesTable.status, "ready"),
        sql`${whitebitOrderAddressesTable.id} <> ${id}`,
      )).limit(1);
    if (assigned) {
      throw new ApiError(
        "WHITEBIT_ORDER_ADDRESS_REUSED",
        "WhiteBIT returned an address already assigned to another Swap order.",
        409,
      );
    }
    const [updated] = await tx.update(whitebitOrderAddressesTable).set({
      address, memo, status: "ready", providerError: null, updatedAt: new Date(),
    }).where(and(eq(whitebitOrderAddressesTable.id, id), eq(whitebitOrderAddressesTable.status, "unresolved"))).returning();
    if (!updated) throw new ApiError("WHITEBIT_ADDRESS_RECOVERY_INVALID", "Only an unresolved order address can be recovered.", 409);
    if (!updated.address) throw new ApiError("WHITEBIT_ADDRESS_RECOVERY_INVALID", "Recovered address is missing.", 409);
    if (process.env.NODE_ENV === "test" && process.env.WHITEBIT_TEST_FAIL_RECOVERY === "1") {
      throw new Error("Injected recovery finalizer failure");
    }
    await finalizeSwapFundingFromClaimTx(tx, updated.orderId);
    return updated;
  });
  res.json({ id: row.id, orderId: row.orderId, ticker: row.ticker, network: row.network, address: row.address, memo: row.memo, status: row.status });
});

export const whitebitPublicRouter: IRouter = Router();
whitebitPublicRouter.get("/whiteBIT-verification", (_req, res): void => {
  const key = process.env.WHITEBIT_WEBHOOK_PUBLIC_KEY;
  if (!key) { res.status(404).json({ error: "Not found" }); return; }
  res.json([key]);
});

export const whitebitWebhookRouter: IRouter = Router();
whitebitWebhookRouter.post("/webhooks/whitebit", async (req, res): Promise<void> => {
  const webhookKey = process.env.WHITEBIT_WEBHOOK_API_KEY;
  const webhookSecret = process.env.WHITEBIT_WEBHOOK_SECRET;
  const contentType = req.get("content-type")?.split(";")[0].trim().toLowerCase();
  const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
  const payloadHeader = req.get("x-txc-payload");
  const signature = req.get("x-txc-signature");
  if (!webhookKey || !webhookSecret || contentType !== "application/json" || !raw || !payloadHeader || !signature ||
      req.get("x-txc-apikey") !== webhookKey) { res.status(401).json({ error: "Invalid webhook signature" }); return; }
  if (!verifyWhitebitSignature(raw, payloadHeader, signature, webhookSecret)) {
    res.status(401).json({ error: "Invalid webhook signature" }); return;
  }
  const envelope = req.body as { method?: unknown; params?: Record<string, unknown>; id?: unknown };
  const payloadDigest = crypto.createHash("sha256").update(raw).digest("hex");
  const id = typeof envelope.id === "string" ? envelope.id : "";
  const event = typeof envelope.method === "string" ? envelope.method : "";
  const params = envelope.params ?? {};
  const n = typeof params.nonce === "number" && Number.isSafeInteger(params.nonce) ? String(params.nonce) : "";
  if (!id || !event || !n) { res.status(400).json({ error: "Invalid webhook envelope" }); return; }
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(78122341)`);
      const [prior] = await tx.select().from(whitebitWebhookDeliveriesTable).where(eq(whitebitWebhookDeliveriesTable.envelopeId, id)).limit(1);
      if (prior) {
        if (prior.payloadDigest !== payloadDigest || prior.method !== event || String(prior.nonce) !== n) {
          throw new ApiError("WHITEBIT_ENVELOPE_CONFLICT", "Webhook envelope id was reused with different content.", 409);
        }
        return;
      }
       // Delivery order is not guaranteed when WhiteBIT sends concurrent
       // events. Reject a reused nonce, but do not reject a valid signed
       // envelope merely because a higher nonce arrived first.
       const [nonceReplay] = await tx.select({ id: whitebitWebhookDeliveriesTable.id })
         .from(whitebitWebhookDeliveriesTable)
         .where(eq(whitebitWebhookDeliveriesTable.nonce, n))
         .limit(1);
       if (nonceReplay) throw new ApiError("WHITEBIT_NONCE_REPLAY", "Webhook nonce was already processed.", 409);
      const [delivery] = await tx.insert(whitebitWebhookDeliveriesTable).values({ envelopeId: id, nonce: n, method: event, payload: envelope, payloadDigest }).onConflictDoNothing({ target: whitebitWebhookDeliveriesTable.envelopeId }).returning();
      if (!delivery) return;
       // Retain the signed cancellation for audit without changing deposit
       // state or requiring a Production schema migration.
       if (event === "deposit.canceled") return;
       if (!["deposit.accepted", "deposit.updated", "deposit.processed"].includes(event)) return;
      const address = typeof params.address === "string" ? params.address : "";
      const rawTicker = (typeof params.ticker === "string" ? params.ticker : typeof params.currency === "string" ? params.currency : "").trim().toUpperCase();
      const network = normalizedNetwork(params.network);
      const asset = assetIdentity(rawTicker, network);
      const amount = decimal(params.amount, true);
      const fee = decimal(params.fee ?? "0", false);
      if (!address || !asset.ticker || !amount || !fee) throw new ApiError("WHITEBIT_INVALID_RESPONSE", "WhiteBIT webhook amount fields are malformed.", 400);
      const uniqueId = typeof params.unique_id === "string" ? params.unique_id : typeof params.uniqueId === "string" ? params.uniqueId : null;
      const transactionId = typeof params.transaction_id === "string" ? params.transaction_id : typeof params.transactionId === "string" ? params.transactionId : null;
      await processNormalizedDeposit(tx, {
        address, ticker: asset.ticker, providerTicker: asset.providerTicker, network: asset.network,
        memo: typeof params.memo === "string" ? params.memo : null, amount, fee,
        status: Number.isInteger(params.status) ? Number(params.status) : null, event,
        transactionHash: typeof params.transactionHash === "string" ? params.transactionHash : null,
         confirmationsActual: Number.isInteger(params.confirmations) ? Number(params.confirmations) : null,
         confirmationsRequired: Number.isInteger(params.confirmationsRequired) ? Number(params.confirmationsRequired) : null,
        uniqueId, transactionId, envelopeId: id, payloadDigest, rawPayload: params,
      });
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof ApiError && error.code === "WHITEBIT_NONCE_REPLAY") { res.status(409).json({ error: error.message }); return; }
    if (error instanceof ApiError && error.code === "WHITEBIT_ENVELOPE_CONFLICT") { res.status(409).json({ error: error.message }); return; }
    throw error;
  }
});