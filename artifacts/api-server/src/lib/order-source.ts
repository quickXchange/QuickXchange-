import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { verifyTelegramMiniAppSession } from "../routes/telegram-mini-app";

export type OrderSource = "website" | "telegram_mini_app" | "telegram_bot" | "unknown";
const botHeader = "x-qx-bot-order-origin";
function signature(clientRequestId: string, timestamp: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Order origin signing is not configured");
  return createHmac("sha256", secret).update(`order-origin:telegram-bot:${timestamp}:${clientRequestId}`).digest("hex");
}

/** Internal bot requests attest provenance, not customer identity or permissions. */
export function telegramBotOrderSourceHeaders(body: { clientRequestId?: unknown }, now = Date.now()) {
  const timestamp = String(now);
  return { [botHeader]: `${timestamp}.${signature(String(body.clientRequestId ?? ""), timestamp)}` };
}

export function requestOrderSource(req: Pick<Request, "headers" | "body">, now = Date.now()): OrderSource {
  const proof = req.headers[botHeader];
  if (typeof proof === "string") {
    const [timestamp, supplied, extra] = proof.split(".");
    if (!extra && timestamp && supplied && Math.abs(now - Number(timestamp)) <= 5 * 60_000) {
      const expected = signature(String(req.body?.clientRequestId ?? ""), timestamp);
      const a = Buffer.from(supplied), b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return "telegram_bot";
    }
    // Unverified source claims must never be accepted as Telegram provenance.
    return "unknown";
  }
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    try {
      verifyTelegramMiniAppSession(authorization.slice(7).trim(), now);
      return "telegram_mini_app";
    } catch { /* A website Clerk bearer is not a Telegram session. */ }
  }
  return "website";
}
