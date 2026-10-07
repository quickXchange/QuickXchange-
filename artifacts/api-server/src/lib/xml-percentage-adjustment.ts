import type { UpdateAdminBestchangeBody } from "@workspace/api-zod";
import { decimalParts, decimalText } from "./bestchange-xml";

type XmlPercentageAdjustment = NonNullable<ReturnType<typeof UpdateAdminBestchangeBody.parse>["xmlPercentageAdjustment"]>;

/**
 * Publication-only settings shared by XML consumers, independent of provider
 * quotes and platform-specific direction mappings. Legacy settings stay OFF.
 */
export const DEFAULT_XML_PERCENTAGE_ADJUSTMENT: XmlPercentageAdjustment = {
  enabled: false, activeOrderPercent: "0", noActiveOrderPercent: "0",
};

export function selectedXmlPercentage(settings: XmlPercentageAdjustment, hasActiveConvertOrders: boolean) {
  return settings.enabled
    ? (hasActiveConvertOrders ? settings.activeOrderPercent : settings.noActiveOrderPercent)
    : "0";
}

/** Exact decimal multiplication. Never round or mutate a pricing/quote object. */
export function adjustXmlOutput(
  baseValue: string, settings: XmlPercentageAdjustment, hasActiveConvertOrders: boolean,
): string {
  if (!settings.enabled) return baseValue;
  const percentage = decimalParts(selectedXmlPercentage(settings, hasActiveConvertOrders));
  if (percentage.units === 0n) return baseValue;
  const base = decimalParts(baseValue);
  const denominator = 100n * 10n ** BigInt(percentage.scale);
  return decimalText(base.units * (denominator + percentage.units), base.scale + percentage.scale + 2);
}
