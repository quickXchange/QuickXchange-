import express, { type Request } from "express";
import { createHmac } from "node:crypto";
import { pool } from "@workspace/db";
import telegramMiniAppRouter from "../src/routes/telegram-mini-app";

const app = express();
const SYNTHETIC_BOT_TOKEN = "1234567890:synthetic-telegram-mini-app-auth-harness";
const SYNTHETIC_USER_ID = 910000000001;
const FIXTURE_IDS = {
  valid: "telegram-mini-auth-smoke-v1",
  tampered: "telegram-mini-auth-tampered-v1",
  expired: "telegram-mini-auth-expired-v1",
} as const;
const port = Number(process.env.TELEGRAM_MINI_APP_HARNESS_PORT);

if (process.env.TELEGRAM_BOT_TOKEN !== SYNTHETIC_BOT_TOKEN
  || !process.env.SESSION_SECRET
  || process.env.NODE_ENV !== "test"
  || !Number.isInteger(port)
  || port < 1
  || port > 65_535) {
  throw new Error("Invalid isolated Telegram Mini App harness configuration.");
}

function signedInitData(authDate: number) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAEAAAE-synthetic-fixture",
    user: JSON.stringify({
      id: SYNTHETIC_USER_ID,
      first_name: "Synthetic",
      last_name: "Browser Tester",
      username: "synthetic_browser_tester",
      language_code: "en",
    }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(SYNTHETIC_BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

const validInitData = signedInitData(Math.floor(Date.now() / 1000));
const tamperedParams = new URLSearchParams(validInitData);
tamperedParams.set("user", JSON.stringify({
  id: SYNTHETIC_USER_ID + 1,
  first_name: "Synthetic",
  username: "synthetic_browser_tester",
}));
const fixtures: Record<string, { fixtureId: string; initData: string }> = {
  [FIXTURE_IDS.valid]: { fixtureId: FIXTURE_IDS.valid, initData: validInitData },
  [FIXTURE_IDS.tampered]: { fixtureId: FIXTURE_IDS.tampered, initData: tamperedParams.toString() },
  [FIXTURE_IDS.expired]: {
    fixtureId: FIXTURE_IDS.expired,
    initData: signedInitData(Math.floor(Date.now() / 1000) - 16 * 60),
  },
};

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: "8kb" }));
app.use((req, _res, next) => {
  (req as Request & { log?: { info: () => void; warn: () => void } }).log = {
    info: () => undefined,
    warn: () => undefined,
  };
  next();
});

app.get("/__test/telegram-mini-app/control/status", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ready: true, fixtureIds: Object.values(FIXTURE_IDS) });
  } catch {
    res.status(503).json({ ready: false });
  }
});
app.get("/__test/telegram-mini-app/fixtures/:fixtureId", (req, res) => {
  const fixture = fixtures[req.params.fixtureId];
  if (!fixture) {
    res.status(404).json({ error: "Unknown synthetic fixture." });
    return;
  }
  res.json(fixture);
});

app.use("/api", (req, res, next) => {
  const path = req.path.replace(/\/+$/, "") || "/";
  const allowed = (req.method === "POST" && path === "/telegram/mini-app/session")
    || (req.method === "GET" && (
      path === "/telegram/mini-app/orders"
      || /^\/telegram\/mini-app\/orders\/[^/]+$/.test(path)
    ));
  if (!allowed) {
    res.status(404).json({ error: "This isolated harness route is not enabled." });
    return;
  }
  next();
});
app.use("/api", telegramMiniAppRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});
app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

const server = app.listen(port, "127.0.0.1");
server.on("error", () => {
  process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await pool.end().catch(() => undefined);
  });
}

process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });