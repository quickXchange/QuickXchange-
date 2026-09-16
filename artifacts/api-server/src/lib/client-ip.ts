import { isIP } from "node:net";
import type { Request } from "express";

function canonicalIp(value: string | undefined): string | undefined {
  const candidate = value?.trim().toLowerCase();
  if (!candidate || isIP(candidate) === 0) return undefined;
  return candidate.startsWith("::ffff:") && isIP(candidate.slice(7)) === 4
    ? candidate.slice(7)
    : isIP(candidate) === 6 ? canonicalIpv6(candidate) : candidate;
}

function canonicalIpv6(value: string): string {
  const [left, right, ...extra] = value.split("::");
  if (extra.length > 0) return value;
  const expand = (part: string): string[] => {
    if (!part) return [];
    const pieces = part.split(":");
    const last = pieces.at(-1);
    if (last?.includes(".")) {
      const octets = last.split(".").map(Number);
      pieces.splice(-1, 1, ((octets[0]! << 8) | octets[1]!).toString(16), ((octets[2]! << 8) | octets[3]!).toString(16));
    }
    return pieces;
  };
  const leftParts = expand(left);
  const rightParts = expand(right);
  const missing = 8 - leftParts.length - rightParts.length;
  const groups = [...leftParts, ...Array(Math.max(0, missing)).fill("0"), ...rightParts]
    .map((part) => Number.parseInt(part, 16).toString(16));
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < groups.length;) {
    if (groups[i] !== "0") {
      i += 1;
      continue;
    }
    let end = i;
    while (end < groups.length && groups[end] === "0") end += 1;
    if (end - i > bestLength) {
      bestStart = i;
      bestLength = end - i;
    }
    i = end;
  }
  if (bestLength < 2) return groups.join(":");
  return `${groups.slice(0, bestStart).join(":")}::${groups.slice(bestStart + bestLength).join(":")}`;
}

/** Uses Express's already trust-proxy-aware req.ip; never parses X-Forwarded-For directly. */
export function getTrustedClientIp(req: Pick<Request, "ip" | "socket">): string {
  return canonicalIp(req.ip) ?? canonicalIp(req.socket.remoteAddress) ?? "unknown";
}

export function trustedProxyHops(): number {
  const configured = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (configured !== undefined) {
    if (!/^\d+$/.test(configured)) throw new Error("TRUSTED_PROXY_HOPS must be a non-negative integer");
    return Number(configured);
  }
  // The production API is reached through the single Replit edge proxy. Local
  // and test requests must not trust caller-supplied forwarding headers.
  return process.env.NODE_ENV === "production" ? 1 : 0;
}