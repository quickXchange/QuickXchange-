import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import test, { after, before } from "node:test";

if (
  process.env.API_TEST_DISPOSABLE_DATABASE !== "1" ||
  process.env.NODE_ENV !== "test" ||
  process.env.REPLIT_DEPLOYMENT
) {
  throw new Error(
    "Customer status notification API tests require the disposable database created by test/run-api-isolated.mjs; do not run directly against a shared database.",
  );
}

let database: typeof import("@workspace/db");
let notifications: typeof import("../src/lib/customer-status-notifications");

before(async () => {
  database = await import("@workspace/db");
  notifications = await import("../src/lib/customer-status-notifications");
});

after(async () => {
  await database.pool.end();
});

test("supported customer status events are provider-accepted and Admin failures retain sanitized provider reasons", async () => {
  const orderId = `QX-${randomUUID()}`;
  const customerEmail = `customer-${randomUUID()}@example.test`;
  const adminEmail = `admin-${randomUUID()}@example.test`;
  const apiKey = `re_test_${randomUUID().replaceAll("-", "")}`;
  const sender = `QuickXchange Tests <test-support@quickchange.exchange>`;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalSender = process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL;
  const originalFetch = globalThis.fetch;
  const [originalSettings] = await database.db.select()
    .from(database.notificationSettingsTable)
    .where(eq(database.notificationSettingsTable.id, "global"))
    .limit(1);
  const calls: Array<{ body: Record<string, unknown>; signal?: AbortSignal }> = [];

  try {
    await database.db.insert(database.ordersTable).values({
      id: orderId,
      type: "manual",
      status: "processing",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "10",
      receiveAmount: "11",
      customerEmail,
      customerName: "Test Customer",
      provider: "Manual desk",
      statusNotificationsEnabled: true,
      fundingProviderSource: "whitebit",
    });
    await database.db.insert(database.whitebitDepositsTable).values({
      orderId,
      ticker: "EUR",
      providerTicker: "EUR",
      address: "test-deposit-address",
      amount: "10",
      status: "processed",
      transactionHash: "test-payment-evidence",
      providerIdentity: `test-notification-${randomUUID()}`,
    });
    await database.db.insert(database.notificationSettingsTable).values({
      id: "global",
      adminNotificationEmail: adminEmail,
      emailEnabled: true,
      adminNotificationsEnabled: true,
      adminEmailEnabled: true,
      adminEmailProcessingEnabled: true,
      customerEmailOrderCreatedEnabled: true,
      customerEmailPaymentReceivedEnabled: true,
      customerEmailProcessingEnabled: true,
      customerEmailCompletedEnabled: true,
      customerEmailFailedCancelledEnabled: true,
    }).onConflictDoUpdate({
      target: database.notificationSettingsTable.id,
      set: {
        adminNotificationEmail: adminEmail,
        emailEnabled: true,
        adminNotificationsEnabled: true,
        adminEmailEnabled: true,
        adminEmailProcessingEnabled: true,
        customerEmailOrderCreatedEnabled: true,
        customerEmailPaymentReceivedEnabled: true,
        customerEmailProcessingEnabled: true,
        customerEmailCompletedEnabled: true,
        customerEmailFailedCancelledEnabled: true,
      },
    });

    const supportedKinds = [
      "order_created",
      "payment_received",
      "processing",
      "completed",
      "failed_cancelled",
    ] as const;
    await database.db.insert(database.customerStatusNotificationEventsTable).values(
      supportedKinds.map((eventKind, index) => ({
        orderId,
        customerClerkUserId: `guest:${customerEmail}`,
        eventKind,
        recipientEmail: customerEmail,
        fromStatus: index === 0 ? "" : "pending",
        toStatus: eventKind,
        statusVersion: index + 1,
        nextAttemptAt: new Date(0),
        createdAt: new Date(Date.now() + index),
      })),
    );
    await database.db.insert(database.customerStatusNotificationEventsTable).values({
      orderId,
      customerClerkUserId: `admin:${adminEmail}`,
      eventKind: "processing",
      recipientEmail: adminEmail,
      adminRecipient: true,
      evidenceKey: "test-admin-processing",
      fromStatus: "pending",
      toStatus: "processing",
      statusVersion: 1,
      nextAttemptAt: new Date(0),
      createdAt: new Date(Date.now() + supportedKinds.length),
    });

    process.env.RESEND_API_KEY = apiKey;
    process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL = sender;
    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ body, signal: init?.signal as AbortSignal | undefined });
      if (body.to && Array.isArray(body.to) && body.to[0] === adminEmail) {
        return new Response(JSON.stringify({
          error: {
            code: "validation_error",
            message: `Could not deliver to ${adminEmail}; credential ${apiKey} rejected.`,
          },
        }), { status: 422, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: `email-${calls.length}` }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    for (let index = 0; index < supportedKinds.length; index += 1) {
      assert.equal(await notifications.processCustomerStatusNotificationOutbox(1, orderId), 1);
    }
    assert.equal(await notifications.processCustomerStatusNotificationOutbox(1, orderId), 0);

    const events = await database.db.select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.orderId, orderId));
    assert.deepEqual(
      events.filter((event) => !event.adminRecipient).map((event) => event.eventKind).sort(),
      [...supportedKinds].sort(),
    );
    for (const event of events.filter((item) => !item.adminRecipient)) {
      assert.equal(event.deliveryStatus, "delivered");
      assert.ok(event.deliveredAt, "2xx provider acceptance is recorded without asserting inbox delivery");
      assert.equal(event.lastErrorCode, "");
    }
    const [adminEvent] = events.filter((event) => event.adminRecipient);
    assert.equal(adminEvent?.deliveryStatus, "pending");
    assert.equal(
      adminEvent?.lastErrorCode,
      `HTTP 422: validation_error: Could not deliver to [redacted-email]; credential [redacted-secret] rejected.`,
    );
    assert.equal(calls.length, supportedKinds.length + 1);
    assert.ok(calls.every((call) => call.body.from === sender));
    assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
    assert.ok(calls.every((call) => JSON.stringify(call.body).includes(apiKey) === false));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalSender === undefined) delete process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL;
    else process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL = originalSender;

    await database.db.delete(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.orderId, orderId));
    await database.db.delete(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.orderId, orderId));
    await database.db.delete(database.ordersTable)
      .where(eq(database.ordersTable.id, orderId));
    if (originalSettings) {
      await database.db.insert(database.notificationSettingsTable).values(originalSettings)
        .onConflictDoUpdate({
          target: database.notificationSettingsTable.id,
          set: originalSettings,
        });
    } else {
      await database.db.delete(database.notificationSettingsTable)
        .where(eq(database.notificationSettingsTable.id, "global"));
    }
  }
});

test("Manual Swap failures notify opted-in email recipients without payment evidence and keep Admin channels independent", async () => {
  const failureOrderIds = [`QX-${randomUUID()}`, `QX-${randomUUID()}`];
  const paidFailureOrderId = `QX-${randomUUID()}`;
  const paidCompletionOrderId = `QX-${randomUUID()}`;
  const paidFailureEmail = `customer-${randomUUID()}@example.test`;
  const customerEmails = failureOrderIds.concat(paidCompletionOrderId)
    .map(() => `customer-${randomUUID()}@example.test`);
  const adminEmail = `admin-${randomUUID()}@example.test`;
  const adminChatId = `91${Date.now()}`;
  const customerChatIds = failureOrderIds.concat(paidCompletionOrderId)
    .map(() => `92${randomUUID().replaceAll("-", "").slice(0, 10)}`);
  const [originalSettings] = await database.db.select()
    .from(database.notificationSettingsTable)
    .where(eq(database.notificationSettingsTable.id, "global"))
    .limit(1);
  const delivered: import("../src/lib/customer-status-notifications").CustomerStatusNotification[] = [];
  const telegramNotifications = await import("../src/lib/telegram-swap-notifications");
  const makeOrder = async (id: string, email: string, fundingProviderSource?: string) => {
    await database.db.insert(database.ordersTable).values({
      id,
      type: "manual",
      status: "pending",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "10",
      receiveAmount: "11",
      customerEmail: email,
      customerName: "Swap Customer",
      provider: "Manual desk",
      statusNotificationsEnabled: true,
      ...(fundingProviderSource ? { fundingProviderSource } : {}),
    });
  };
  const setSettings = async (failedEmailEnabled: boolean, failedTelegramEnabled: boolean) => {
    await database.db.insert(database.notificationSettingsTable).values({
      id: "global",
      adminNotificationEmail: adminEmail,
      adminNotificationsEnabled: true,
      emailEnabled: true,
      adminEmailEnabled: true,
      adminEmailFailedCancelledEnabled: failedEmailEnabled,
      adminEmailCompletedEnabled: true,
      telegramEnabled: true,
      adminTelegramChatId: adminChatId,
      adminTelegramFailedCancelledEnabled: failedTelegramEnabled,
      adminTelegramCompletedEnabled: true,
      customerEmailFailedCancelledEnabled: true,
      customerEmailCompletedEnabled: true,
    }).onConflictDoUpdate({
      target: database.notificationSettingsTable.id,
      set: {
        adminNotificationEmail: adminEmail,
        adminNotificationsEnabled: true,
        emailEnabled: true,
        adminEmailEnabled: true,
        adminEmailFailedCancelledEnabled: failedEmailEnabled,
        adminEmailCompletedEnabled: true,
        telegramEnabled: true,
        adminTelegramChatId: adminChatId,
        adminTelegramFailedCancelledEnabled: failedTelegramEnabled,
        adminTelegramCompletedEnabled: true,
        customerEmailFailedCancelledEnabled: true,
        customerEmailCompletedEnabled: true,
      },
    });
  };

  try {
    notifications.configureCustomerNotificationDeliveryForTests({
      send: (notification) => { delivered.push(notification); },
    });
    for (let index = 0; index < failureOrderIds.length; index += 1) {
      const id = failureOrderIds[index]!;
      const chatId = customerChatIds[index]!;
      await makeOrder(id, customerEmails[index]!);
      await database.db.insert(database.telegramChatsTable).values({
        chatId,
        userId: chatId,
        locale: "en",
      });
      await database.db.insert(database.telegramOrderLinksTable).values({
        chatId,
        orderId: id,
        orderKind: "swap",
        trackingToken: `failed-test-${index}`,
      });
      // Alternate enabled destinations: Admin email and Telegram must not
      // gate one another, and neither should gate the customer email event.
      await setSettings(index === 1, index === 0);
      const [current] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, id));
      const status = index === 0 ? "failed" : "cancelled";
      const failed = await notifications.updateOrderAndQueueStatusNotification(current!, { status });
      assert.equal(failed?.status, status);
      const events = await database.db.select()
        .from(database.customerStatusNotificationEventsTable)
        .where(eq(database.customerStatusNotificationEventsTable.orderId, id));
      assert.equal(events.filter((event) => !event.adminRecipient && event.eventKind === "failed_cancelled").length, 1);
      assert.equal(events.filter((event) => event.adminRecipient).length, index === 1 ? 1 : 0);
      const telegramRows = await database.db.select()
        .from(database.telegramNotificationOutboxTable)
        .where(eq(database.telegramNotificationOutboxTable.orderId, id));
      assert.equal(
        telegramRows.filter((row) => row.chatId === chatId).length,
        0,
        "failed/cancelled Manual Swap must not create customer Telegram outbox rows",
      );
      assert.equal(
        telegramRows.filter((row) => row.chatId === adminChatId && row.eventKind === "failed_cancelled").length,
        index === 0 ? 1 : 0,
      );
      assert.equal(await telegramNotifications.adminSwapTelegramRecipientIsCurrent(
        adminChatId,
        id,
        "failed_cancelled",
      ), index === 0);
      const [unchangedOrder] = await database.db.select().from(database.ordersTable)
        .where(eq(database.ordersTable.id, id));
      await notifications.updateOrderAndQueueStatusNotification(unchangedOrder!, { status });
      const afterDuplicate = await database.db.select()
        .from(database.customerStatusNotificationEventsTable)
        .where(eq(database.customerStatusNotificationEventsTable.orderId, id));
      assert.equal(afterDuplicate.filter((event) => event.eventKind === "failed_cancelled").length, index === 1 ? 2 : 1);
    }

    const firstFailureId = failureOrderIds[0]!;
    assert.equal(await notifications.processCustomerStatusNotificationOutbox(1, firstFailureId), 1);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.eventKind, "failed_cancelled");
    assert.equal(delivered[0]?.paymentEvidenceExists, false);
    const failedEmail = notifications.buildCustomerStatusNotificationContent(delivered[0]!);
    assert.match(failedEmail.text, /could not be completed/i);
    assert.doesNotMatch(failedEmail.text, /payment (?:was )?received/i);
    assert.match(failedEmail.html, /You Planned to Send/);
    assert.doesNotMatch(failedEmail.html, />You Sent</);
    assert.match(failedEmail.text, /You Planned to Send: 10 EUR/);
    const unpaidAdminEmail = notifications.buildCustomerStatusNotificationContent({
      ...delivered[0]!,
      adminRecipient: true,
    });
    assert.match(unpaidAdminEmail.html, /You Planned to Send/);
    assert.match(unpaidAdminEmail.text, /You Planned to Send: 10 EUR/);
    const convertFailureEmail = notifications.buildCustomerStatusNotificationContent({
      ...delivered[0]!,
      orderType: "convert",
      paymentEvidenceExists: false,
    });
    assert.match(convertFailureEmail.html, />You Sent</);
    assert.match(convertFailureEmail.text, /You Sent: 10 EUR/);

    await makeOrder(paidFailureOrderId, paidFailureEmail, "whitebit");
    await setSettings(true, true);
    await database.db.insert(database.whitebitDepositsTable).values({
      orderId: paidFailureOrderId,
      ticker: "EUR",
      providerTicker: "EUR",
      address: "test-paid-failure-deposit",
      amount: "10",
      status: "processed",
      transactionHash: "test-paid-failure-payment",
      providerIdentity: `test-paid-failure-${randomUUID()}`,
    });
    const [pendingPaidFailure] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, paidFailureOrderId));
    await notifications.updateOrderAndQueueStatusNotification(pendingPaidFailure!, { status: "failed" });
    assert.equal(await notifications.processCustomerStatusNotificationOutbox(1, paidFailureOrderId), 1);
    const paidFailureNotification = delivered[1]!;
    assert.equal(paidFailureNotification.eventKind, "failed_cancelled");
    assert.equal(paidFailureNotification.paymentEvidenceExists, true);
    const paidFailureEmailContent = notifications.buildCustomerStatusNotificationContent(paidFailureNotification);
    assert.match(paidFailureEmailContent.html, />You Sent</);
    assert.doesNotMatch(paidFailureEmailContent.html, /You Planned to Send/);
    assert.match(paidFailureEmailContent.text, /You Sent: 10 EUR/);
    assert.match(paidFailureEmailContent.text, /test-paid-failure-payment/);
    const paidFailureAdminEmail = notifications.buildCustomerStatusNotificationContent({
      ...paidFailureNotification,
      adminRecipient: true,
    });
    assert.match(paidFailureAdminEmail.html, />You Sent</);
    assert.match(paidFailureAdminEmail.text, /You Sent: 10 EUR/);

    const completedChatId = customerChatIds[2]!;
    await makeOrder(paidCompletionOrderId, customerEmails[2]!);
    await database.db.insert(database.telegramChatsTable).values({
      chatId: completedChatId,
      userId: completedChatId,
      locale: "en",
    });
    await database.db.insert(database.telegramOrderLinksTable).values({
      chatId: completedChatId,
      orderId: paidCompletionOrderId,
      orderKind: "swap",
      trackingToken: "paid-completion-test",
    });
    await setSettings(true, true);
    await database.db.insert(database.whitebitDepositsTable).values({
      orderId: paidCompletionOrderId,
      ticker: "EUR",
      providerTicker: "EUR",
      address: "test-completion-deposit",
      amount: "10",
      status: "processed",
      transactionHash: "test-completion-payment",
      providerIdentity: `test-completion-${randomUUID()}`,
    });
    const [pendingCompletion] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, paidCompletionOrderId));
    const completed = await notifications.updateOrderAndQueueStatusNotification(
      pendingCompletion!,
      { status: "completed" },
    );
    assert.equal(completed?.status, "completed");
    const completionEvents = await database.db.select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.orderId, paidCompletionOrderId));
    assert.equal(completionEvents.filter((event) => event.eventKind === "completed" && !event.adminRecipient).length, 1);
    assert.equal(completionEvents.filter((event) => event.eventKind === "completed" && event.adminRecipient).length, 1);
    const completionTelegramRows = await database.db.select()
      .from(database.telegramNotificationOutboxTable)
      .where(eq(database.telegramNotificationOutboxTable.orderId, paidCompletionOrderId));
    assert.equal(
      completionTelegramRows.filter((row) => row.chatId === completedChatId && row.eventKind === "completed").length,
      0,
      "customer Manual Swap Telegram lifecycle status alerts are email-only",
    );
    assert.equal(
      completionTelegramRows.filter((row) => row.chatId === adminChatId && row.eventKind === "completed").length,
      1,
      "paid Admin completion Telegram remains queued",
    );
    const [sameCompletion] = await database.db.select().from(database.ordersTable)
      .where(eq(database.ordersTable.id, paidCompletionOrderId));
    await notifications.updateOrderAndQueueStatusNotification(sameCompletion!, { status: "completed" });
    const completionEventsAfterRepeat = await database.db.select()
      .from(database.customerStatusNotificationEventsTable)
      .where(eq(database.customerStatusNotificationEventsTable.orderId, paidCompletionOrderId));
    assert.equal(completionEventsAfterRepeat.filter((event) => event.eventKind === "completed" && !event.adminRecipient).length, 1);
    assert.equal(completionEventsAfterRepeat.filter((event) => event.eventKind === "completed" && event.adminRecipient).length, 1);
    assert.equal((await database.db.select().from(database.telegramNotificationOutboxTable)
      .where(eq(database.telegramNotificationOutboxTable.orderId, paidCompletionOrderId)))
      .filter((row) => row.chatId === adminChatId && row.eventKind === "completed").length, 1);
    assert.equal(await telegramNotifications.adminSwapTelegramRecipientIsCurrent(
      adminChatId,
      paidCompletionOrderId,
      "completed",
    ), true);
  } finally {
    for (const id of [...failureOrderIds, paidFailureOrderId, paidCompletionOrderId]) {
      await database.db.delete(database.customerStatusNotificationEventsTable)
        .where(eq(database.customerStatusNotificationEventsTable.orderId, id));
      await database.db.delete(database.telegramNotificationOutboxTable)
        .where(eq(database.telegramNotificationOutboxTable.orderId, id));
      await database.db.delete(database.telegramOrderLinksTable)
        .where(eq(database.telegramOrderLinksTable.orderId, id));
      await database.db.delete(database.whitebitDepositsTable)
        .where(eq(database.whitebitDepositsTable.orderId, id));
      await database.db.delete(database.affiliateCompletionEventsTable)
        .where(eq(database.affiliateCompletionEventsTable.aggregateId, id));
      await database.db.delete(database.ordersTable)
        .where(eq(database.ordersTable.id, id));
    }
    for (const chatId of customerChatIds) {
      await database.db.delete(database.telegramChatsTable)
        .where(eq(database.telegramChatsTable.chatId, chatId));
    }
    if (originalSettings) {
      await database.db.insert(database.notificationSettingsTable).values(originalSettings)
        .onConflictDoUpdate({
          target: database.notificationSettingsTable.id,
          set: originalSettings,
        });
    } else {
      await database.db.delete(database.notificationSettingsTable)
        .where(eq(database.notificationSettingsTable.id, "global"));
    }
  }
});

test("historical customer Swap and Convert lifecycle Telegram rows are suppressed while Admin Swap rows remain deliverable", async () => {
  const swapOrderId = `QX-${randomUUID()}`;
  const convertOrderId = `QX-${randomUUID()}`;
  const swapCustomerChat = `93${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const convertCustomerChat = `94${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const adminChatId = `95${Date.now()}`;
  const adminEmail = `admin-${randomUUID()}@example.test`;
  const [originalSettings] = await database.db.select()
    .from(database.notificationSettingsTable)
    .where(eq(database.notificationSettingsTable.id, "global"))
    .limit(1);
  const swapTelegram = await import("../src/lib/telegram-swap-notifications");
  const convertTelegram = await import("../src/lib/telegram-convert-notifications");
  const historicalSwapKinds = ["payment_received", "processing", "completed", "failed_cancelled"] as const;

  try {
    await database.db.insert(database.notificationSettingsTable).values({
      id: "global",
      adminNotificationEmail: adminEmail,
      adminNotificationsEnabled: true,
      telegramEnabled: true,
      adminTelegramChatId: adminChatId,
      adminTelegramCompletedEnabled: true,
    }).onConflictDoUpdate({
      target: database.notificationSettingsTable.id,
      set: {
        adminNotificationEmail: adminEmail,
        adminNotificationsEnabled: true,
        telegramEnabled: true,
        adminTelegramChatId: adminChatId,
        adminTelegramCompletedEnabled: true,
      },
    });
    await database.db.insert(database.ordersTable).values({
      id: swapOrderId,
      type: "manual",
      status: "completed",
      fromAsset: "EUR",
      fromNetwork: "SEPA",
      toAsset: "USDT",
      toNetwork: "TRC20",
      amount: "10",
      receiveAmount: "11",
      customerEmail: `customer-${randomUUID()}@example.test`,
      provider: "Manual desk",
    });
    await database.db.insert(database.whitebitDepositsTable).values({
      orderId: swapOrderId,
      ticker: "EUR",
      providerTicker: "EUR",
      address: "historical-swap-deposit",
      amount: "10",
      status: "processed",
      transactionHash: "historical-swap-payment",
      providerIdentity: `historical-swap-${randomUUID()}`,
    });
    await database.db.insert(database.quickexOrdersTable).values({
      legacyOrderId: convertOrderId,
      providerOrderId: "historic-telegram-convert",
      providerReference: randomUUID(),
      customerEmail: `convert-${randomUUID()}@example.test`,
      customerName: "Convert Customer",
      status: "completed",
      providerState: "completed",
      route: {
        fromAsset: "BTC",
        fromNetwork: "Bitcoin",
        toAsset: "USDT",
        toNetwork: "TRC20",
        rateMode: "FLOATING",
      },
      amounts: { amount: "1", receiveAmount: "90" },
      addresses: {
        destinationAddress: "convert-destination",
        destinationMemo: "",
        refundAddress: "convert-refund",
        refundMemo: "",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.db.insert(database.telegramChatsTable).values([
      { chatId: swapCustomerChat, userId: swapCustomerChat, locale: "en" },
      { chatId: convertCustomerChat, userId: convertCustomerChat, locale: "en" },
    ]);
    await database.db.insert(database.telegramOrderLinksTable).values([
      {
        chatId: swapCustomerChat,
        orderId: swapOrderId,
        orderKind: "swap",
        trackingToken: "historical-swap-link",
      },
      {
        chatId: convertCustomerChat,
        orderId: convertOrderId,
        orderKind: "convert",
        trackingToken: "historical-convert-link",
      },
    ]);
    await database.db.insert(database.telegramNotificationOutboxTable).values([
      ...historicalSwapKinds.map((eventKind, index) => ({
        chatId: swapCustomerChat,
        orderId: swapOrderId,
        statusVersion: index + 1,
        eventKind,
        payload: { eventKind, orderKind: "manual" },
        deliveryStatus: "pending",
      })),
      {
        chatId: swapCustomerChat,
        orderId: swapOrderId,
        statusVersion: 6,
        eventKind: "status",
        payload: { status: "completed" },
        deliveryStatus: "pending",
      },
      {
        chatId: adminChatId,
        orderId: swapOrderId,
        statusVersion: 5,
        eventKind: "completed",
        payload: { eventKind: "completed", orderKind: "manual", adminRecipient: true },
        deliveryStatus: "pending",
      },
      {
        chatId: adminChatId,
        orderId: swapOrderId,
        statusVersion: 7,
        eventKind: "status",
        payload: { status: "completed", orderKind: "manual", adminRecipient: true },
        deliveryStatus: "pending",
      },
      ...(["payment_received", "completed"] as const).map((eventKind, index) => ({
        chatId: convertCustomerChat,
        orderId: convertOrderId,
        statusVersion: index + 1,
        eventKind,
        payload: { eventKind, orderKind: "convert" },
        deliveryStatus: "pending",
      })),
      {
        chatId: convertCustomerChat,
        orderId: convertOrderId,
        statusVersion: 3,
        eventKind: "status",
        payload: { status: "completed" },
        deliveryStatus: "pending",
      },
    ]);

    const customerSwapRows = await database.db.select()
      .from(database.telegramNotificationOutboxTable)
      .where(eq(database.telegramNotificationOutboxTable.orderId, swapOrderId));
    for (const row of customerSwapRows.filter((candidate) => candidate.chatId === swapCustomerChat)) {
      assert.equal(row.deliveryStatus, "pending");
      if (row.eventKind === "status") {
        assert.equal(await swapTelegram.isCustomerTelegramLifecycleStatusOutboxRow(
          swapCustomerChat,
          swapOrderId,
          row.eventKind,
          row.payload as { adminRecipient?: boolean; orderKind?: string },
        ), true, "legacy generic customer Swap status rows must be suppressed");
      }
      assert.equal(await swapTelegram.swapTelegramRecipientIsCurrent(
        swapCustomerChat,
        swapOrderId,
        row.eventKind as typeof historicalSwapKinds[number],
      ), false, `historical customer Swap ${row.eventKind} row must not deliver`);
    }
    const historicalAdminStatus = customerSwapRows.find((row) =>
      row.chatId === adminChatId && row.eventKind === "status"
    );
    assert.equal(await swapTelegram.isCustomerTelegramLifecycleStatusOutboxRow(
      adminChatId,
      swapOrderId,
      historicalAdminStatus!.eventKind,
      historicalAdminStatus!.payload as { adminRecipient?: boolean; orderKind?: string },
    ), false, "Admin status rows are not included in customer suppression");
    assert.equal(await swapTelegram.adminSwapTelegramRecipientIsCurrent(
      adminChatId,
      swapOrderId,
      "completed",
    ), true, "Admin Swap completion remains eligible with durable payment evidence");

    const customerConvertRows = await database.db.select()
      .from(database.telegramNotificationOutboxTable)
      .where(eq(database.telegramNotificationOutboxTable.orderId, convertOrderId));
    for (const row of customerConvertRows) {
      assert.equal(row.deliveryStatus, "pending");
      if (row.eventKind === "status") {
        assert.equal(await swapTelegram.isCustomerTelegramLifecycleStatusOutboxRow(
          convertCustomerChat,
          convertOrderId,
          row.eventKind,
          row.payload as { adminRecipient?: boolean; orderKind?: string },
        ), true, "legacy generic customer Convert status rows must be suppressed");
        continue;
      }
      assert.equal(await convertTelegram.convertTelegramRecipientIsCurrent(
        convertCustomerChat,
        convertOrderId,
        row.eventKind as "payment_received" | "completed",
      ), false, `historical customer Convert ${row.eventKind} row must not deliver`);
    }
  } finally {
    for (const id of [swapOrderId, convertOrderId]) {
      await database.db.delete(database.telegramNotificationOutboxTable)
        .where(eq(database.telegramNotificationOutboxTable.orderId, id));
      await database.db.delete(database.telegramOrderLinksTable)
        .where(eq(database.telegramOrderLinksTable.orderId, id));
    }
    await database.db.delete(database.telegramChatsTable)
      .where(eq(database.telegramChatsTable.chatId, swapCustomerChat));
    await database.db.delete(database.telegramChatsTable)
      .where(eq(database.telegramChatsTable.chatId, convertCustomerChat));
    await database.db.delete(database.whitebitDepositsTable)
      .where(eq(database.whitebitDepositsTable.orderId, swapOrderId));
    await database.db.delete(database.ordersTable).where(eq(database.ordersTable.id, swapOrderId));
    await database.db.delete(database.quickexOrdersTable)
      .where(eq(database.quickexOrdersTable.legacyOrderId, convertOrderId));
    if (originalSettings) {
      await database.db.insert(database.notificationSettingsTable).values(originalSettings)
        .onConflictDoUpdate({
          target: database.notificationSettingsTable.id,
          set: originalSettings,
        });
    } else {
      await database.db.delete(database.notificationSettingsTable)
        .where(eq(database.notificationSettingsTable.id, "global"));
    }
  }
});