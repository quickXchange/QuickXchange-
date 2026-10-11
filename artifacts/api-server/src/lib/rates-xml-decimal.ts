/** Exact, nonnegative machine decimals; independent of display rounding. */
export function decimalParts(value: string) {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) throw new Error("Invalid XML decimal.");
  let scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
  let units = BigInt(match[1] + (match[2] ?? ""));
  if (Math.abs(scale) > 100) throw new Error("Unsupported XML decimal precision.");
  if (scale < 0) { units *= 10n ** BigInt(-scale); scale = 0; }
  return { units, scale };
}
export function decimalText(units: bigint, scale: number) {
  if (units < 0n) throw new Error("XML amounts cannot be negative.");
  const digits = units.toString().padStart(scale + 1, "0");
  const text = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}
export function plainDecimal(value: string | number) {
  const { units, scale } = decimalParts(String(value));
  return decimalText(units, scale);
}
export function compareDecimal(left: string, right: string) {
  const a = decimalParts(left), b = decimalParts(right);
  const x = a.units * 10n ** BigInt(b.scale), y = b.units * 10n ** BigInt(a.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}
