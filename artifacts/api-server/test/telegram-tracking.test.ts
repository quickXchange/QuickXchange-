import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  customerProfilesTable,
  customersTable,
  db,
  ordersTable,
  quickexOrdersTable,
  telegramChatsTable,
  telegramOrderLinksTable,
  telegramWizardSessionsTable,
} from "@workspace/db";
import { configureCustomerAuthorizationForTests } from "../src/lib/customer-auth";
import { signOrderTrackingToken } from "../src/lib/order-access";
import { t } from "../src/lib/telegram-localization";
import { handleText, handleTelegramTrackingText, resolveTelegramCallbackOrder, resolveTelegramTracking, saveTelegramTrackingLink, startTelegramTracking, telegramOrderIdCandidates, telegramTrackingCard, telegramTrackingFailureMessage } from "../src/routes/telegram";

test("Telegram order tracking resolves canonical IDs only within current identity or a valid chat capability", async () => {
  const suffix = randomUUID();
  const ownerA = `clerk-a-${suffix}`;
  const ownerB = `clerk-b-${suffix}`;
  const customerA = `customer-a-${suffix}`;
  const customerB = `customer-b-${suffix}`;
  const emailA = `a-${suffix}@example.test`;
  const emailB = `b-${suffix}@example.test`;
  const chatA = `71${Math.floor(Math.random() * 1_000_000_000)}`;
  const chatB = `72${Math.floor(Math.random() * 1_000_000_000)}`;
  const manualOwned = "O000000009";
  const oldOwned = `QX-old-${suffix}`;
  const legacyBareNumeric = "1234567890";
  const legacyPrefixedNumeric = "O0607671028";
  const legacySwap = `QX-legacy-swap-${suffix}`;
  const convertOwned = `QX-convert-${suffix}`;
  const ambiguous = `QX-ambiguous-${suffix}`;
  const foreignOrder = `QX-foreign-${suffix}`;
  const foreignOrderNoLink = `QX-foreign-unlinked-${suffix}`;
  const newOwnerOrder = `QX-new-owner-${suffix}`;
  const recentIds = Array.from({ length: 11 }, (_, index) => `QX-recent-${suffix}-${index}`);
  const manualIds = [manualOwned, oldOwned, legacyBareNumeric, legacyPrefixedNumeric, legacySwap, ambiguous, newOwnerOrder, ...recentIds];
  const convertIds = [convertOwned, ambiguous, foreignOrder, foreignOrderNoLink];
  const previous = {
    secret: process.env.SESSION_SECRET,
    port: process.env.PORT,
    website: process.env.TELEGRAM_WEBSITE_URL,
    miniApp: process.env.TELEGRAM_MINI_APP_URL,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    fetch: globalThis.fetch,
  };
  const statusCalls: string[] = [];
  const telegramMessages: Array<{ text: string; reply_markup?: unknown }> = [];
  let duringStatus: (() => Promise<void>) | undefined;
  process.env.SESSION_SECRET = `tracking-test-${suffix}`;
  process.env.PORT = "1";
  process.env.TELEGRAM_WEBSITE_URL = "https://site.example";
  process.env.TELEGRAM_MINI_APP_URL = "https://app.example/telegram-mini-app/";
  process.env.TELEGRAM_BOT_TOKEN = `test-bot-${suffix}`;
  configureCustomerAuthorizationForTests({
    getUserId: () => null,
    getVerifiedEmail: userId => userId === ownerA ? emailA : userId === ownerB ? emailB : null,
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.telegram.org") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string; reply_markup?: unknown };
      if (url.pathname.endsWith("/sendMessage")) telegramMessages.push({ text: String(body.text ?? ""), reply_markup: body.reply_markup });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 44 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    assert.match(url.pathname, /^\/api\/(?:quickex\/orders|orders)\/[^/]+\/status$/);
    statusCalls.push(url.pathname);
    await duringStatus?.();
    return new Response(JSON.stringify({
      id: decodeURIComponent(url.pathname.split("/").at(-2) ?? ""),
      status: "awaiting funds",
      type: "manual",
      fromAsset: "USDT",
      fromNetwork: "TRC20",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: "12.50",
      receiveAmount: "0.0002",
      depositAddress: "synthetic-deposit-address",
      depositMemo: "synthetic-memo",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await db.insert(customersTable).values([
      { id: customerA, name: "Synthetic A", email: emailA, status: "active" },
      { id: customerB, name: "Synthetic B", email: emailB, status: "active" },
    ]);
    await db.insert(customerProfilesTable).values([
      { customerId: customerA, clerkUserId: ownerA },
      { customerId: customerB, clerkUserId: ownerB },
    ]);
    await db.insert(telegramChatsTable).values([
      { chatId: chatA, userId: chatA, clerkCustomerUserId: ownerA },
      { chatId: chatB, userId: chatB, clerkCustomerUserId: null },
    ]);
    await db.insert(ordersTable).values(manualIds.map((id, index) => ({
      id,
      type: id === legacySwap ? "swap" : "manual",
      status: "awaiting funds",
      fromAsset: "USDT",
      fromNetwork: "TRC20",
      toAsset: "BTC",
      toNetwork: "Bitcoin",
      amount: "12.50",
      receiveAmount: "0.0002",
      customerEmail: emailA,
      customerClerkUserId: id === newOwnerOrder ? ownerB : ownerA,
      provider: "Synthetic",
      createdAt: id === oldOwned ? new Date("2020-01-01T00:00:00.000Z") : new Date(Date.now() - index * 1000),
    })));
    await db.insert(quickexOrdersTable).values(convertIds.map(id => ({
      legacyOrderId: id,
      status: "awaiting funds",
      route: { fromAsset: "USDT", fromNetwork: "TRC20", toAsset: "BTC", toNetwork: "Bitcoin", rateMode: "FLOATING" },
      amounts: { amount: "12.50", receiveAmount: "0.0002" },
      addresses: { destinationAddress: "", refundAddress: "", depositAddress: "synthetic-deposit-address", depositMemo: "synthetic-memo" },
      customerClerkUserId: id === foreignOrder || id === foreignOrderNoLink ? ownerB : ownerA,
      customerEmail: id === foreignOrder || id === foreignOrderNoLink ? emailB : emailA,
      createdAt: new Date(),
      updatedAt: new Date(),
    })));

    assert.deepEqual(telegramOrderIdCandidates("9"), ["9", "O9", "O000000009"]);
    assert.deepEqual(telegramOrderIdCandidates("o9"), ["o9", "9", "O9", "O000000009"]);
    assert.ok(telegramOrderIdCandidates("0607671028")?.includes("0607671028"));
    assert.ok(telegramOrderIdCandidates("0607671028")?.includes("O0607671028"));
    assert.ok(telegramOrderIdCandidates("O0607671028")?.includes("0607671028"), "O-prefixed inputs also try the exact bare-digit legacy alias");
    assert.equal(telegramOrderIdCandidates("malformed id"), undefined);

    const callsBeforeOwned = statusCalls.length;
    const ownedNumeric = await resolveTelegramTracking(chatA, "9");
    assert.equal(ownedNumeric?.orderId, manualOwned);
    assert.equal(statusCalls.length, callsBeforeOwned + 1);
    assert.equal(statusCalls.at(-1), `/api/orders/${manualOwned}/status`);
    const ownedOPrefix = await resolveTelegramTracking(chatA, "o9");
    assert.equal(ownedOPrefix?.orderId, manualOwned);
    assert.equal((await resolveTelegramTracking(chatA, "0607671028"))?.orderId, legacyPrefixedNumeric, "the provided ten-digit input resolves only an exact matching O-prefixed canonical record");
    assert.equal((await resolveTelegramTracking(chatA, "O1234567890"))?.orderId, legacyBareNumeric, "O-prefixed input also resolves an exact bare-numeric legacy record");
    assert.equal((await resolveTelegramTracking(chatA, legacySwap))?.orderId, legacySwap, "legacy manual type swap remains in owner scope");
    const oldOrder = await resolveTelegramTracking(chatA, oldOwned);
    assert.equal(oldOrder?.orderId, oldOwned, "older-than-history-window owned orders resolve by exact owner-scoped ID");
    assert.equal((await resolveTelegramTracking(chatA, convertOwned))?.orderKind, "convert");
    assert.equal(await resolveTelegramTracking(chatA, ambiguous), undefined, "ambiguous exact matches are rejected");
    assert.equal(await resolveTelegramTracking(chatA, "unknown-malformed-identifier"), undefined);

    const foreignToken = signOrderTrackingToken(foreignOrder);
    const foreignUnlinkedToken = signOrderTrackingToken(foreignOrderNoLink);
    await db.insert(telegramOrderLinksTable).values({
      chatId: chatA,
      orderId: foreignOrder,
      orderKind: "convert",
      trackingToken: foreignToken,
    });
    const beforeForeign = statusCalls.length;
    assert.equal(await resolveTelegramTracking(chatA, foreignOrder, foreignToken), undefined);
    assert.equal(statusCalls.length, beforeForeign, "a valid foreign capability cannot cause a detail/status read for a signed-in user");
    assert.equal(await resolveTelegramTracking(chatA, foreignOrderNoLink, foreignUnlinkedToken), undefined);
    assert.equal(statusCalls.length, beforeForeign, "a valid foreign capability without a chat link is also rejected before status fetch");
    assert.equal((await db.select().from(telegramOrderLinksTable).where(and(
      eq(telegramOrderLinksTable.chatId, chatA),
      eq(telegramOrderLinksTable.orderId, foreignOrderNoLink),
    ))).length, 0, "a rejected foreign capability does not create a Telegram order link");
    assert.equal(await resolveTelegramTracking(chatA, newOwnerOrder), undefined);
    assert.equal(await resolveTelegramTracking(chatA, manualOwned, "not-a-valid-token"), undefined);

    const card = telegramTrackingCard(ownedNumeric!, "en");
    const beforeCommands = telegramMessages.length;
    await handleText(chatA, "en", "/track");
    assert.equal(telegramMessages.at(-1)?.text, "Enter your Order ID");
    await handleText(chatA, "en", "/track 9");
    assert.match(telegramMessages.at(-1)?.text ?? "", /Order <code>O000000009<\/code>/);
    assert.notEqual(telegramMessages.at(-1)?.text, "Enter your Order ID");
    await handleText(chatA, "en", `/track ${convertOwned}`);
    assert.match(telegramMessages.at(-1)?.text ?? "", /Type: <b>Convert<\/b>/);
    const guestCommandToken = signOrderTrackingToken(convertOwned);
    await handleText(chatB, "en", `/track ${convertOwned} ${guestCommandToken}`);
    assert.match(telegramMessages.at(-1)?.text ?? "", /Type: <b>Convert<\/b>/);
    assert.equal(telegramMessages.length, beforeCommands + 4, "command arguments resolve directly without another ID prompt");
    await db.delete(telegramOrderLinksTable).where(eq(telegramOrderLinksTable.chatId, chatB));
    assert.match(card.text, /Type: <b>Swap<\/b>/);
    assert.match(card.text, /Status: <b>/);
    assert.match(card.text, /12\.50 USDT · TRC20/);
    assert.match(card.text, /Receive: <b>0\.0002 BTC · Bitcoin/);
    const viewUrl = card.buttons.flat().find(button => button.text === t("en", "viewOrder"))?.url;
    assert.ok(viewUrl);
    const parsedView = new URL(viewUrl!);
    assert.equal(parsedView.pathname, "/status");
    assert.equal(parsedView.searchParams.get("orderId"), manualOwned);
    assert.equal(parsedView.searchParams.get("trackingToken"), ownedNumeric!.trackingToken);
    assert.ok(card.buttons.flat().some(button => button.web_app?.url.endsWith(`/orders/${manualOwned}`)));
    assert.ok(card.buttons.flat().some(button => button.callback_data === `order:id:${Buffer.from(manualOwned).toString("base64url")}`));
    assert.ok(card.buttons.flat().some(button => button.callback_data?.startsWith("deposit:id:")));
    assert.equal(card.buttons.flat().find(button => button.callback_data?.startsWith("order:id:"))?.text, "Refresh Status");
    assert.equal(card.buttons.flat().find(button => button.web_app)?.text, "Open MiniApp");

    // Exercise the production message handler: prompt, ID-only signed-in cards, safe equivalent errors, and guest token fallback.
    telegramMessages.length = 0;
    await startTelegramTracking(chatA, "en");
    assert.equal(telegramMessages.at(-1)?.text, "Enter your Order ID");
    await handleTelegramTrackingText(chatA, "en", "9", "track");
    assert.match(telegramMessages.at(-1)?.text ?? "", /Type: <b>Swap<\/b>/);
    assert.doesNotMatch(telegramMessages.at(-1)?.text ?? "", /Enter your Order ID/);
    await startTelegramTracking(chatA, "en");
    await handleTelegramTrackingText(chatA, "en", convertOwned, "track");
    assert.match(telegramMessages.at(-1)?.text ?? "", /Type: <b>Convert<\/b>/);

    const beforeEquivalentFailures = statusCalls.length;
    const equivalentFailureTexts: string[] = [];
    for (const [id, token] of [
      ["malformed id", undefined],
      [`QX-unknown-${suffix}`, undefined],
      [ambiguous, undefined],
      [newOwnerOrder, undefined],
      [foreignOrder, foreignToken],
      [foreignOrderNoLink, foreignUnlinkedToken],
      [manualOwned, "invalid-token"],
    ] as Array<[string, string | undefined]>) {
      await startTelegramTracking(chatA, "en");
      await handleTelegramTrackingText(chatA, "en", token ? `${id} ${token}` : id, "track");
      equivalentFailureTexts.push(telegramMessages.at(-1)?.text ?? "");
    }
    assert.deepEqual(equivalentFailureTexts, Array(7).fill(telegramTrackingFailureMessage("en")));
    assert.equal(statusCalls.length, beforeEquivalentFailures, "unknown, malformed, ambiguous, and foreign capabilities never fetch details");
    assert.equal((await db.select().from(telegramOrderLinksTable).where(and(
      eq(telegramOrderLinksTable.chatId, chatA),
      eq(telegramOrderLinksTable.orderId, foreignOrderNoLink),
    ))).length, 0);

    // An unsigned chat may use an exact valid capability, then reuse only the capability stored for that chat.
    await db.update(telegramChatsTable).set({ clerkCustomerUserId: null }).where(eq(telegramChatsTable.chatId, chatA));
    const guestToken = signOrderTrackingToken(foreignOrder);
    const guestResolved = await resolveTelegramTracking(chatA, foreignOrder, guestToken);
    assert.equal(guestResolved?.orderId, foreignOrder, "a signed-out chat can use a valid supplied capability");
    const guestIdOnly = await resolveTelegramTracking(chatA, convertOwned);
    assert.equal(guestIdOnly?.orderId, convertOwned, "same-chat stored signed capability supports a later ID-only lookup");
    assert.equal(await resolveTelegramTracking(chatB, convertOwned), undefined, "another chat cannot reuse the first chat's stored capability by ID alone");
    assert.equal(await resolveTelegramCallbackOrder(chatB, convertOwned), undefined, "forged/cross-chat callback has no matching chat link");
    assert.equal((await resolveTelegramCallbackOrder(chatA, convertOwned))?.orderId, convertOwned);
    assert.equal(await resolveTelegramTracking(chatB, convertOwned, "invalid-token"), undefined);
    assert.equal((await db.select({ customerClerkUserId: quickexOrdersTable.customerClerkUserId }).from(quickexOrdersTable).where(eq(quickexOrdersTable.legacyOrderId, convertOwned)).limit(1))[0]?.customerClerkUserId, ownerA, "tracking never claims/reassigns ownership");

    await startTelegramTracking(chatB, "en");
    await handleTelegramTrackingText(chatB, "en", foreignOrderNoLink, "track");
    assert.equal(telegramMessages.at(-1)?.text, t("en", "trackingTokenPrompt"));
    const guestSession = (await db.select().from(telegramWizardSessionsTable).where(eq(telegramWizardSessionsTable.chatId, chatB)).limit(1))[0];
    assert.equal(guestSession?.state, "trackToken");
    assert.equal(guestSession?.data.trackingOrderId, foreignOrderNoLink);
    await handleTelegramTrackingText(chatB, "en", foreignUnlinkedToken, "trackToken", guestSession!.data);
    assert.match(telegramMessages.at(-1)?.text ?? "", /Type: <b>Convert<\/b>/);
    assert.equal((await db.select().from(telegramOrderLinksTable).where(and(
      eq(telegramOrderLinksTable.chatId, chatB),
      eq(telegramOrderLinksTable.orderId, foreignOrderNoLink),
    ))).length, 1, "a valid signed-out fallback capability is persisted only to its own chat");

    // The identity is re-read after the awaited status call; a mid-request account switch suppresses the card.
    await db.update(telegramChatsTable).set({ clerkCustomerUserId: ownerA }).where(eq(telegramChatsTable.chatId, chatA));
    duringStatus = async () => {
      duringStatus = undefined;
      await db.update(telegramChatsTable).set({ clerkCustomerUserId: ownerB }).where(eq(telegramChatsTable.chatId, chatA));
    };
    assert.equal(await resolveTelegramTracking(chatA, manualOwned), undefined);
    await db.update(telegramChatsTable).set({ clerkCustomerUserId: ownerA }).where(eq(telegramChatsTable.chatId, chatA));

    // A browser relink racing the persistence transaction must fence off the old owner's capability.
    const raceOrder = recentIds[10];
    const raceToken = signOrderTrackingToken(raceOrder);
    let racedLinkWrite: Promise<boolean> | undefined;
    await db.transaction(async tx => {
      await tx.select({ chatId: telegramChatsTable.chatId })
        .from(telegramChatsTable)
        .where(eq(telegramChatsTable.chatId, chatA))
        .for("update")
        .limit(1);
      racedLinkWrite = saveTelegramTrackingLink(chatA, { orderId: raceOrder, orderKind: "swap" }, raceToken, ownerA);
      await tx.update(telegramChatsTable).set({ clerkCustomerUserId: ownerB }).where(eq(telegramChatsTable.chatId, chatA));
    });
    assert.equal(await racedLinkWrite, false, "identity changed under the row lock prevents storing a stale capability");
    assert.equal((await db.select().from(telegramOrderLinksTable).where(and(
      eq(telegramOrderLinksTable.chatId, chatA),
      eq(telegramOrderLinksTable.orderId, raceOrder),
    ))).length, 0);
    await db.update(telegramChatsTable).set({ clerkCustomerUserId: ownerA }).where(eq(telegramChatsTable.chatId, chatA));

    await db.update(customersTable).set({ status: "suspended" }).where(eq(customersTable.id, customerA));
    const beforeSuspended = statusCalls.length;
    assert.equal(await resolveTelegramTracking(chatA, manualOwned), undefined);
    assert.equal(statusCalls.length, beforeSuspended, "suspended linked customers are rejected before a status/detail read");
    await db.update(customersTable).set({ status: "active" }).where(eq(customersTable.id, customerA));

    assert.equal(t("en", "tracking"), "Enter your Order ID");
    assert.equal(t("fr", "tracking"), "Saisissez l’ID de votre commande.");
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({
      SESSION_SECRET: previous.secret,
      PORT: previous.port,
      TELEGRAM_WEBSITE_URL: previous.website,
      TELEGRAM_MINI_APP_URL: previous.miniApp,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.delete(telegramChatsTable).where(inArray(telegramChatsTable.chatId, [chatA, chatB]));
    await db.delete(ordersTable).where(inArray(ordersTable.id, manualIds));
    await db.delete(quickexOrdersTable).where(inArray(quickexOrdersTable.legacyOrderId, convertIds));
    await db.delete(customerProfilesTable).where(inArray(customerProfilesTable.customerId, [customerA, customerB]));
    await db.delete(customersTable).where(inArray(customersTable.id, [customerA, customerB]));
  }
});