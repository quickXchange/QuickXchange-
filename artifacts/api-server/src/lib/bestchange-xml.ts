import { selectManualPricingTier, type ManualPricingTier } from "./manual-desk-pricing";

export type BestchangeItem = {
  from: string; to: string; in: string; out: string; amount: string;
  minamount: string; maxamount: string; fromfee?: string; tofee?: string;
  floating?: string; delay?: string; param: string; city?: string;
  /** Publication metadata only; never added to a customer quote. */
  sourceAssetCode?: string;
  pricingRanges?: Array<{ frommin: string; frommax: string }>;
};
export class BestchangeExportError extends Error {}

export function decimalParts(text: string) {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new BestchangeExportError("Invalid decimal amount.");
  let scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
  let units = BigInt(match[1] + (match[2] ?? ""));
  if (Math.abs(scale) > 100) throw new BestchangeExportError("Amount precision is unsupported.");
  if (scale < 0) { units *= 10n ** BigInt(-scale); scale = 0; }
  return { units, scale };
}
export function decimalText(units: bigint, scale: number) {
  if (units < 0n) throw new BestchangeExportError("Negative amounts cannot be exported.");
  const digits = units.toString().padStart(scale + 1, "0");
  const value = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}
export function plainDecimal(value: string | number) {
  const { units, scale } = decimalParts(String(value));
  return decimalText(units, scale);
}
export function compareDecimal(a: string, b: string) {
  const x = decimalParts(a), y = decimalParts(b);
  const left = x.units * 10n ** BigInt(y.scale), right = y.units * 10n ** BigInt(x.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function smallerDecimal(a: string, b: string) { return compareDecimal(a, b) <= 0 ? a : b; }

/**
 * Partition at every actual tier edge, including its first contract-representable
 * amount on the right. In range-only pricing, a gap fails the entire direction.
 */
export function pricingSamples(min: number, max: number, tiers: ManualPricingTier[], rangeOnly: boolean) {
  const edges = new Set([min, max]);
  for (const tier of tiers) for (const value of [tier.minAmount, tier.maxAmount]) {
    if (value !== null && Number(value) > min && Number(value) < max) edges.add(Number(value));
  }
  const boundaries = [...edges].sort((a, b) => a - b);
  const samples = new Set(boundaries);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const left = boundaries[i], right = boundaries[i + 1];
    const middle = Number(((left + right) / 2).toPrecision(12));
    if (rangeOnly && !selectManualPricingTier(tiers, middle)) {
      throw new BestchangeExportError("This source interval contains a gap in Swap range pricing. Narrow its XML limits.");
    }
    const step = 10 ** (Math.floor(Math.log10(left)) - 11);
    const next = Number((left + step).toPrecision(12));
    if (next > left && next < right) samples.add(next);
  }
  if (rangeOnly && boundaries.some(value => !selectManualPricingTier(tiers, value))) {
    throw new BestchangeExportError("An XML limit is outside the enabled Swap pricing ranges.");
  }
  if (samples.size > 100) throw new BestchangeExportError("Too many pricing ranges for one standard-format direction.");
  return [...samples].sort((a, b) => a - b);
}

/**
 * Classic XML has only one ratio. Use the least favorable full-fee quote across
 * its piecewise pricing, with a quantization safety allowance. Within each
 * piece, nonnegative fixed fees make receive/send nondecreasing before rounding.
 * The allowance bounds gross, percentage and selected-addon rounding, so a
 * rounding plateau cannot advertise a better payout than the executable quote.
 */
export function conservativePrice(
  quotes: Array<{ amount: number; receive: string }>, precision: number, addonCount: number,
) {
  if (!quotes.length || !Number.isInteger(precision) || precision < 0 || precision > 8) {
    throw new BestchangeExportError("The live rate cannot be exported.");
  }
  let chosen: { input: string; output: string } | undefined;
  for (const quote of quotes) {
    const received = decimalParts(quote.receive);
    const atom = 10n ** BigInt(precision);
    const quantized = received.units * atom / (10n ** BigInt(received.scale));
    const conservative = quantized - BigInt(4 + addonCount);
    if (conservative <= 0n) {
      throw new BestchangeExportError("The minimum payout is too small to export safely. Increase the XML minimum.");
    }
    const candidate = { input: plainDecimal(quote.amount), output: decimalText(conservative, precision) };
    if (!chosen || compareRatios(candidate, chosen) < 0) chosen = candidate;
  }
  return chosen!;
}
function compareRatios(a: { input: string; output: string }, b: { input: string; output: string }) {
  const ao = decimalParts(a.output), ai = decimalParts(a.input);
  const bo = decimalParts(b.output), bi = decimalParts(b.input);
  const left = ao.units * bi.units * 10n ** BigInt(bo.scale + ai.scale);
  const right = bo.units * ai.units * 10n ** BigInt(ao.scale + bi.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export function serializeBestchangeXml(items: BestchangeItem[], format: "classic" | "reference" = "classic") {
  const lines = [format === "reference" ? '<?xml version="1.0"?>' : '<?xml version="1.0" encoding="UTF-8"?>', "<rates>"];
  const tags = ["from", "to", "in", "out", "amount", "minamount", "maxamount",
    "fromfee", "tofee", "floating", "delay", "param", "city"] as const;
  for (const item of items) {
    lines.push("  <item>");
    if (format === "classic") {
      for (const tag of tags) if (item[tag] !== undefined) lines.push(`    <${tag}>${escapeXml(item[tag]!)}</${tag}>`);
    } else {
      if (!item.sourceAssetCode) throw new BestchangeExportError("The source currency symbol is required for rates XML limits.");
      // Format the already-computed ratio, never ask a provider for a new rate.
      // Downward decimal division cannot advertise more than the cached ratio.
      const source = decimalParts(item.in), target = decimalParts(item.out);
      if (source.units === 0n) throw new BestchangeExportError("The XML rate input must be positive.");
      const units = target.units * 10n ** BigInt(source.scale + 24) /
        (source.units * 10n ** BigInt(target.scale));
      if (units === 0n) throw new BestchangeExportError("The unit XML rate is too small to represent safely.");
      const values = {
        ...item, in: "1", out: decimalText(units, 24),
        minamount: `${item.minamount} ${item.sourceAssetCode}`,
        maxamount: `${item.maxamount} ${item.sourceAssetCode}`,
      };
      for (const tag of ["from", "to", "in", "out", "amount", "minamount", "maxamount", "param"] as const) {
        lines.push(`    <${tag}>${escapeXml(values[tag])}</${tag}>`);
      }
      // The base rate is full-fee and conservative across the whole interval.
      // These existing Admin ranges describe boundaries, not additional charges.
      if (item.pricingRanges?.length) {
        for (const range of item.pricingRanges) {
          lines.push(`    <step frommin="${escapeXml(range.frommin)}" frommax="${escapeXml(range.frommax)}">`,
            '      <fromfee type="%">0</fromfee>', "      <fromfee>0</fromfee>", "    </step>");
        }
        lines.push(`    <frommin>${escapeXml(item.minamount)}</frommin>`,
          `    <frommax>${escapeXml(item.maxamount)}</frommax>`);
      }
      // Retain explicitly configured standard extensions for cash/other routes.
      for (const tag of ["floating", "delay", "city"] as const) {
        if (item[tag] !== undefined) lines.push(`    <${tag}>${escapeXml(item[tag]!)}</${tag}>`);
      }
    }
    lines.push("  </item>");
  }
  lines.push("</rates>", "");
  return lines.join("\n");
}