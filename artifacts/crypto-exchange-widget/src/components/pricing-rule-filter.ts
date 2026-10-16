import type { ManualDeskPricingRule, SettlementOption } from '@workspace/api-client-react';

export type PricingRuleSideFilter = 'all' | 'send' | 'receive';
type RouteRule = Pick<ManualDeskPricingRule,
  'sourceSettlementOptionId' | 'targetSettlementOptionId' |
  'sourceCryptoAssetId' | 'targetCryptoAssetId' |
  'sourceAsset' | 'targetAsset' | 'sourceNetwork' | 'targetNetwork' |
  'paymentMethod' | 'payoutMethod'>;

const configured = (value: string | null | undefined) =>
  Boolean(value?.trim() && !['*', 'ANY', '__ANY__', '__ALL_NETWORKS__'].includes(value.trim().toUpperCase()));

/** Actual route geometry, separate from the exclusive directory grouping. */
export function pricingRuleHasConfiguredSide(rule: RouteRule, filter: Exclude<PricingRuleSideFilter, 'all'>): boolean {
  const option = filter === 'send' ? rule.sourceSettlementOptionId : rule.targetSettlementOptionId;
  const assetId = filter === 'send' ? rule.sourceCryptoAssetId : rule.targetCryptoAssetId;
  if (configured(option) || configured(assetId)) return true;
  const asset = filter === 'send' ? rule.sourceAsset : rule.targetAsset;
  const network = filter === 'send' ? rule.sourceNetwork : rule.targetNetwork;
  // Match the existing resolver's immutable-option authority: an absent ID on
  // the opposite side is Any, even if an old write retained legacy labels there.
  if (configured(rule.sourceSettlementOptionId) || configured(rule.targetSettlementOptionId)) {
    return configured(asset) && network?.trim().toUpperCase() === '__ALL_NETWORKS__';
  }
  const selectors = filter === 'send'
    ? [rule.sourceSettlementOptionId, rule.sourceCryptoAssetId, rule.sourceAsset, rule.sourceNetwork, rule.paymentMethod]
    : [rule.targetSettlementOptionId, rule.targetCryptoAssetId, rule.targetAsset, rule.targetNetwork, rule.payoutMethod];
  return selectors.some(configured);
}

type OptionIdentity = Pick<SettlementOption, 'id' | 'kind'>;

function hasPaymentMethodSide(rule: RouteRule, side: 'send' | 'receive', options: readonly OptionIdentity[]): boolean {
  if (!pricingRuleHasConfiguredSide(rule, side)) return false;
  const optionId = side === 'send' ? rule.sourceSettlementOptionId : rule.targetSettlementOptionId;
  if (configured(optionId)) {
    const option = options.find(candidate => candidate.id.toUpperCase() === optionId!.trim().toUpperCase());
    // The immutable ID namespace also identifies retired/orphaned fiat options.
    // Never infer a role from a currency symbol, bank name or display label.
    return option ? option.kind === 'fiat-payment-method' : /^fiat:/i.test(optionId!.trim());
  }
  const cryptoAssetId = side === 'send' ? rule.sourceCryptoAssetId : rule.targetCryptoAssetId;
  if (configured(cryptoAssetId)) return false;
  return configured(side === 'send' ? rule.paymentMethod : rule.payoutMethod);
}

/**
 * Payment-method ownership determines the directory direction. A receive-side
 * crypto asset is the destination of a send rule, not a second receive rule.
 * Fully specified routes with methods on both sides use their explicit source.
 * Other asset-only routes likewise use source first; unrestricted Any → Any
 * stays in All Rules. This grouping never changes executable pricing.
 */
export function pricingRuleDirection(rule: RouteRule, options: readonly OptionIdentity[] = []): 'send' | 'receive' | null {
  if (hasPaymentMethodSide(rule, 'send', options)) return 'send';
  if (hasPaymentMethodSide(rule, 'receive', options)) return 'receive';
  if (pricingRuleHasConfiguredSide(rule, 'send')) return 'send';
  if (pricingRuleHasConfiguredSide(rule, 'receive')) return 'receive';
  return null;
}

export function pricingRuleMatchesSide(rule: RouteRule, filter: PricingRuleSideFilter, options: readonly OptionIdentity[] = []): boolean {
  return filter === 'all' || pricingRuleDirection(rule, options) === filter;
}

/** Reapply visibility at the action boundary, not only in checkbox state. */
export function visiblePricingSelection<T extends { id: string }>(matching: readonly T[], selected: readonly string[]): T[] {
  const ids = new Set(selected);
  return matching.filter(rule => ids.has(rule.id));
}
