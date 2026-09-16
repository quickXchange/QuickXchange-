import { ReplitConnectors } from "@replit/connectors-sdk";

export type ContactSupportEmailInput = {
  submissionId: string;
  customerName: string;
  customerEmail: string;
  message: string;
  receivedAt: Date;
};

export class ContactSupportDeliveryError extends Error {
  constructor(
    readonly status: number,
    readonly providerMessage: string,
  ) {
    super(`Resend rejected contact delivery with HTTP ${status}.`);
    this.name = "ContactSupportDeliveryError";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildContactSupportEmail(input: ContactSupportEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const receivedAt = input.receivedAt.toISOString();
  const subject = `Contact request from ${input.customerName}`;
  const text = [
    `Customer Name: ${input.customerName}`,
    `Customer Email: ${input.customerEmail}`,
    `Date/Time: ${receivedAt}`,
    "",
    "Message:",
    input.message,
  ].join("\n");
  const html = [
    "<h2>New contact request</h2>",
    "<dl>",
    `<dt><strong>Customer Name</strong></dt><dd>${escapeHtml(input.customerName)}</dd>`,
    `<dt><strong>Customer Email</strong></dt><dd>${escapeHtml(input.customerEmail)}</dd>`,
    `<dt><strong>Date/Time</strong></dt><dd>${escapeHtml(receivedAt)}</dd>`,
    "</dl>",
    "<h3>Message</h3>",
    `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
  ].join("");
  return { subject, text, html };
}

export async function sendContactSupportEmail(
  input: ContactSupportEmailInput,
): Promise<void> {
  const content = buildContactSupportEmail(input);
  const fromAddress =
    process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL?.trim() ||
    "QuickXchange Website <support@quickxchange.net>";
  const response = await new ReplitConnectors().proxy("resend", "/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `contact-submission-${input.submissionId}`,
    },
    body: {
      from: fromAddress,
      to: ["support@quickxchange.net"],
      reply_to: input.customerEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
    },
  });
  if (!response.ok) {
    const providerMessage = await response.text();
    throw new ContactSupportDeliveryError(response.status, providerMessage);
  }
}