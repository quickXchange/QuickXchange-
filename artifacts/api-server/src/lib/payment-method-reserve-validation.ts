import { ApiError } from "./api-error";

export function normalizePaymentMethodReserve(value: string, precision: number): string {
  if (!/^\d{1,20}(?:\.\d{1,18})?$/.test(value)) {
    throw new ApiError("INVALID_PAYMENT_METHOD_RESERVE", "Reserve must be a nonnegative decimal amount.", 400);
  }
  const [whole, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > precision) {
    throw new ApiError("INVALID_PAYMENT_METHOD_RESERVE", `Reserve supports at most ${precision} decimal places in this currency.`, 400);
  }
  return `${whole.replace(/^0+(?=\d)/, "")}${fraction ? `.${fraction}` : ""}`;
}