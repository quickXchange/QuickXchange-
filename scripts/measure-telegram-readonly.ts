import { performance } from "node:perf_hooks";
import { getTelegramBotIdentity, getTelegramWebhookInfo } from "../artifacts/api-server/src/lib/telegram-api";

// Uses the existing server-side credential path. Never prints tokens, identities,
// webhook URLs or payloads, and never sends messages or registers a webhook.
async function main() {
  const samples = [];
  for (let index = 0; index < 3; index++) {
    const start = performance.now();
    const results = await Promise.allSettled([getTelegramBotIdentity(), getTelegramWebhookInfo()]);
    samples.push({
      durationMs: Math.round(performance.now() - start),
      identityVerified: results[0].status === "fulfilled",
      webhookRead: results[1].status === "fulfilled",
    });
  }
  console.log(JSON.stringify({
    environment: "development", operation: "Exchange Bot: getMe + getWebhookInfo (parallel read-only)",
    samples, note: "Real Telegram API round trips, not command/message-delivery latency.",
  }, null, 2));
}
void main().catch(() => { process.exitCode = 1; });
