import assert from 'node:assert/strict';
import test from 'node:test';

const { pricingRuleMatchesSide, visiblePricingSelection } = await import(process.env.PRICING_RULE_FILTER_MODULE);

test('source and target option IDs classify directions, never misleading names', () => {
  const sending = { name: 'You Receive', sourceSettlementOptionId: 'fiat:usd:bank' };
  const receiving = { name: 'You Send', targetSettlementOptionId: 'fiat:eur:sepa' };
  assert.equal(pricingRuleMatchesSide(sending, 'send'), true);
  assert.equal(pricingRuleMatchesSide(sending, 'receive'), false);
  assert.equal(pricingRuleMatchesSide(receiving, 'send'), false);
  assert.equal(pricingRuleMatchesSide(receiving, 'receive'), true);
});

test('asset-wide and legacy route selectors retain their actual side', () => {
  for (const key of ['sourceCryptoAssetId', 'sourceAsset', 'sourceNetwork', 'paymentMethod']) {
    assert.equal(pricingRuleMatchesSide({ [key]: 'configured' }, 'send'), true, key);
    assert.equal(pricingRuleMatchesSide({ [key]: 'configured' }, 'receive'), false, key);
  }
  for (const key of ['targetCryptoAssetId', 'targetAsset', 'targetNetwork', 'payoutMethod']) {
    assert.equal(pricingRuleMatchesSide({ [key]: 'configured' }, 'receive'), true, key);
    assert.equal(pricingRuleMatchesSide({ [key]: 'configured' }, 'send'), false, key);
  }
});

test('concrete two-sided routes appear in both filters; Any to Any only All Rules', () => {
  const both = { sourceSettlementOptionId: 'source', targetSettlementOptionId: 'target' };
  for (const side of ['all', 'send', 'receive']) assert.equal(pricingRuleMatchesSide(both, side), true);
  assert.equal(pricingRuleMatchesSide({}, 'all'), true);
  assert.equal(pricingRuleMatchesSide({}, 'send'), false);
  assert.equal(pricingRuleMatchesSide({}, 'receive'), false);
});

test('blank and wildcard selectors do not imply a concrete side', () => {
  for (const value of [null, undefined, '', ' ', '*', 'Any', '__ANY__', '__ALL_NETWORKS__']) {
    assert.equal(pricingRuleMatchesSide({ sourceNetwork: value }, 'send'), false);
  }
});

test('an immutable receive option suppresses stale send labels on its Any side', () => {
  const rule = { targetSettlementOptionId: 'fiat:eur:sepa', sourceAsset: 'EUR', sourceNetwork: 'SEPA', paymentMethod: 'old-bank' };
  assert.equal(pricingRuleMatchesSide(rule, 'receive'), true);
  assert.equal(pricingRuleMatchesSide(rule, 'send'), false);
});

test('an immutable send option suppresses stale receive labels on its Any side', () => {
  const rule = { sourceSettlementOptionId: 'fiat:eur:old-bank', targetAsset: 'EUR', targetNetwork: 'SEPA', payoutMethod: 'old-bank' };
  assert.equal(pricingRuleMatchesSide(rule, 'send'), true);
  assert.equal(pricingRuleMatchesSide(rule, 'receive'), false);
});

test('explicit opposite asset IDs and legacy all-networks assets remain genuine two-sided rules', () => {
  for (const extra of [{ targetCryptoAssetId: 'usdc' }, { targetAsset: 'USDC', targetNetwork: '__ALL_NETWORKS__' }]) {
    const rule = { sourceSettlementOptionId: 'fiat:eur:old-bank', ...extra };
    assert.equal(pricingRuleMatchesSide(rule, 'send'), true);
    assert.equal(pricingRuleMatchesSide(rule, 'receive'), true);
  }
});

test('action-boundary selection discards filtered-out, removed, and duplicate IDs', () => {
  const catalog = [
    { id: 'send', sourceAsset: 'BTC' },
    { id: 'receive', targetAsset: 'EUR' },
    { id: 'both', sourceAsset: 'USDT', targetAsset: 'EUR' },
  ];
  const matching = catalog.filter(rule => pricingRuleMatchesSide(rule, 'receive'));
  assert.deepEqual(visiblePricingSelection(matching, ['send', 'receive', 'deleted', 'both', 'receive']).map(rule => rule.id),
    ['receive', 'both']);
  assert.deepEqual(visiblePricingSelection([], ['send']), []);
});
