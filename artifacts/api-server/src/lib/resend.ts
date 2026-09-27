import { ReplitConnectors } from "@replit/connectors-sdk";

type ResendRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

const DIRECT_RESEND_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_REASON_LENGTH = 400;

export class ResendRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResendRequestError";
  }
}

function sanitizeProviderText(value: string): string {
  let sanitized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{8,}\b/gi, "[redacted-secret]")
    .replace(/\b(?:api[_ -]?key|secret|token|credential)\s*[:=]\s*[^\s,;]+/gi, "[redacted-credential]")
    .replace(/(["']?(?:api[_-]?key|authorization|password|secret|token)["']?\s*:\s*)("[^"]*"|'[^']*'|[^,}\s]+)/gi, "$1[redacted-credential]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) sanitized = sanitized.replaceAll(apiKey, "[redacted-secret]");
  return sanitized.slice(0, MAX_PROVIDER_REASON_LENGTH);
}

export async function resendResponseError(response: Response): Promise<ResendRequestError> {
  let providerCode = "";
  let providerMessage = "";
  let bodyText = "";

  try {
    bodyText = await response.text();
    if (bodyText) {
      try {
        const parsed: unknown = JSON.parse(bodyText);
        if (parsed && typeof parsed === "object") {
          const root = parsed as Record<string, unknown>;
          const error = root.error && typeof root.error === "object"
            ? root.error as Record<string, unknown>
            : root;
          const errorCode = typeof error.code === "string"
            ? error.code
            : typeof error.name === "string"
              ? error.name
              : "";
          if (errorCode) providerCode = sanitizeProviderText(errorCode);
          if (typeof error.message === "string") providerMessage = sanitizeProviderText(error.message);
          else if (typeof root.error === "string") providerMessage = sanitizeProviderText(root.error);
        }
      } catch {
        // Resend proxies and gateways may return a plain-text error body.
      }
    }
  } catch {
    // Preserve the HTTP failure even if the provider response body is unreadable.
  }

  const detail = providerCode && providerMessage
    ? `${providerCode}: ${providerMessage}`
    : providerCode || providerMessage || sanitizeProviderText(bodyText);
  const reason = sanitizeProviderText(
    `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
  );
  return new ResendRequestError(reason, reason);
}

export async function sendResendRequest(
  path: string,
  init: ResendRequestInit = {},
): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DIRECT_RESEND_TIMEOUT_MS);
    try {
      return await fetch(`https://api.resend.com${path}`, {
        method: init.method,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${apiKey}`,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new ResendRequestError(
          "RESEND_TIMEOUT",
          `Resend request timed out after ${DIRECT_RESEND_TIMEOUT_MS}ms.`,
        );
      }
      throw new ResendRequestError("RESEND_REQUEST_FAILED", "Resend request failed before receiving a response.");
    } finally {
      clearTimeout(timeout);
    }
  }

  return new ReplitConnectors().proxy("resend", path, init);
}