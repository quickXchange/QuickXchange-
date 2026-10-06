import { createHash } from "node:crypto";
import type { ManualDeskPricingRule } from "@workspace/db";
import type { UpdateAdminBestchangeBody } from "@workspace/api-zod";
import {
  manualPricingSpecificity, selectManualPricingRule,
  type ManualPricingSettlementOption,
} from "./manual-desk-pricing";
import reference from "../data/bestchange-reference.json";
import { plainDecimal } from "./bestchange-xml";

export type SyncedBestchangeDirection =
  ReturnType<typeof UpdateAdminBestchangeBody.parse>["directions"][number];
type Option = ManualPricingSettlementOption & {
  minAmount?: string; maxAmount?: string; reserve?: string; available?: boolean;
  sendUnavailable?: boolean; receiveUnavailable?: boolean;
};
const officialCodes = new Set(reference.currencyCodes.map(row => row.code));
const decimal = /^[0-9]{1,12}(\.[0-9]{1,12})?$/;

/** Stable per concrete route, independent of pricing rule renames/replacements. */
export function automaticBestchangeDirectionId(source: string, target: string) {
  const hash = createHash("sha256").update(JSON.stringify(["bestchange-manual-route", source, target])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function isAutomaticBestchangeDirection(direction: SyncedBestchangeDirection) {
  return direction.id === automaticBestchangeDirectionId(direction.sourceOptionId, direction.targetOptionId);
}
function limit(values: Array<string | null | undefined>, minimum: boolean) {
  const numbers = values.filter(value => value != null).map(Number);
  if (!numbers.length || numbers.some(value => !Number.isFinite(value))) return "0";
  const value = minimum ? Math.max(...numbers) : Math.min(...numbers);
  const text = plainDecimal(value);
  return value > 0 && value < 1e12 && decimal.test(text) &&
    text.replace(".", "").replace(/^0+/, "").length <= 12 ? text : "0";
}
function unique(values: string[]) {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? distinct[0] : "";
}
export function bestchangeSetupProblems(direction: SyncedBestchangeDirection, target?: Option, source?: Option) {
  const reasons: string[] = [];
  if (source?.available === false || target?.available === false ||
    source?.sendUnavailable || target?.receiveUnavailable) {
    reasons.push("A settlement option is unavailable. Restore its catalog, send/receive availability and operational readiness.");
  }
  if (!officialCodes.has(direction.fromCode)) reasons.push("Choose an official BestChange From code.");
  if (!officialCodes.has(direction.toCode)) reasons.push("Choose an official BestChange To code.");
  if (direction.fromCode && direction.fromCode === direction.toCode) reasons.push("From and To codes must differ.");
  if ([direction.fromCode, direction.toCode].some(code => code.startsWith("CASH")) && !direction.cities.length) {
    reasons.push("Declare the applicable cash cities; they are not inherited from other routes.");
  }
  if (!(Number(direction.minAmount) > 0 && Number(direction.maxAmount) >= Number(direction.minAmount))) {
    reasons.push("Set positive source limits supported by the live Manual Pricing route.");
  }
  if (!(Number(target?.kind === "fiat-payment-method" ? target.reserve : direction.reserve) > 0)) {
    reasons.push(target?.kind === "fiat-payment-method"
      ? "Set a positive destination reserve in Payment Methods."
      : "Declare a positive crypto payout reserve.");
  }
  return reasons;
}
function overlappingCodes(a: SyncedBestchangeDirection, b: SyncedBestchangeDirection) {
  return a.id !== b.id && b.enabled && a.fromCode && a.toCode &&
    a.fromCode === b.fromCode && a.toCode === b.toCode &&
    (!a.cities.length || !b.cities.length || a.cities.some(city => b.cities.includes(city)));
}

/**
 * Read-only projection. Expand Any/asset/all-network rules into concrete public
 * Swap options, not provider Convert routes. No price, reserve or code is invented.
 */
export function syncBestchangeDirections(
  saved: SyncedBestchangeDirection[], options: Option[], rules: ManualDeskPricingRule[],
): SyncedBestchangeDirection[] {
  const activeRules = rules.filter(rule => rule.enabled);
  const discoveryOptions: Option[] = options.map(option => ({ ...option }));
  const knownIds = new Set(options.map(option => option.id));
  // Exact pricing paths remain visible while their bank/network is unavailable.
  // These placeholders are Admin metadata only, never executable capabilities.
  for (const rule of activeRules) for (const side of ["source", "target"] as const) {
    const id = side === "source" ? rule.sourceSettlementOptionId : rule.targetSettlementOptionId;
    if (!id || !/^(fiat|crypto):/.test(id)) continue;
    if (knownIds.has(id)) {
      const option = discoveryOptions.find(option => option.id === id)!;
      if (side === "source" && option.direction === "receive") {
        option.direction = "both"; option.sendUnavailable = true;
      } else if (side === "target" && option.direction === "send") {
        option.direction = "both"; option.receiveUnavailable = true;
      }
      continue;
    }
    knownIds.add(id);
    discoveryOptions.push({
      id, kind: id.startsWith("fiat:") ? "fiat-payment-method" : "crypto-network",
      direction: "both", available: false,
      assetId: side === "source" ? rule.sourceCryptoAssetId : rule.targetCryptoAssetId,
      assetCode: (side === "source" ? rule.sourceAsset : rule.targetAsset) ?? "",
      routeNetwork: (side === "source" ? rule.sourceNetwork : rule.targetNetwork) ?? "",
    });
  }
  const codeDeclarations = new Map<string, string[]>();
  const reserveDeclarations = new Map<string, string[]>();
  for (const direction of saved) {
    for (const [option, code] of [
      [direction.sourceOptionId, direction.fromCode], [direction.targetOptionId, direction.toCode],
    ]) {
      if (!officialCodes.has(code)) continue;
      codeDeclarations.set(option, [...codeDeclarations.get(option) ?? [], code]);
    }
    if (direction.targetOptionId.startsWith("crypto:") && Number(direction.reserve) > 0) {
      reserveDeclarations.set(direction.targetOptionId, [
        ...reserveDeclarations.get(direction.targetOptionId) ?? [], plainDecimal(direction.reserve!),
      ]);
    }
  }
  const byPair = new Map<string, SyncedBestchangeDirection[]>();
  const key = (source: string, target: string) => JSON.stringify([source, target]);
  const result: SyncedBestchangeDirection[] = saved.map(direction => ({
    ...direction, automatic: isAutomaticBestchangeDirection(direction),
  }));
  for (const direction of result) {
    const pair = key(direction.sourceOptionId, direction.targetOptionId);
    byPair.set(pair, [...byPair.get(pair) ?? [], direction]);
  }
  const covered = new Set<string>();
  for (const source of discoveryOptions) {
    if (!["send", "both"].includes(source.direction)) continue;
    for (const target of discoveryOptions) {
      if (!["receive", "both"].includes(target.direction) || source.id === target.id ||
        (source.kind !== "fiat-payment-method" && target.kind !== "fiat-payment-method") ||
        (source.available !== false && target.available !== false &&
          source.assetCode === target.assetCode && source.routeNetwork === target.routeNetwork)) continue;
      const context = {
        sourceAsset: source.assetCode, sourceCryptoAssetId: source.kind === "crypto-network" ? source.assetId : null,
        sourceNetwork: source.routeNetwork, sourceSettlementOptionId: source.id,
        targetAsset: target.assetCode, targetCryptoAssetId: target.kind === "crypto-network" ? target.assetId : null,
        targetNetwork: target.routeNetwork, targetSettlementOptionId: target.id,
      };
      const direct = selectManualPricingRule(activeRules, context);
      const reciprocal = !direct || manualPricingSpecificity(direct) === 0
        ? selectManualPricingRule(activeRules.filter(rule => rule.exactRate !== null), {
          sourceAsset: context.targetAsset, sourceCryptoAssetId: context.targetCryptoAssetId,
          sourceNetwork: context.targetNetwork, sourceSettlementOptionId: target.id,
          targetAsset: context.sourceAsset, targetCryptoAssetId: context.sourceCryptoAssetId,
          targetNetwork: context.sourceNetwork, targetSettlementOptionId: source.id,
        }) : undefined;
      const rule = reciprocal ?? direct;
      if (!rule) continue;
      const pair = key(source.id, target.id);
      covered.add(pair);
      const existing = byPair.get(pair);
      if (existing?.some(direction => !direction.automatic)) continue;
      const old = existing?.[0];
      const direction: SyncedBestchangeDirection = old ?? {
        id: automaticBestchangeDirectionId(source.id, target.id), enabled: true,
        sourceOptionId: source.id, targetOptionId: target.id,
        fromCode: "", toCode: "", reserve: unique(reserveDeclarations.get(target.id) ?? []) || "0",
        minAmount: "0", maxAmount: "0", params: [], cities: [], selectedAddOnKeys: [], includeFeeTags: false,
      };
      direction.automatic = true;
      direction.pricingRuleName = rule.name;
      direction.fromCode ||= unique(codeDeclarations.get(source.id) ?? []);
      direction.toCode ||= unique(codeDeclarations.get(target.id) ?? []);
      if (direction.minAmount === "0") direction.minAmount = limit([
        source.kind === "fiat-payment-method" ? source.minAmount : undefined,
        rule.rangeOnlyPricing ? undefined : rule.minAmount,
        rule.rangeOnlyPricing && rule.amountBasedPricingEnabled && rule.amountBasedPricingTiers.length
          ? String(Math.min(...rule.amountBasedPricingTiers.map(tier => Number(tier.minAmount)))) : undefined,
      ], true);
      if (direction.maxAmount === "0") direction.maxAmount = limit([
        source.kind === "fiat-payment-method" ? source.maxAmount : undefined,
        rule.rangeOnlyPricing ? undefined : rule.maxAmount,
        rule.rangeOnlyPricing && rule.amountBasedPricingEnabled && rule.amountBasedPricingTiers.length &&
          rule.amountBasedPricingTiers.every(tier => tier.maxAmount !== null)
          ? String(Math.max(...rule.amountBasedPricingTiers.map(tier => Number(tier.maxAmount)))) : undefined,
      ], false);
      direction.pendingReasons = bestchangeSetupProblems(direction, target, source);
      if (!old) result.push(direction);
    }
  }
  // Disabled exact pricing paths are still useful Admin entries, but cannot
  // become executable merely because a publication setting is enabled.
  const discoveredPairs = new Set(result.map(direction => key(direction.sourceOptionId, direction.targetOptionId)));
  for (const rule of rules.filter(rule => !rule.enabled)) {
    const source = rule.sourceSettlementOptionId, target = rule.targetSettlementOptionId;
    if (!source || !target || source === target ||
      (!source.startsWith("fiat:") && !target.startsWith("fiat:")) ||
      discoveredPairs.has(key(source, target))) continue;
    discoveredPairs.add(key(source, target));
    result.push({
      id: automaticBestchangeDirectionId(source, target), enabled: true, automatic: true,
      sourceOptionId: source, targetOptionId: target, pricingRuleName: rule.name,
      fromCode: unique(codeDeclarations.get(source) ?? []), toCode: unique(codeDeclarations.get(target) ?? []),
      reserve: "0", minAmount: "0", maxAmount: "0", params: [], cities: [], selectedAddOnKeys: [], includeFeeTags: false,
    });
  }
  // Explicit operator routes take precedence over automatic code collisions.
  const accepted = result.filter(direction => !direction.automatic);
  for (const direction of result.filter(direction => direction.automatic)) {
    if (!covered.has(key(direction.sourceOptionId, direction.targetOptionId))) {
      direction.pendingReasons = ["No currently available Manual Pricing route. Restore its pricing and settlement options."];
    }
    if (accepted.some(other => overlappingCodes(direction, other))) {
      direction.pendingReasons = [...direction.pendingReasons ?? [],
        "Another direction already declares these BestChange codes for an overlapping city."];
    }
    if (direction.enabled && !direction.pendingReasons?.length) accepted.push(direction);
  }
  return result;
}
