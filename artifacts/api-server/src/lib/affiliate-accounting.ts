import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { affiliateAccountsTable, affiliateAuditLogsTable, affiliateCommissionsTable, affiliateCompletionEventsTable, affiliatePayoutRequestsTable, affiliateSettingsTable, affiliateValuationReviewsTable, cryptoAssetNetworksTable, cryptoAssetsTable, db } from "@workspace/db";
import { ApiError } from "./api-error";
import { logger } from "./logger";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PUBLIC_CODE_LENGTH = 8;
export const AFFILIATE_PROGRAM_LOCK_ID = 20260868;
const decimal = /^(\d+)(?:\.(\d+))?$/;
function units(value: string, scale = 18): bigint {
  const m = decimal.exec(value);
  if (!m || (m[2]?.length ?? 0) > scale) throw new Error("Invalid canonical decimal.");
  return BigInt(m[1] + (m[2] ?? "").padEnd(scale, "0"));
}
function display(value: bigint, scale = 18) {
  const negative = value < 0n;
  const s = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const rendered = `${s.slice(0, -scale)}.${s.slice(-scale)}`.replace(/\.?0+$/, "") || "0";
  return negative && rendered !== "0" ? `-${rendered}` : rendered;
}
/** Deterministic, lossless commission calculation used by the outbox processor. */
export function calculateAffiliateCommission(volumeUsd: string, rate: string, capUsd?: string): string {
  if (units(volumeUsd) <= 0n || units(rate) <= 0n || units(rate) > 10n ** 18n) throw new Error("Commission volume and rate must be positive; rate cannot exceed 1.");
  let amount = units(volumeUsd) * units(rate) / 10n ** 18n;
  if (capUsd && amount > units(capUsd)) amount = units(capUsd);
  return display(amount);
}
export function immutableReferrerDecision(currentReferrerId: string | null, requestedReferrerId: string) {
  if (!currentReferrerId || currentReferrerId === requestedReferrerId) return "bind" as const;
  return "conflict" as const;
}
export function payoutTransitionAllowed(from: string, to: string) {
  return (from === "requested" && (to === "approved" || to === "rejected")) ||
    (from === "approved" && to === "processing") || (from === "processing" && to === "paid");
}
export function completionEligible(status: string, outcomeUnknown = false) {
  return status.toLowerCase() === "completed" && !outcomeUnknown;
}
export function completionSnapshotEligible(snapshot: { referrerAccountId?: string; settings?: { enabled: boolean; aggregateEnabled: boolean } } | null | undefined) {
  return Boolean(snapshot?.referrerAccountId && snapshot.settings?.enabled && snapshot.settings.aggregateEnabled);
}
export function calculateAffiliateBalance(input: { netLedgerUsd: string; reservedUsd: string; paidUsd: string }) {
  const available = units(input.netLedgerUsd) - units(input.reservedUsd) - units(input.paidUsd);
  return { availableUsd: display(available > 0n ? available : 0n), overdrawn: available < 0n };
}
function code(length = PUBLIC_CODE_LENGTH) {
  return Array.from(randomBytes(length), byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function publicReferralCode(value: string) {
  return value.length > PUBLIC_CODE_LENGTH ? value.slice(-PUBLIC_CODE_LENGTH) : value;
}

async function requireEnabledAffiliateSettings(status = 409) {
  const [settings] = await db.select().from(affiliateSettingsTable)
    .orderBy(desc(affiliateSettingsTable.version))
    .limit(1);
  if (!settings?.enabled) {
    throw new ApiError("AFFILIATE_DISABLED", "The affiliate program is unavailable.", status);
  }
  return settings;
}

export async function enabledAffiliateCaptureSettings() {
  return requireEnabledAffiliateSettings(404);
}

async function isPublicReferralCodeOccupied(value: string) {
  const normalized = publicReferralCode(value.trim().toUpperCase());
  const [match] = await db.select({ id: affiliateAccountsTable.id })
    .from(affiliateAccountsTable)
    .where(sql`right(upper(${affiliateAccountsTable.code}), ${PUBLIC_CODE_LENGTH}) = ${normalized}`)
    .limit(1);
  return Boolean(match);
}

export async function findAffiliateByReferralCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (![PUBLIC_CODE_LENGTH, 12].includes(normalized.length) || !/^[A-Z2-9]+$/.test(normalized)) return null;
  const matches = await db.select().from(affiliateAccountsTable).where(or(
    sql`upper(${affiliateAccountsTable.code}) = ${normalized}`,
    normalized.length === PUBLIC_CODE_LENGTH
      ? sql`right(upper(${affiliateAccountsTable.code}), ${PUBLIC_CODE_LENGTH}) = ${normalized}`
      : sql`false`,
  )).limit(2);
  return matches.length === 1 ? matches[0] : null;
}

export async function ensureAffiliateAccount(customerClerkUserId: string) {
  for (;;) {
    const [existing] = await db.select().from(affiliateAccountsTable).where(eq(affiliateAccountsTable.customerClerkUserId, customerClerkUserId)).limit(1);
    if (existing) return existing;
    const candidate = code();
    // Unlike findAffiliateByReferralCode, this check treats an ambiguous
    // legacy suffix as occupied. The database expression index is the final
    // concurrent-writer fence for the same public namespace.
    if (await isPublicReferralCodeOccupied(candidate)) continue;
    const [created] = await db.insert(affiliateAccountsTable).values({ customerClerkUserId, code: candidate }).onConflictDoNothing().returning();
    if (created) return created;
  }
}

/** Binding happens once; callers may never replace an existing referrer. */
export async function bindAffiliateReferrer(customerId: string, referralCode: string) {
  await requireEnabledAffiliateSettings();
  const account = await ensureAffiliateAccount(customerId);
  const referrer = await findAffiliateByReferralCode(referralCode);
  if (!referrer || referrer.id === account.id) throw new ApiError("REFERRAL_INVALID", "The referral code cannot be used.", 422);
  if (account.referrerAccountId) {
    if (immutableReferrerDecision(account.referrerAccountId, referrer.id) === "bind") return account;
    throw new ApiError("REFERRER_IMMUTABLE", "A referrer cannot be changed.", 409);
  }
  return db.transaction(async tx => {
    // Settings mutations use the same lock. A binding that commits before a
    // pause is valid; once a pause commits, no stale binding can follow it.
    await tx.execute(sql`select pg_advisory_xact_lock(${AFFILIATE_PROGRAM_LOCK_ID})`);
    const [currentSettings] = await tx.select().from(affiliateSettingsTable)
      .orderBy(desc(affiliateSettingsTable.version))
      .limit(1);
    if (!currentSettings?.enabled) {
      throw new ApiError("AFFILIATE_DISABLED", "The affiliate program is unavailable.", 409);
    }
    const [bound] = await tx.update(affiliateAccountsTable)
      .set({ referrerAccountId: referrer.id, referrerBoundAt: new Date() })
      .where(and(
        eq(affiliateAccountsTable.id, account.id),
        sql`${affiliateAccountsTable.referrerAccountId} is null`,
      ))
      .returning();
    if (bound) {
      await tx.insert(affiliateAuditLogsTable).values({
        action: "attribution.bound",
        actorType: "customer",
        actorId: customerId,
        targetId: bound.id,
        details: { referrerAccountId: referrer.id },
      });
      return bound;
    }

    // A competing request may have bound the account after the initial read.
    // Re-read inside the transaction so concurrent codes never report a false success.
    const [current] = await tx.select().from(affiliateAccountsTable)
      .where(eq(affiliateAccountsTable.id, account.id))
      .limit(1);
    if (current?.referrerAccountId === referrer.id) return current;
    throw new ApiError("REFERRER_IMMUTABLE", "A referrer cannot be changed.", 409);
  });
}

export type AffiliateAttributionStatus =
  | "bound"
  | "already_bound"
  | "no_referral"
  | "invalid"
  | "unavailable";

/**
 * Consumes a previously captured referral after authentication. Expected
 * customer-input outcomes are returned as data so the client can surface them
 * without turning a completed sign-in into an error page.
 */
export async function consumeAffiliateAttribution(
  customerId: string,
  referralCode?: string,
): Promise<{ status: AffiliateAttributionStatus }> {
  if (!referralCode?.trim()) return { status: "no_referral" };
  try {
    await bindAffiliateReferrer(customerId, referralCode);
    return { status: "bound" };
  } catch (error) {
    if (error instanceof ApiError && error.code === "REFERRER_IMMUTABLE") {
      return { status: "already_bound" };
    }
    if (error instanceof ApiError && error.code === "REFERRAL_INVALID") {
      return { status: "invalid" };
    }
    if (error instanceof ApiError && error.code === "AFFILIATE_DISABLED") {
      return { status: "unavailable" };
    }
    throw error;
  }
}

/**
 * Creates the customer's affiliate identity before an order can become
 * commissionable. Invalid or conflicting referral codes are customer input
 * errors and do not block the order; database failures still fail closed.
 */
export async function initializeAffiliateForOrder(customerId: string, referralCode?: string) {
  const account = await ensureAffiliateAccount(customerId);
  if (!referralCode) return { account, referralStatus: "no_referral" as const };
  try {
    return {
      account: await bindAffiliateReferrer(customerId, referralCode),
      referralStatus: "bound" as const,
    };
  } catch (error) {
    if (error instanceof ApiError && ["AFFILIATE_DISABLED", "REFERRAL_INVALID", "REFERRER_IMMUTABLE"].includes(error.code)) {
      const referralStatus = error.code === "AFFILIATE_DISABLED"
        ? "unavailable" as const
        : error.code === "REFERRER_IMMUTABLE"
          ? "already_bound" as const
          : "invalid" as const;
      return { account, referralStatus };
    }
    throw error;
  }
}

/** Only immutable USD snapshots are accepted. Amount and rate remain strings to avoid float accounting. */
export async function processAffiliateCompletion(eventId: string) {
  await db.transaction(async tx => {
    const [event] = await tx.select().from(affiliateCompletionEventsTable).where(eq(affiliateCompletionEventsTable.id, eventId)).limit(1);
    if (!event || event.status !== "pending") return;
    const payload = event.payload as { customerClerkUserId?: string; valuation?: { usd?: string; provenance?: unknown }; snapshot?: { customerAffiliateAccountId?: string; referrerAccountId?: string; settings?: { version: number; enabled: boolean; aggregateEnabled: boolean; rate: string; minimumEligibleUsd: string; transactionCapUsd?: string | null } } | null };
    if (event.eventType === "reversal") {
      const [original] = await tx.select().from(affiliateCommissionsTable).where(and(
        eq(affiliateCommissionsTable.aggregateType, event.aggregateType),
        eq(affiliateCommissionsTable.aggregateId, event.aggregateId),
        eq(affiliateCommissionsTable.kind, "commission"),
      )).limit(1);
      if (original) await tx.insert(affiliateCommissionsTable).values({
        affiliateAccountId: original.affiliateAccountId, completionEventId: event.id,
        aggregateType: event.aggregateType, aggregateId: event.aggregateId, kind: "reversal",
        amountUsd: display(-units(original.amountUsd)), volumeUsd: original.volumeUsd, rate: original.rate,
        settingsVersion: original.settingsVersion, valuation: original.valuation, reversalOfId: original.id,
      }).onConflictDoNothing();
      await tx.update(affiliateCompletionEventsTable).set({ status: "processed", processedAt: new Date() }).where(eq(affiliateCompletionEventsTable.id, event.id));
      return;
    }
    if (!payload.customerClerkUserId) return void await tx.update(affiliateCompletionEventsTable).set({ status: "ignored", processedAt: new Date() }).where(eq(affiliateCompletionEventsTable.id, event.id));
    const snapshot = payload.snapshot;
    if (!completionSnapshotEligible(snapshot)) {
      await tx.update(affiliateCompletionEventsTable).set({ status: "ignored", processedAt: new Date() }).where(eq(affiliateCompletionEventsTable.id, event.id)); return;
    }
    const valuation = payload.valuation;
    if (!valuation?.usd || !valuation.provenance) {
      await tx.insert(affiliateValuationReviewsTable).values({ completionEventId: event.id, reason: "IMMUTABLE_USD_VALUATION_MISSING" }).onConflictDoNothing();
      await tx.update(affiliateCompletionEventsTable).set({ status: "review_required", processedAt: new Date() }).where(eq(affiliateCompletionEventsTable.id, event.id));
      return;
    }
    const terms = snapshot!.settings! as { version: number; rate: string; minimumEligibleUsd: string; transactionCapUsd?: string | null };
    const volume = units(valuation.usd), threshold = units(terms.minimumEligibleUsd);
    if (volume < threshold || units(terms.rate) <= 0n) { await tx.update(affiliateCompletionEventsTable).set({ status: "ignored", processedAt: new Date() }).where(eq(affiliateCompletionEventsTable.id, event.id)); return; }
    const commission = calculateAffiliateCommission(valuation.usd, terms.rate, terms.transactionCapUsd ?? undefined);
    await tx.insert(affiliateCommissionsTable).values({ affiliateAccountId: snapshot!.referrerAccountId!, referredCustomerAccountId: snapshot!.customerAffiliateAccountId, completionEventId: event.id, aggregateType: event.aggregateType, aggregateId: event.aggregateId, amountUsd: commission, volumeUsd: valuation.usd, rate: terms.rate, settingsVersion: terms.version, valuation: valuation as object }).onConflictDoNothing();
    await tx.update(affiliateCompletionEventsTable).set({ status: "processed", processedAt: new Date() }).where(eq(affiliateCompletionEventsTable.id, event.id));
  });
}
export async function processPendingAffiliateCompletions(limit = 50) {
  const events = await db.select({ id: affiliateCompletionEventsTable.id }).from(affiliateCompletionEventsTable)
    .where(eq(affiliateCompletionEventsTable.status, "pending")).orderBy(affiliateCompletionEventsTable.createdAt).limit(limit);
  // One poison event must not prevent later durable events from being retried
  // on the next worker interval.
  let processed = 0;
  for (const event of events) {
    try {
      await processAffiliateCompletion(event.id);
      processed += 1;
    } catch (error) {
      logger.error(
        { err: error, affiliateCompletionEventId: event.id },
        "Affiliate completion processing failed; event remains pending",
      );
    }
  }
  return processed;
}

export async function affiliateDashboard(customerId: string) {
  const account = await ensureAffiliateAccount(customerId);
  const [
    [earned],
    [reserved],
    [paid],
    referrals,
    [volume],
    [reversed],
    activeReferralIds,
    [settings],
  ] = await Promise.all([
    db.select({ value: sql<string>`coalesce(sum(${affiliateCommissionsTable.amountUsd}), 0)` }).from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.affiliateAccountId, account.id)),
    db.select({ value: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}), 0)` }).from(affiliatePayoutRequestsTable).where(and(eq(affiliatePayoutRequestsTable.affiliateAccountId, account.id), sql`${affiliatePayoutRequestsTable.status} in ('requested','approved','processing')`)),
    db.select({ value: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}), 0)` }).from(affiliatePayoutRequestsTable).where(and(eq(affiliatePayoutRequestsTable.affiliateAccountId, account.id), eq(affiliatePayoutRequestsTable.status, "paid"))),
    db.select({ id: affiliateAccountsTable.id, createdAt: affiliateAccountsTable.createdAt }).from(affiliateAccountsTable).where(eq(affiliateAccountsTable.referrerAccountId, account.id)),
    db.select({ value: sql<string>`coalesce(sum(${affiliateCommissionsTable.volumeUsd}), 0)` }).from(affiliateCommissionsTable).where(and(eq(affiliateCommissionsTable.affiliateAccountId, account.id), eq(affiliateCommissionsTable.kind, "commission"))),
    db.select({ value: sql<string>`coalesce(sum(abs(${affiliateCommissionsTable.amountUsd})), 0)` }).from(affiliateCommissionsTable).where(and(eq(affiliateCommissionsTable.affiliateAccountId, account.id), eq(affiliateCommissionsTable.kind, "reversal"))),
    db.selectDistinct({ id: affiliateCommissionsTable.referredCustomerAccountId }).from(affiliateCommissionsTable).where(and(eq(affiliateCommissionsTable.affiliateAccountId, account.id), eq(affiliateCommissionsTable.kind, "commission"))),
    db.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1),
  ]);
  const total = units(earned.value), reservedAmount = units(reserved.value), paidAmount = units(paid.value);
  const balance = calculateAffiliateBalance({ netLedgerUsd: earned.value, reservedUsd: reserved.value, paidUsd: paid.value });
  const referralIds = new Set(referrals.map(referral => referral.id));
  return { code: publicReferralCode(account.code), referralLinkCode: publicReferralCode(account.code), referrerBound: Boolean(account.referrerAccountId), programEnabled: Boolean(settings?.enabled), referralCount: referrals.length, totalReferrals: referrals.length, activeReferrals: activeReferralIds.filter(row => row.id && referralIds.has(row.id)).length, referredVolumeUsd: volume.value, totalEarnedUsd: earned.value, earnedUsd: earned.value, pendingUsd: "0", pendingAvailabilityPolicy: "immediate_after_completed_event", reservedUsd: reserved.value, paidUsd: paid.value, reversedUsd: reversed.value, availableUsd: balance.availableUsd, minimumPayoutUsd: settings?.payoutMinimumUsd ?? "0", payoutEligible: Boolean(settings?.enabled && !balance.overdrawn && units(balance.availableUsd) >= units(settings.payoutMinimumUsd)) };
}

const USDT_PAYOUT_NETWORK_LABELS: Record<string, string> = {
  TRC20: "TRC20",
  ERC20: "ERC20",
  BEP20: "BEP20",
  POLYGON: "Polygon",
  ARBITRUM: "Arbitrum",
  SPL: "Solana",
  TON: "TON",
  BASE: "Base",
  AVAXC: "AVAX C-Chain",
};

const USDT_PAYOUT_NETWORK_CODES = Object.keys(USDT_PAYOUT_NETWORK_LABELS);

export async function enabledAffiliatePayoutNetworks() {
  const rows = await db.select({
    id: cryptoAssetNetworksTable.id,
    networkCode: cryptoAssetNetworksTable.networkCode,
    networkName: cryptoAssetNetworksTable.networkName,
  }).from(cryptoAssetNetworksTable)
    .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
    .where(and(
      eq(cryptoAssetsTable.code, "USDT"),
      eq(cryptoAssetsTable.enabled, true),
      eq(cryptoAssetNetworksTable.enabled, true),
      inArray(sql<string>`upper(${cryptoAssetNetworksTable.networkCode})`, USDT_PAYOUT_NETWORK_CODES),
    ))
    .orderBy(
      desc(cryptoAssetNetworksTable.enabled),
      sql`case ${cryptoAssetNetworksTable.lifecycle} when 'active' then 0 when 'restricted' then 1 when 'deprecated' then 2 else 3 end`,
      asc(cryptoAssetNetworksTable.networkName),
      asc(cryptoAssetNetworksTable.networkCode),
      asc(cryptoAssetNetworksTable.assetId),
      asc(cryptoAssetNetworksTable.id),
    );
  return rows.map(row => ({
    id: row.id,
    code: USDT_PAYOUT_NETWORK_LABELS[row.networkCode.toUpperCase()]!,
    name: row.networkName,
  }));
}

export async function requestAffiliatePayout(customerId: string, amountUsd: string, networkId: string, walletAddress: string) {
  const account = await ensureAffiliateAccount(customerId);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${account.id}))`);
    const [earned] = await tx.select({ value: sql<string>`coalesce(sum(${affiliateCommissionsTable.amountUsd}), 0)` }).from(affiliateCommissionsTable).where(eq(affiliateCommissionsTable.affiliateAccountId, account.id));
    const [reserved] = await tx.select({ value: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}), 0)` }).from(affiliatePayoutRequestsTable).where(and(eq(affiliatePayoutRequestsTable.affiliateAccountId, account.id), sql`${affiliatePayoutRequestsTable.status} in ('requested','approved','processing')`));
    const [paid] = await tx.select({ value: sql<string>`coalesce(sum(${affiliatePayoutRequestsTable.amountUsd}), 0)` }).from(affiliatePayoutRequestsTable).where(and(eq(affiliatePayoutRequestsTable.affiliateAccountId, account.id), eq(affiliatePayoutRequestsTable.status, "paid")));
    const available = calculateAffiliateBalance({ netLedgerUsd: earned.value, reservedUsd: reserved.value, paidUsd: paid.value }).availableUsd;
    const [settings] = await tx.select().from(affiliateSettingsTable).orderBy(desc(affiliateSettingsTable.version)).limit(1);
    if (units(amountUsd) <= 0n || !settings || !settings.enabled || units(amountUsd) < units(settings.payoutMinimumUsd) || units(amountUsd) > units(available)) throw new ApiError("PAYOUT_NOT_ELIGIBLE", "The requested payout is not eligible.", 422);
    const [network] = await tx.select({
      id: cryptoAssetNetworksTable.id,
      networkCode: cryptoAssetNetworksTable.networkCode,
      networkName: cryptoAssetNetworksTable.networkName,
    }).from(cryptoAssetNetworksTable)
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
      .where(and(
        eq(cryptoAssetNetworksTable.id, networkId),
        eq(cryptoAssetsTable.code, "USDT"),
        eq(cryptoAssetsTable.enabled, true),
        eq(cryptoAssetNetworksTable.enabled, true),
        inArray(sql<string>`upper(${cryptoAssetNetworksTable.networkCode})`, USDT_PAYOUT_NETWORK_CODES),
      ))
      .limit(1);
    if (!network) throw new ApiError("PAYOUT_NETWORK_UNAVAILABLE", "The selected USDT network is not available.", 422);
    const destination = {
      asset: "USDT",
      networkId: network.id,
      networkCode: USDT_PAYOUT_NETWORK_LABELS[network.networkCode.toUpperCase()]!,
      networkName: network.networkName,
      walletAddress: walletAddress.trim(),
    };
    const [request] = await tx.insert(affiliatePayoutRequestsTable).values({ affiliateAccountId: account.id, amountUsd, destination }).returning();
    await tx.insert(affiliateAuditLogsTable).values({ action: "payout.requested", actorType: "customer", actorId: customerId, targetId: request.id });
    return request;
  });
}