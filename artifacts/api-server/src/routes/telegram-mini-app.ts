import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  db, ordersTable, quickexOrdersTable, telegramChatsTable, telegramOrderLinksTable,
  blockchainMonitorMatchesTable, blockchainMonitorObservationsTable,
  blockchainMonitorAssetsTable, blockchainMonitorNetworksTable, cryptoAssetNetworksTable,
} from "@workspace/db";
import { verifyOrderTrackingToken } from "../lib/order-access";
import { ApiError } from "../lib/api-error";
import { createTelegramLinkChallenge } from "../lib/telegram-link";

const router: IRouter = Router();
const SESSION_TTL_MS = 15 * 60_000;
export function telegramAccountLinkRelativeUrl(token: string): string {
  return `/telegram/connect?token=${encodeURIComponent(token)}`;
}

type MiniUser = {
  id: number; username?: string; first_name?: string; last_name?: string;
  languageCode?: string; photoUrl?: string;
};
type Session = { v: 1; userId: string; chatId: string; exp: number };
type TelegramMiniAppVerifiedFundingTransaction = {
  transactionHash: string;
  networkCode: string;
  networkName: string;
  confirmations: number;
  detectedAt: string | null;
  explorerUrl?: string;
};
export type TelegramMiniAppManualOrder = ReturnType<typeof manualProjection> & {
  verifiedFundingTransaction?: TelegramMiniAppVerifiedFundingTransaction;
};

export function validateTelegramMiniAppInitData(raw: string, now = Date.now()): MiniUser {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) throw new Error("Telegram Mini App is not configured.");
  const params = new URLSearchParams(raw);
  const supplied = params.get("hash");
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied)) throw new Error("Invalid Telegram init data.");
  const pairs = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(pairs).digest("hex");
  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid Telegram init data.");
  const authDate = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(authDate) || now - authDate * 1000 > SESSION_TTL_MS || authDate * 1000 > now) {
    throw new Error("Telegram init data has expired.");
  }
  let user: unknown;
  try { user = JSON.parse(params.get("user") ?? ""); } catch { throw new Error("Telegram user is missing."); }
  const parsed = user as Partial<MiniUser> & { language_code?: string; photo_url?: string };
  if (!Number.isSafeInteger(parsed.id) || Number(parsed.id) <= 0) throw new Error("Invalid Telegram user.");
  const languageCode = typeof parsed.language_code === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(parsed.language_code)
    ? parsed.language_code : undefined;
  const photoUrl = typeof parsed.photo_url === "string" && /^https:\/\//i.test(parsed.photo_url)
    ? parsed.photo_url : undefined;
  return { ...parsed, languageCode, photoUrl } as MiniUser;
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("Sessions are not configured.");
  return secret;
}
function signSession(session: Session) {
  const encoded = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(`telegram-mini:${encoded}`).digest("base64url");
  return `${encoded}.${sig}`;
}
export function verifyTelegramMiniAppSession(token: string, now = Date.now()): Session {
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) throw new Error("Invalid session.");
  const expected = createHmac("sha256", sessionSecret()).update(`telegram-mini:${encoded}`).digest("base64url");
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid session.");
  let session: Session;
  try { session = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Session; } catch { throw new Error("Invalid session."); }
  if (session.v !== 1 || !session.userId || !session.chatId || !Number.isSafeInteger(session.exp) || session.exp <= now) {
    throw new Error("Session expired.");
  }
  return session;
}

async function authenticated(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) throw new Error("Authentication required.");
  const session = verifyTelegramMiniAppSession(header.slice(7).trim());
  const [chat] = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.chatId, session.chatId)).limit(1);
  if (!chat || chat.userId !== session.userId) throw new Error("Telegram account is not available.");
  return { session, chat };
}

function manualProjection(row: typeof ordersTable.$inferSelect, link: typeof telegramOrderLinksTable.$inferSelect) {
  const snapshot = row.settlementSnapshot as { source?: Record<string, unknown>; target?: Record<string, unknown> } | null;
  const paymentApplicable = row.type === "manual" && snapshot?.source?.kind === "fiat-payment-method" && snapshot?.target?.kind === "crypto-network";
  const paymentDetails = paymentApplicable ? safePaymentDetails(row.paymentDetails) : undefined;
  return {
    id: row.id, orderKind: link.orderKind, type: row.type, status: row.status, fromAsset: row.fromAsset, fromNetwork: row.fromNetwork || undefined,
    sourceSettlementOptionId: row.sourceSettlementOptionId || undefined, toAsset: row.toAsset, toNetwork: row.toNetwork || undefined,
    targetSettlementOptionId: row.targetSettlementOptionId || undefined,
    amount: row.amount, receiveAmount: row.receiveAmount, trackingToken: link.trackingToken,
    networks: [row.fromNetwork, row.toNetwork].filter(Boolean),
    manualSettlementState: row.type === "manual" ? row.manualSettlementState : undefined,
    fundingStatus: row.type === "manual" ? row.fundingStatus : undefined,
    fundingSource: row.type === "manual" ? row.fundingProviderSource : undefined,
    depositAddress: row.type === "manual" && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus) ? row.depositAddress || undefined : undefined,
    depositMemo: row.type === "manual" && ["ready_whitebit", "ready_manual"].includes(row.fundingStatus) ? row.depositMemo || undefined : undefined,
    settlementDetails: row.type === "manual" ? row.settlementDetails ?? undefined : undefined,
    paymentDetails, paymentDetailsApplicable: paymentApplicable, sourcePaymentMethod: safeSourcePaymentMethod(row),
    customerMarkedPaidAt: row.customerMarkedPaidAt?.toISOString() ?? null,
    createdAt: row.createdAt, outcomeUnknown: row.outcomeUnknown, refreshUnavailable: false, customerSafeNote: row.customerSafeNote,
    logos: { from: snapshot?.source?.logoUrl, to: snapshot?.target?.logoUrl },
  };
}
async function verifiedFundingTransaction(orderId: string) {
  const [row] = await db.select({
    transactionHash: blockchainMonitorObservationsTable.transactionHash,
    networkCode: blockchainMonitorNetworksTable.networkCode,
    networkName: blockchainMonitorNetworksTable.networkName,
    confirmations: blockchainMonitorMatchesTable.confirmations,
    detectedAt: blockchainMonitorMatchesTable.appliedAt,
    observedAt: blockchainMonitorObservationsTable.observedAt,
    explorerUrlTemplate: cryptoAssetNetworksTable.explorerUrlTemplate,
  }).from(blockchainMonitorMatchesTable)
    .innerJoin(ordersTable, eq(ordersTable.id, blockchainMonitorMatchesTable.orderId))
    .innerJoin(blockchainMonitorObservationsTable, eq(blockchainMonitorObservationsTable.id, blockchainMonitorMatchesTable.observationId))
    .innerJoin(blockchainMonitorAssetsTable, eq(blockchainMonitorAssetsTable.id, blockchainMonitorObservationsTable.monitorAssetId))
    .innerJoin(blockchainMonitorNetworksTable, eq(blockchainMonitorNetworksTable.id, blockchainMonitorObservationsTable.monitorNetworkId))
    .innerJoin(cryptoAssetNetworksTable, eq(cryptoAssetNetworksTable.id, blockchainMonitorAssetsTable.assetNetworkId))
    .where(and(
      eq(blockchainMonitorMatchesTable.orderId, orderId),
      eq(blockchainMonitorMatchesTable.state, "applied"),
      eq(ordersTable.type, "manual"),
    ))
    .orderBy(desc(blockchainMonitorMatchesTable.appliedAt), desc(blockchainMonitorMatchesTable.updatedAt)).limit(1);
  if (!row) return undefined;
  const template = row.explorerUrlTemplate?.trim();
  return {
    transactionHash: row.transactionHash,
    networkCode: row.networkCode,
    networkName: row.networkName,
    confirmations: row.confirmations,
    detectedAt: (row.detectedAt ?? row.observedAt)?.toISOString() ?? null,
    explorerUrl: template && /^https:\/\//i.test(template) && /\{(?:tx|transactionHash)\}/i.test(template)
      ? template.replace(/\{(?:tx|transactionHash)\}/gi, encodeURIComponent(row.transactionHash)) : undefined,
  };
}
function quickexProjection(row: typeof quickexOrdersTable.$inferSelect, link: typeof telegramOrderLinksTable.$inferSelect) {
  const route = (row.route ?? {}) as { fromAsset?: string; fromNetwork?: string; toAsset?: string; toNetwork?: string };
  const amounts = (row.amounts ?? {}) as { amount?: string; receiveAmount?: string };
  return {
    id: row.legacyOrderId, orderKind: link.orderKind, type: "convert", status: row.status, fromAsset: route.fromAsset ?? "",
    toAsset: route.toAsset ?? "", amount: amounts.amount ?? "", receiveAmount: amounts.receiveAmount ?? "",
    fromNetwork: route.fromNetwork, toNetwork: route.toNetwork, networks: [route.fromNetwork, route.toNetwork].filter(Boolean),
    trackingToken: link.trackingToken, createdAt: row.createdAt, outcomeUnknown: row.outcomeUnknown,
    refreshUnavailable: false, paymentDetailsApplicable: false,
  };
}

function safePaymentDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const allowed = ["name", "iban", "bankName", "bicSwift", "accountNumber", "paymentReference", "reference", "amount", "customInstructions"];
  const source = value as Record<string, unknown>;
  const result = Object.fromEntries(allowed.filter(key => typeof source[key] === "string" && source[key].trim()).map(key => [key, source[key]]));
  return Object.keys(result).length ? result : undefined;
}
function safeSourcePaymentMethod(row: typeof ordersTable.$inferSelect) {
  const snapshot = row.settlementSnapshot as { source?: Record<string, unknown> } | null;
  const source = snapshot?.source;
  if (!source || source.kind !== "fiat-payment-method") return undefined;
  return {
    id: typeof source.id === "string" ? source.id : row.sourceSettlementOptionId || undefined,
    name: typeof source.title === "string" ? source.title : row.fromNetwork || undefined,
    paymentMethodId: typeof source.paymentMethodId === "string" ? source.paymentMethodId : undefined,
    logoUrl: typeof source.logoUrl === "string" ? source.logoUrl : undefined,
  };
}

async function findOrders(chatId: string): Promise<Array<ReturnType<typeof quickexProjection> | TelegramMiniAppManualOrder>> {
  const links = await db.select().from(telegramOrderLinksTable)
    .where(eq(telegramOrderLinksTable.chatId, chatId)).orderBy(desc(telegramOrderLinksTable.createdAt));
  const manual = links.filter(link => link.orderKind !== "convert");
  const convert = links.filter(link => link.orderKind === "convert");
  const rows = [
    ...(manual.length ? await db.select().from(ordersTable).where(inArray(ordersTable.id, manual.map(x => x.orderId))) : []),
    ...(convert.length ? await db.select().from(quickexOrdersTable).where(inArray(quickexOrdersTable.legacyOrderId, convert.map(x => x.orderId))) : []),
  ];
  return (await Promise.all(links.map(async link => {
    const row = rows.find(candidate => ("legacyOrderId" in candidate ? candidate.legacyOrderId : candidate.id) === link.orderId);
    if (!row) return [];
    return ["convert"].includes(link.orderKind)
      ? [quickexProjection(row as typeof quickexOrdersTable.$inferSelect, link)]
      : [{
          ...manualProjection(row as typeof ordersTable.$inferSelect, link),
          verifiedFundingTransaction: await verifiedFundingTransaction(link.orderId),
        }];
  }))).flat();
}

router.post("/telegram/mini-app/session", async (req, res): Promise<void> => {
  const diagnosticHeader = (name: string) => {
    const value = req.get(name);
    return typeof value === "string" ? value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80) : "unknown";
  };
  const diagnostics = {
    telegramWebAppDetected: diagnosticHeader("X-Telegram-WebApp-Detected"),
    initDataPresent: typeof req.body?.initData === "string" && req.body.initData.length > 0,
    unsafeUserPresent: diagnosticHeader("X-Telegram-Unsafe-User-Present"),
    telegramPlatform: diagnosticHeader("X-Telegram-WebApp-Platform"),
    telegramWebAppVersion: diagnosticHeader("X-Telegram-WebApp-Version"),
    miniAppEnvironment: process.env.NODE_ENV ?? "unknown",
    frontendBuildId: diagnosticHeader("X-Frontend-Build-Id"),
  };
  try {
    if (typeof req.body?.initData !== "string") throw new Error("initData is required.");
    const user = validateTelegramMiniAppInitData(req.body.initData);
    const chatId = String(user.id);
    const [byChat] = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.chatId, chatId)).limit(1);
    if (byChat && byChat.userId !== chatId) throw new Error("Telegram account identity conflict.");
    const [byUser] = byChat ? [byChat] : await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.userId, chatId)).limit(1);
    const chat = byUser ?? (await db.insert(telegramChatsTable).values({
      chatId, userId: chatId, username: user.username ?? null, firstName: user.first_name ?? null, locale: "en",
    }).returning())[0];
    if (!chat) throw new Error("Unable to create Telegram session.");
    await db.update(telegramChatsTable).set({ username: user.username ?? chat.username, firstName: user.first_name ?? chat.firstName, updatedAt: new Date() })
      .where(eq(telegramChatsTable.chatId, chat.chatId));
    const expiresAt = Date.now() + SESSION_TTL_MS;
    req.log.info({ ...diagnostics, validationSuccess: true }, "Telegram Mini App authentication succeeded");
    res.json({
      token: signSession({ v: 1, userId: chat.userId, chatId: chat.chatId, exp: expiresAt }),
      expiresAt: new Date(expiresAt).toISOString(),
      user: { id: String(user.id), displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || String(user.id), username: user.username ?? null, firstName: user.first_name ?? null, lastName: user.last_name ?? null, languageCode: user.languageCode ?? null, photoUrl: user.photoUrl ?? null },
      supportUrl: process.env.TELEGRAM_SUPPORT_URL?.trim() || null,
      linkedAccount: Boolean(chat.clerkCustomerUserId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const validationFailureReason =
      message.includes("expired") ? "init_data_expired"
        : message.includes("user is missing") ? "telegram_user_missing"
        : message.includes("Invalid Telegram user") ? "telegram_user_invalid"
        : message.includes("identity conflict") ? "telegram_identity_conflict"
        : message.includes("not configured") ? "telegram_auth_not_configured"
        : message.includes("init data") || message.includes("initData") ? "init_data_invalid"
        : "session_creation_failed";
    req.log.warn(
      { ...diagnostics, validationSuccess: false, validationFailureReason },
      "Telegram Mini App authentication failed",
    );
    const apiError = error instanceof ApiError ? error : new ApiError("TELEGRAM_AUTH_INVALID", error instanceof Error ? error.message : "Invalid session.", 401);
    res.status(apiError.status).json({ error: apiError.message, code: apiError.code, retryable: apiError.retryable, outcomeUnknown: apiError.outcomeUnknown });
  }
});

router.get("/telegram/mini-app/orders", async (req, res): Promise<void> => {
  try { const { session } = await authenticated(req); res.set("Cache-Control", "no-store"); res.json(await findOrders(session.chatId)); }
  catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("TELEGRAM_AUTH_REQUIRED", error instanceof Error ? error.message : "Authentication required.", 401);
    res.status(apiError.status).json({ error: apiError.message, code: apiError.code, retryable: apiError.retryable, outcomeUnknown: apiError.outcomeUnknown });
  }
});
router.get("/telegram/mini-app/orders/:id", async (req, res): Promise<void> => {
  try {
    const { session } = await authenticated(req);
    const orders = await findOrders(session.chatId);
    const found = orders.find(order => order.id === req.params.id);
    if (!found) { const error = new ApiError("ORDER_NOT_FOUND", "Order not found.", 404); res.status(404).json({ error: error.message, code: error.code, retryable: false, outcomeUnknown: false }); return; }
    res.set("Cache-Control", "no-store"); res.json(found);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("TELEGRAM_AUTH_REQUIRED", error instanceof Error ? error.message : "Authentication required.", 401);
    res.status(apiError.status).json({ error: apiError.message, code: apiError.code, retryable: apiError.retryable, outcomeUnknown: apiError.outcomeUnknown });
  }
});

router.post("/telegram/mini-app/account-link", async (req, res): Promise<void> => {
  try {
    const { session } = await authenticated(req);
    const intent = req.body?.intent;
    if (intent !== "signin" && intent !== "signup") throw new ApiError("TELEGRAM_LINK_INVALID", "Link intent must be signin or signup.", 400);
    const token = await createTelegramLinkChallenge(session.chatId, session.userId, intent);
    res.json({ relativeUrl: telegramAccountLinkRelativeUrl(token) });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("TELEGRAM_AUTH_REQUIRED", error instanceof Error ? error.message : "Authentication required.", 401);
    res.status(apiError.status).json({ error: apiError.message, code: apiError.code, retryable: apiError.retryable, outcomeUnknown: apiError.outcomeUnknown });
  }
});
router.post("/telegram/mini-app/orders/link", async (req, res): Promise<void> => {
  try {
    const { session, chat } = await authenticated(req);
    const { orderId, trackingToken } = req.body ?? {};
    if (typeof orderId !== "string" || typeof trackingToken !== "string") throw new Error("Invalid order link.");
    if (!verifyOrderTrackingToken(trackingToken, orderId)) throw new ApiError("ORDER_TRACKING_INVALID", "Invalid tracking token.", 400);
    const quickexOrder = (await db.select().from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, orderId)).limit(1))[0];
    const manualOrder = (await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1))[0];
    const orderKind = quickexOrder ? "convert" : manualOrder?.type === "manual" ? "manual" : manualOrder ? "swap" : undefined;
    const exists = quickexOrder || manualOrder;
    if (!exists || !orderKind) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    await db.transaction(async tx => {
      await claimTelegramOrderOwnership(tx, orderId, orderKind, chat.clerkCustomerUserId ?? undefined);
      await tx.insert(telegramOrderLinksTable).values({ chatId: session.chatId, orderId, trackingToken, orderKind }).onConflictDoNothing();
    });
    const result = (await findOrders(session.chatId)).find(order => order.id === orderId);
    if (!result) throw new Error("Order could not be linked.");
    res.json(result);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : new ApiError("ORDER_LINK_INVALID", error instanceof Error ? error.message : "Unable to link order.", 400);
    res.status(apiError.status).json({ error: apiError.message, code: apiError.code, retryable: apiError.retryable, outcomeUnknown: apiError.outcomeUnknown });
  }
});

async function claimTelegramOrderOwnership(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], orderId: string, kind: string, customer: string | undefined) {
  if (!customer) return;
  if (kind === "convert") {
    const [claimed] = await tx.update(quickexOrdersTable).set({ customerClerkUserId: customer })
      .where(and(eq(quickexOrdersTable.legacyOrderId, orderId), isNull(quickexOrdersTable.customerClerkUserId))).returning({ customerClerkUserId: quickexOrdersTable.customerClerkUserId });
    if (!claimed) {
      const [existing] = await tx.select({ customerClerkUserId: quickexOrdersTable.customerClerkUserId }).from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, orderId)).limit(1);
      if (existing?.customerClerkUserId !== customer) throw new Error("Telegram order ownership conflict.");
    }
    return;
  }
  const [claimed] = await tx.update(ordersTable).set({ customerClerkUserId: customer, customerOwnershipSource: "telegram_link" })
    .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.customerClerkUserId))).returning({ customerClerkUserId: ordersTable.customerClerkUserId });
  if (!claimed) {
    const [existing] = await tx.select({ customerClerkUserId: ordersTable.customerClerkUserId }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (existing?.customerClerkUserId !== customer) throw new Error("Telegram order ownership conflict.");
  }
}
export default router;