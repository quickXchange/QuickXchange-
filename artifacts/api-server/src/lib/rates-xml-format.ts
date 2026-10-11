import { compareDecimal, decimalParts, decimalText, plainDecimal } from "./bestchange-xml";

export type RatesXmlPart = {
  frommin: string; frommax: string; rate: string; fixedFee: string;
};
export type RatesXmlItem = {
  from: string; to: string; out: string; amount: string;
  minamount: string; maxamount: string; symbol: string;
  param: "manual" | "floating"; fixedFee?: string; steps?: RatesXmlPart[];
};

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Machine decimals only: never use the human-facing three-decimal formatter. */
export function sumXmlDecimals(values: string[]) {
  const parts = values.map(decimalParts);
  const scale = Math.max(0, ...parts.map(p => p.scale));
  return decimalText(parts.reduce((n, p) => n + p.units * 10n ** BigInt(scale - p.scale), 0n), scale);
}
export function divideXmlDecimals(numerator: string, denominator: string) {
  const n = decimalParts(numerator), d = decimalParts(denominator);
  if (d.units <= 0n) throw new Error("XML rate denominator must be positive.");
  return decimalText(n.units * 10n ** BigInt(d.scale + 24) /
    (d.units * 10n ** BigInt(n.scale)), 24);
}
/** Round deductions UP, so a stepped fee cannot over-advertise a payout. */
export function relativeXmlPercentage(base: string, rate: string) {
  const b = decimalParts(base), r = decimalParts(rate);
  const scale = Math.max(b.scale, r.scale);
  const bu = b.units * 10n ** BigInt(scale - b.scale);
  const ru = r.units * 10n ** BigInt(scale - r.scale);
  if (bu <= 0n || ru > bu) throw new Error("Invalid XML fee-step rate.");
  const numerator = (bu - ru) * 100n * 10n ** 24n;
  return decimalText((numerator + bu - 1n) / bu, 24);
}
export function applyXmlParts(item: Omit<RatesXmlItem, "out">, parts: RatesXmlPart[]): RatesXmlItem {
  if (!parts.length) throw new Error("No priced ranges are available.");
  const out = parts.reduce((max, part) => compareDecimal(part.rate, max) > 0 ? part.rate : max, parts[0].rate);
  if (compareDecimal(out, "0") <= 0) throw new Error("No positive XML rate is available.");
  const uniform = parts.every(p => compareDecimal(p.rate, out) === 0 &&
    compareDecimal(p.fixedFee, parts[0].fixedFee) === 0);
  return { ...item, out, ...(uniform ? { fixedFee: parts[0].fixedFee } : { steps: parts }) };
}
export function serializeRatesXml(items: RatesXmlItem[]) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<rates>"];
  const tag = (name: string, value: string, indent = "    ", attribute = "") =>
    lines.push(`${indent}<${name}${attribute}>${escape(value)}</${name}>`);
  for (const item of items) {
    lines.push("  <item>");
    tag("from", item.from); tag("to", item.to); tag("in", "1");
    tag("out", item.out); tag("amount", item.amount);
    tag("minamount", `${item.minamount} ${item.symbol}`);
    tag("maxamount", `${item.maxamount} ${item.symbol}`);
    tag("param", item.param);
    if (item.steps) {
      for (const step of item.steps) {
        lines.push(`    <step frommin="${escape(step.frommin)}" frommax="${escape(step.frommax)}">`);
        tag("tofee", relativeXmlPercentage(item.out, step.rate), "      ", ' type="%"');
        tag("tofee", step.fixedFee, "      ");
        lines.push("    </step>");
      }
    } else if (item.fixedFee && compareDecimal(item.fixedFee, "0") > 0) {
      tag("tofee", plainDecimal(item.fixedFee));
    }
    lines.push("  </item>");
  }
  lines.push("</rates>");
  return lines.join("\n");
}
