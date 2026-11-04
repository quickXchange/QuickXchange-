import type { ProfitBasis } from "@workspace/api-zod";

// Exact decimal arithmetic, independent of customer pricing and live FX.
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
  // Display rate only. Profit never uses this rounded quotient.
  return decimal(x.n * 10n ** BigInt(y.s + 18) / (y.n * 10n ** BigInt(x.s)), 18);
}
export const positive = (v: string) => parts(v).n > 0n;
export const negative = (v: string) => parts(v).n < 0n;
export function calculateProfit(amount: string, receiveAmount: string, basis: ProfitBasis) {
  if (!positive(amount) || !positive(receiveAmount) || !positive(basis.sourceUnitValue) || !positive(basis.targetUnitCost)) {
    throw new Error("Executed amounts and verified unit values must be positive.");
  }
  const revenue = multiply(amount, basis.sourceUnitValue);
  const acquisitionCost = multiply(receiveAmount, basis.targetUnitCost);
  const fees = sum(basis.providerFee, basis.networkFee, basis.bankFee, basis.otherFee);
  const grossSpread = sum(revenue, negate(acquisitionCost));
  return { revenue, acquisitionCost, fees, grossSpread, netProfit: sum(grossSpread, negate(fees)) };
}
