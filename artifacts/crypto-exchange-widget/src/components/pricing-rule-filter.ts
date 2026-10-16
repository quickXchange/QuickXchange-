import type { ManualDeskPricingRule } from '@workspace/api-client-react';

export type PricingRuleSideFilter = 'all' | 'send' | 'receive';
type RouteRule = Pick<ManualDeskPricingRule,
  'sourceSettlementOptionId' | 'targetSettlementOptionId' |
  'sourceCryptoAssetId' | 'targetCryptoAssetId' |
  'sourceAsset' | 'targetAsset' | 'sourceNetwork' | 'targetNetwork' |
  'paymentMethod' | 'payoutMethod'>;

const configured = (value: string | null | undefined) =>
  Boolean(value?.trim() && !['*', 'ANY', '__ANY__', '__ALL_NETWORKS__'].includes(value.trim().toUpperCase()));

/** Directory classification only; never selects or changes executable prices. */
export function pricingRuleMatchesSide(rule: RouteRule, filter: PricingRuleSideFilter): boolean {
  if (filter === 'all') return true;
  const selectors = filter === 'send'
    ? [rule.sourceSettlementOptionId, rule.sourceCryptoAssetId, rule.sourceAsset, rule.sourceNetwork, rule.paymentMethod]
    : [rule.targetSettlementOptionId, rule.targetCryptoAssetId, rule.targetAsset, rule.targetNetwork, rule.payoutMethod];
  return selectors.some(configured);
}

/** Reapply visibility at the action boundary, not only in checkbox state. */
export function visiblePricingSelection<T extends { id: string }>(matching: readonly T[], selected: readonly string[]): T[] {
  const ids = new Set(selected);
  return matching.filter(rule => ids.has(rule.id));
}
