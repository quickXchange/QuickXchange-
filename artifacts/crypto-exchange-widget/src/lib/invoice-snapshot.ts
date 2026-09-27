import type { CustomerOrder, ManualPublicOrderStatus, PublicOrderStatus } from '@workspace/api-client-react';

export type InvoiceOrder = CustomerOrder | (PublicOrderStatus & Partial<ManualPublicOrderStatus>);

export type InvoiceSnapshot = {
  id: string;
  exchangeType: 'Swap' | 'Convert';
  fromAsset: string;
  toAsset: string;
  sendAmount: string;
  receiveAmount: string;
  sendNetwork?: string;
  receiveMethod?: string;
  rate?: string;
  createdAt: string;
  completedAt?: string;
  fee?: { amount: string; asset: string };
  receivingFields: Array<{ label: string; value: string }>;
};

const meaningful = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Only fields already projected from this order's saved snapshot are included.
 * In particular, never flatten paymentDetails, settlementDetails or provider data.
 */
export function invoiceSnapshot(order: InvoiceOrder): InvoiceSnapshot {
  const details = order.step2Details ?? [];
  const receivingFields = details.flatMap(({ label, value }) => {
    const safeLabel = meaningful(label);
    const safeValue = meaningful(value);
    return safeLabel && safeValue ? [{ label: safeLabel, value: safeValue }] : [];
  });
  const paymentMethod = meaningful(order.sourcePaymentMethod?.name);
  if (paymentMethod && !receivingFields.some(field =>
    /^(?:payment method|bank)$/i.test(field.label) && field.value === paymentMethod)) {
    receivingFields.unshift({ label: 'Payment Method', value: paymentMethod });
  }

  return {
    id: order.id,
    exchangeType: order.type === 'instant' ? 'Convert' : 'Swap',
    fromAsset: order.fromAsset,
    toAsset: order.toAsset,
    sendAmount: String(order.amount),
    receiveAmount: String(order.receiveAmount),
    sendNetwork: meaningful(order.fromNetwork),
    receiveMethod: meaningful(order.toNetwork),
    rate: meaningful(order.exchangeRate),
    createdAt: order.createdAt,
    completedAt: meaningful(order.completedAt),
    fee: order.receiptFee && /^(?:(?!0(?:\.0+)?$)\d+(?:\.\d+)?)$/.test(order.receiptFee.amount)
      ? { amount: order.receiptFee.amount, asset: order.receiptFee.asset }
      : undefined,
    receivingFields,
  };
}