import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  db,
  customerProfilesTable,
  customersTable,
  whitebitDepositAddressesTable,
  whitebitHistoryCheckpointsTable,
  whitebitDepositsTable,
  whitebitLedgerEntriesTable,
  whitebitWebhookDeliveriesTable,
} from "@workspace/db";
import { requireCustomer } from "../lib/customer-auth";
import { ApiError } from "../lib/api-error";
import { requireOwner } from "../lib/operator-auth";

const api = "https://whitebit.com";

function credentials(): { key: string; secret: string } {
  const key = process.env.WHITEBIT_API_KEY;
  const secret = process.env.WHITEBIT_API_SECRET;
  if (!key || !secret) throw new ApiError("WHITEBIT_NOT_CONFIGURED", "WhiteBIT is not configured.", 503);
  return { key, secret };
}

async function whitebitPost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const { key, secret } = credentials();
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
  if (!response.ok) throw new ApiError("WHITEBIT_PROVIDER_ERROR", "WhiteBIT rejected the request.", 502);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new ApiError("WHITEBIT_INVALID_RESPONSE", "WhiteBIT returned an invalid response.", 502);
  return value as T;
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
  return { address: (account as { address: string }).address, memo: typeof (account as { memo?: unknown }).memo === "string" ? (account as { memo: string }).memo : null };
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
  envelopeId?: string; payloadDigest?: string; rawPayload: Record<string, unknown>;
};

type WhitebitTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  const terminal = input.event === "deposit.processed" && [3, 7].includes(Number(input.status));
  const lockAliases = [input.transactionId, input.uniqueId].filter((value): value is string => Boolean(value)).sort();
  for (const alias of lockAliases) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${alias}))`);
  }
  if (!lockAliases.length) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${identity}))`);
  const aliases = [];
  if (input.transactionId) aliases.push(eq(whitebitDepositsTable.transactionId, input.transactionId));
  if (input.uniqueId) aliases.push(eq(whitebitDepositsTable.uniqueId, input.uniqueId));
  const aliased = aliases.length ? (await tx.select().from(whitebitDepositsTable).where(or(...aliases)).limit(1))[0] : undefined;
  const [inserted] = aliased ? [undefined] : await tx.insert(whitebitDepositsTable).values({
    customerId: addressRow?.customerId ?? null, addressId: addressRow?.id ?? null,
    ticker: input.ticker, providerTicker: input.providerTicker, network: input.network,
    address: input.address, memo: input.memo, amount: input.amount, fee: input.fee,
    status: terminal ? "processed" : input.event === "deposit.accepted" ? "accepted" : "updated",
    providerStatus: input.status, transactionHash: input.transactionHash,
    uniqueId: input.uniqueId, transactionId: input.transactionId, envelopeId: input.envelopeId,
    payloadDigest: input.payloadDigest, providerIdentity: identity, rawPayload: input.rawPayload,
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
    customerId: deposit.customerId ?? addressRow?.customerId ?? null,
    addressId: deposit.addressId ?? addressRow?.id ?? null,
    status: nextStatus, amount: nextAmount, fee: terminal ? input.fee : deposit.fee,
    providerStatus: terminal ? input.status : deposit.providerStatus,
    transactionHash: input.transactionHash ?? deposit.transactionHash,
    uniqueId: input.uniqueId ?? deposit.uniqueId,
    transactionId: input.transactionId ?? deposit.transactionId,
    providerIdentity: stable ? identity : deposit.providerIdentity,
    updatedAt: new Date(), rawPayload: input.rawPayload,
  }).where(eq(whitebitDepositsTable.id, deposit.id));
  if (!terminal || !stable || !addressRow?.customerId) return false;
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
whitebitOperatorRouter.post("/admin/whitebit/reconcile", requireOwner, async (_req, res): Promise<void> => {
  const limit = 500;
  const maxPages = 100;
  let records = 0;
  let credited = 0;
  let pages = 0;
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
      if (complete || offset + page.length >= 10_000 || (hasTotal ? offset + page.length >= total! : page.length < limit)) {
        complete = true;
        break;
      }
      offset += page.length;
    }
    if (!complete) throw new ApiError("WHITEBIT_RECONCILIATION_INCOMPLETE", "WhiteBIT reconciliation safety limit reached; no checkpoint was advanced.", 503);
    if (newestStable) {
      await db.insert(whitebitHistoryCheckpointsTable).values({ addressId: address.id, highWaterIdentity: newestStable })
        .onConflictDoUpdate({ target: whitebitHistoryCheckpointsTable.addressId, set: { highWaterIdentity: newestStable, updatedAt: new Date() } });
    }
  }
  res.json({ pages, records, credited });
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
      const [last] = await tx.select({ nonce: whitebitWebhookDeliveriesTable.nonce }).from(whitebitWebhookDeliveriesTable).orderBy(desc(whitebitWebhookDeliveriesTable.nonce)).limit(1);
      if (last && BigInt(n) <= BigInt(last.nonce)) throw new ApiError("WHITEBIT_NONCE_REPLAY", "Webhook nonce is not increasing.", 409);
      const [delivery] = await tx.insert(whitebitWebhookDeliveriesTable).values({ envelopeId: id, nonce: n, method: event, payload: envelope, payloadDigest }).onConflictDoNothing({ target: whitebitWebhookDeliveriesTable.envelopeId }).returning();
      if (!delivery) return;
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