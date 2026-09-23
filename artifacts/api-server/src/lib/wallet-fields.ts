export type RefundFieldsInput = {
  refundAddress?: string | null;
  refundMemo?: string | null;
};

/** Canonicalize optional refund details at the API boundary. */
export function normalizeRefundFields(input: RefundFieldsInput): {
  refundAddress?: string;
  refundMemo?: string;
} {
  const refundAddress = typeof input.refundAddress === "string" ? input.refundAddress.trim() : "";
  const refundMemo = typeof input.refundMemo === "string" ? input.refundMemo.trim() : "";
  return {
    refundAddress: refundAddress || undefined,
    refundMemo: refundAddress && refundMemo ? refundMemo : undefined,
  };
}