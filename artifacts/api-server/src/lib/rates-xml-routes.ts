import type { manualDeskPricingRulesTable } from "@workspace/db";
import { selectManualPricingRule, manualPricingSpecificity } from "./manual-desk-pricing";

type Option = {
  id: string; kind: string; assetCode: string; assetId?: string;
  routeNetwork: string; direction: string;
};
type Rule = typeof manualDeskPricingRulesTable.$inferSelect;

/** Discover current site routes with the canonical matcher, not an XML direction catalog. */
export function discoverXmlSwapRoutes(options: Option[], rules: Rule[]) {
  const active = rules.filter(rule => rule.enabled);
  const routes: Array<{ id: string; sourceOptionId: string; targetOptionId: string }> = [];
  for (const source of options) {
    if (!["send", "both"].includes(source.direction)) continue;
    for (const target of options) {
      if (source.id === target.id || !["receive", "both"].includes(target.direction) ||
          (source.kind !== "fiat-payment-method" && target.kind !== "fiat-payment-method") ||
          (source.assetCode === target.assetCode && source.routeNetwork === target.routeNetwork)) continue;
      const context = {
        sourceAsset: source.assetCode, sourceCryptoAssetId: source.kind === "crypto-network" ? source.assetId ?? null : null,
        sourceNetwork: source.routeNetwork, sourceSettlementOptionId: source.id,
        targetAsset: target.assetCode, targetCryptoAssetId: target.kind === "crypto-network" ? target.assetId ?? null : null,
        targetNetwork: target.routeNetwork, targetSettlementOptionId: target.id,
      };
      const direct = selectManualPricingRule(active, context);
      const reciprocal = !direct || manualPricingSpecificity(direct) === 0
        ? selectManualPricingRule(active.filter(rule => rule.exactRate !== null), {
          sourceAsset: context.targetAsset, sourceCryptoAssetId: context.targetCryptoAssetId,
          sourceNetwork: context.targetNetwork, sourceSettlementOptionId: target.id,
          targetAsset: context.sourceAsset, targetCryptoAssetId: context.sourceCryptoAssetId,
          targetNetwork: context.sourceNetwork, targetSettlementOptionId: source.id,
        }) : undefined;
      if (!direct && !reciprocal) continue;
      routes.push({ id: `swap:${source.id}:${target.id}`, sourceOptionId: source.id, targetOptionId: target.id });
    }
  }
  return routes;
}
