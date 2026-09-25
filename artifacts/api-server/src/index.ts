import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { bootstrapQuickexCredentialVerification } from "./lib/quickex";
import { startExchangeStatusNotificationWorker } from "./routes/exchange";
import { startWhitebitHistoryWorker } from "./lib/whitebit-history-worker";
import { validateObjectStorageConfiguration } from "./lib/object-storage";
import { startBlogScheduler } from "./routes/blog";
import { startNewsletterWorker } from "./lib/newsletter";
import { setupTelegramCommands, startTelegramNotificationWorker } from "./routes/telegram";
import { startTelegramNewsWorker } from "./lib/telegram-news";
import { startBlockchainMonitoringWorker } from "./lib/blockchain-monitoring/service";
import { startConvertReconciliationWorker } from "./lib/convert-provider-boundary";
import { applyConfiguredCustomerNotificationRecovery } from "./lib/customer-status-notifications";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);
const QUICKEX_VERIFICATION_REFRESH_MS = 6 * 60 * 60 * 1000;
const QUICKEX_VERIFICATION_RETRY_MS = 15 * 1000;

if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function validateRuntimeConfig(): void {
  const required = [
    "SESSION_SECRET",
    "CLERK_PUBLISHABLE_KEY",
    "PRIVATE_OBJECT_DIR",
    "OBJECT_STORAGE_BACKEND",
  ];
  if (process.env.NODE_ENV === "production") {
    required.push("CLERK_SECRET_KEY");
  }
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
  const storageBackend = process.env.OBJECT_STORAGE_BACKEND?.trim().toLowerCase();
  if (storageBackend !== "replit" && storageBackend !== "gcs") {
    throw new Error("OBJECT_STORAGE_BACKEND must be explicitly set to replit or gcs");
  }
  if (storageBackend === "gcs" && !process.env.GCS_PROJECT_ID?.trim()) {
    throw new Error("GCS_PROJECT_ID is required when OBJECT_STORAGE_BACKEND=gcs");
  }
  if (storageBackend === "gcs" && !process.env.OBJECT_STORAGE_UPLOAD_ORIGINS?.trim()) {
    throw new Error("OBJECT_STORAGE_UPLOAD_ORIGINS is required when OBJECT_STORAGE_BACKEND=gcs");
  }
}

async function start() {
  validateRuntimeConfig();
  await validateObjectStorageConfiguration();
  await applyConfiguredCustomerNotificationRecovery();
  const stopBlogScheduler = startBlogScheduler();
  const stopNotificationWorker = startExchangeStatusNotificationWorker();
  const stopConvertWorker = startConvertReconciliationWorker();
  const stopNewsletterWorker = startNewsletterWorker();
  const stopTelegramWorker = startTelegramNotificationWorker();
  const stopTelegramNewsWorker = startTelegramNewsWorker();
  const stopBlockchainMonitoringWorker = startBlockchainMonitoringWorker();
  const stopWhitebitHistoryWorker = startWhitebitHistoryWorker();
  void setupTelegramCommands().catch((error) => logger.warn({ err: error }, "Telegram command setup failed"));
  let verificationTimer: ReturnType<typeof setTimeout> | undefined;
  const verifyQuickex = async (): Promise<boolean> => {
    try {
      const state = await bootstrapQuickexCredentialVerification();
      logger.info({ state }, "Quickex credential bootstrap check completed");
      return state === "verified";
    } catch (error) {
      logger.warn(
        {
          code: error instanceof Error && "code" in error
            ? String(error.code)
            : "QUICKEX_BOOTSTRAP_FAILED",
        },
        "Quickex credential bootstrap check did not activate Convert",
      );
      return false;
    }
  };
  const scheduleVerification = (delay: number) => {
    verificationTimer = setTimeout(async () => {
      const verified = await verifyQuickex();
      scheduleVerification(
        verified
          ? QUICKEX_VERIFICATION_REFRESH_MS
          : QUICKEX_VERIFICATION_RETRY_MS,
      );
    }, delay);
    verificationTimer.unref();
  };
  const initiallyVerified = await verifyQuickex();
  scheduleVerification(
    initiallyVerified
      ? QUICKEX_VERIFICATION_REFRESH_MS
      : QUICKEX_VERIFICATION_RETRY_MS,
  );

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
  server.on("close", stopBlogScheduler);
  server.on("close", stopNewsletterWorker);
  server.on("close", stopTelegramWorker);
  server.on("close", stopTelegramNewsWorker);
  server.on("close", stopBlockchainMonitoringWorker);
  server.on("close", stopWhitebitHistoryWorker);
  server.on("close", stopConvertWorker);

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");
    if (verificationTimer) clearTimeout(verificationTimer);
    stopNotificationWorker();

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close(async (error) => {
      try {
        await pool.end();
      } catch (poolError) {
        logger.error({ err: poolError }, "PostgreSQL pool shutdown failed");
        error ??= poolError instanceof Error ? poolError : new Error(String(poolError));
      }
      clearTimeout(forceExit);
      if (error) {
        logger.error({ err: error }, "Server shutdown failed");
        process.exit(1);
      }
      logger.info("Graceful shutdown completed");
      process.exit(0);
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((err) => {
  logger.fatal({ err }, "API server failed to start");
  process.exit(1);
});
