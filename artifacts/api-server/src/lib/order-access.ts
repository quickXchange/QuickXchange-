import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "./api-error";

const TRACKING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type TrackingCapability = {
  v: 1;
  orderId: string;
  expiresAt: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new ApiError(
      "ORDER_TRACKING_NOT_CONFIGURED",
      "Secure order tracking is not configured.",
      503,
    );
  }
  return value;
}

function signature(encoded: string): string {
  return createHmac("sha256", secret())
    .update(`order-tracking:${encoded}`)
    .digest("base64url");
}

export function signOrderTrackingToken(
  orderId: string,
  now = Date.now(),
): string {
  const capability: TrackingCapability = {
    v: 1,
    orderId,
    expiresAt: now + TRACKING_TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(capability), "utf8")
    .toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyOrderTrackingToken(
  token: string | undefined,
  expectedOrderId: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return false;
  const calculated = signature(encoded);
  const suppliedBuffer = Buffer.from(supplied, "utf8");
  const calculatedBuffer = Buffer.from(calculated, "utf8");
  if (
    suppliedBuffer.length !== calculatedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, calculatedBuffer)
  ) {
    return false;
  }
  try {
    const capability = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<TrackingCapability>;
    return capability.v === 1 &&
      capability.orderId === expectedOrderId &&
      typeof capability.expiresAt === "number" &&
      capability.expiresAt > now;
  } catch {
    return false;
  }
}