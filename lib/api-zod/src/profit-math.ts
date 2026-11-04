import type { LegacyProfitBasis, ProfitBasis, ProfitTradeBasis } from "./profit-dashboard";

// Revenue-only exact decimal arithmetic. Never uses customer pricing or live FX.
function parts(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("Invalid saved decimal.");
  return { n: BigInt(`${match[1]}${match[2]}${match[3] || ""}`), s: (match[3] || "").length };
}
function decimal(n: bigint, s: number): string {
  const sign = n < 0n ? "-" : "";
  const digits = (n < 0n ? -n : n).toString().padStart(s + 1, "0");
  return s ? `${sign}${digits.slice(0, -s)}.${digits.slice(-s)}`.replace(/\.?0+$/, "") : `${sign}${digits}`;
}
export function sum(...values: string[]): string {
  const parsed = values.map(parts);
  const scale = Math.max(0, ...parsed.map(p => p.s));
  return decimal(parsed.reduce((n, p) => n + p.n * 10n ** BigInt(scale - p.s), 0n), scale);
}
export const negate = (value: string) => value.startsWith("-") ? value.slice(1) : `-${value}`;
export function multiply(a: string, b: string) {
  const x = parts(a), y = parts(b);
  return decimal(x.n * y.n, x.s + y.s);
}
export function divide(a: string, b: string): string | null {
  const x = parts(a), y = parts(b);
  if (y.n === 0n) return null;
  // Display only; profit never uses this rounded quotient.
  return decimal(x.n * 10n ** BigInt(y.s + 18) / (y.n * 10n ** BigInt(x.s)), 18);
}
export const positive = (v: string) => parts(v).n > 0n;
export const negative = (v: string) => parts(v).n < 0n;
export function calculateProfit(amount: string, receiveAmount: string, basis: LegacyProfitBasis) {
  if (!positive(amount) || !positive(receiveAmount) || !positive(basis.sourceUnitValue) || !positive(basis.targetUnitCost)) {
    throw new Error("Executed amounts and verified unit values must be positive.");
  }
  const revenue = multiply(amount, basis.sourceUnitValue);
  const acquisitionCost = multiply(receiveAmount, basis.targetUnitCost);
  const fees = sum(basis.providerFee, basis.networkFee, basis.bankFee, basis.otherFee);
  const grossSpread = sum(revenue, negate(acquisitionCost));
  return { revenue, acquisitionCost, fees, grossSpread, netProfit: sum(grossSpread, negate(fees)) };
}
export function calculateTradeProfit(amount: string, receiveAmount: string, basis: ProfitTradeBasis) {
  const quantity = basis.quantitySide === "source" ? amount : receiveAmount;
  if (![quantity, basis.buyValue, basis.sellValue, basis.buyFx, basis.sellFx].every(positive)) throw new Error("Executed quantity, actual rates and conversions must be positive.");
  const acquisitionCost = multiply(basis.buyMode === "unit" ? multiply(quantity, basis.buyValue) : basis.buyValue, basis.buyFx);
  const revenue = multiply(basis.sellMode === "unit" ? multiply(quantity, basis.sellValue) : basis.sellValue, basis.sellFx);
  // Commission 1 is charged on purchase cost; receiving commission on proceeds.
  // Multiplication by 0.01 remains exact even for sub-satoshi quantities.
  const commission1 = multiply(multiply(acquisitionCost, basis.commission1Percent), "0.01");
  const receivingCommission = multiply(multiply(revenue, basis.receivingCommissionPercent), "0.01");
  const fees = sum(commission1, receivingCommission, basis.additionalFixedFee);
  const grossSpread = sum(revenue, negate(acquisitionCost));
  return { quantity, revenue, acquisitionCost, fees, grossSpread, netProfit: sum(grossSpread, negate(fees)),
    commission1, receivingCommission, additionalFixedFee: basis.additionalFixedFee };
}
export function calculateAccountingProfit(amount: string, receiveAmount: string, basis: ProfitBasis): ReturnType<typeof calculateProfit> | ReturnType<typeof calculateTradeProfit> {
  return "calculation" in basis ? calculateTradeProfit(amount, receiveAmount, basis) : calculateProfit(amount, receiveAmount, basis);
}
