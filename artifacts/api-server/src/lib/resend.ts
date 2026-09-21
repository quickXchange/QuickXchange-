import { ReplitConnectors } from "@replit/connectors-sdk";

type ResendRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export async function sendResendRequest(
  path: string,
  init: ResendRequestInit = {},
): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    return fetch(`https://api.resend.com${path}`, {
      method: init.method,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${apiKey}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  return new ReplitConnectors().proxy("resend", path, init);
}