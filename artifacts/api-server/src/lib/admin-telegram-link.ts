import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import {
  adminTelegramLinkChallengesTable,
  db,
  notificationSettingsTable,
} from "@workspace/db";

const TOKEN_BYTES = 32;
const CHALLENGE_TTL_MS = 10 * 60_000;

export class AdminTelegramLinkChallengeError extends Error {
  constructor(message = "This Telegram connection link is expired, consumed, or invalid.") {
    super(message);
    this.name = "AdminTelegramLinkChallengeError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createAdminTelegramLinkChallenge(createdBy: string) {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const [challenge] = await db.insert(adminTelegramLinkChallengesTable).values({
    tokenHash: hashToken(token),
    createdBy,
    expiresAt,
  }).returning({ id: adminTelegramLinkChallengesTable.id });
  if (!challenge) throw new Error("Could not create Telegram connection challenge.");
  return { id: challenge.id, token, expiresAt };
}

export async function consumeAdminTelegramLinkChallenge(
  token: string,
  chatId: string,
  username: string,
  verifyDelivery: () => Promise<void>,
) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const tokenHash = hashToken(token);
    // Keep the challenge locked while the provider handshake is attempted. Invalid,
    // expired, or already-consumed links never trigger an outbound message.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${tokenHash}))`);
    const [existing] = await tx.select({ id: adminTelegramLinkChallengesTable.id })
      .from(adminTelegramLinkChallengesTable)
      .where(and(
        eq(adminTelegramLinkChallengesTable.tokenHash, tokenHash),
        gt(adminTelegramLinkChallengesTable.expiresAt, now),
        isNull(adminTelegramLinkChallengesTable.consumedAt),
      ))
      .limit(1);
    if (!existing) throw new AdminTelegramLinkChallengeError();
    const [existingSettings] = await tx.select({ id: notificationSettingsTable.id })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, "global"))
      .limit(1);
    if (!existingSettings) throw new AdminTelegramLinkChallengeError("Notification settings are not initialized.");

    // Delivery acceptance is the handshake. The challenge and settings only become
    // connected after Telegram has accepted this private-chat send.
    await verifyDelivery();
    const [challenge] = await tx.update(adminTelegramLinkChallengesTable)
      .set({ consumedAt: now, connectedChatId: chatId })
      .where(and(
        eq(adminTelegramLinkChallengesTable.tokenHash, tokenHash),
        gt(adminTelegramLinkChallengesTable.expiresAt, now),
        isNull(adminTelegramLinkChallengesTable.consumedAt),
      ))
      .returning({ id: adminTelegramLinkChallengesTable.id });
    if (!challenge) throw new AdminTelegramLinkChallengeError();

    const [settings] = await tx.update(notificationSettingsTable)
      .set({
        adminTelegramChatId: chatId,
        adminTelegramUsername: username,
        telegramEnabled: true,
        updatedAt: now,
      })
      .where(eq(notificationSettingsTable.id, "global"))
      .returning();
    if (!settings) throw new AdminTelegramLinkChallengeError("Notification settings are not initialized.");
    return settings;
  });
}