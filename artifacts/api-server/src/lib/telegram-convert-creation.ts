import { formatDisplayAmount } from "@workspace/amount-format";
import { telegramStatusLabel } from "./telegram-wizard";

export type ConvertDepositSnapshot = {
  amount: string;
  asset: string;
  network: string;
  address: string;
  memo?: string;
  qrData?: string;
};
export type ConvertCreationProgress = {
  convertDeposit?: ConvertDepositSnapshot;
  convertCreationTextDelivered?: boolean;
  convertCreationQrDelivered?: boolean;
};
const html = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const normalizedDecimal = (value: string) => value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export function telegramConvertCreationMessage(orderId: string, status: string, deposit: ConvertDepositSnapshot) {
  // The instruction is an exact payment boundary, not an estimated amount label.
  const rounded = formatDisplayAmount(deposit.amount, { useGrouping: false });
  const amount = normalizedDecimal(rounded) === normalizedDecimal(deposit.amount)
    ? rounded : deposit.amount;
  return [
    "✅ <b>Order created</b>",
    `Order ID: <code>${html(orderId)}</code>`,
    `Status: <b>${html(telegramStatusLabel(status).toUpperCase())}</b>`,
    `Send exactly: <code>${html(amount)}</code> ${html(deposit.asset)}${deposit.network ? ` (${html(deposit.network)})` : ""}`,
    `Deposit address: <code>${html(deposit.address)}</code>`,
    ...(deposit.memo ? [`Memo / tag: <code>${html(deposit.memo)}</code>`] : []),
  ].join("\n");
}

/** Shared by immediate and queued Convert delivery; never creates or quotes an order. */
export async function deliverTelegramConvertCreation(
  orderId: string,
  status: string,
  progress: ConvertCreationProgress,
  transport: {
    loadDeposit: () => Promise<ConvertDepositSnapshot>;
    text: (message: string) => Promise<unknown>;
    qr: (data: string) => Promise<unknown>;
    checkpoint: (progress: ConvertCreationProgress) => Promise<void>;
  },
) {
  if (!progress.convertDeposit) {
    progress.convertDeposit = await transport.loadDeposit();
    await transport.checkpoint(progress);
  }
  const deposit = progress.convertDeposit;
  if (!progress.convertCreationTextDelivered) {
    await transport.text(telegramConvertCreationMessage(orderId, status, deposit));
    progress.convertCreationTextDelivered = true;
    await transport.checkpoint(progress);
  }
  if (!progress.convertCreationQrDelivered) {
    await transport.qr(deposit.qrData || deposit.address);
    progress.convertCreationQrDelivered = true;
    await transport.checkpoint(progress);
  }
}
