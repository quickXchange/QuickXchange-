import assert from 'node:assert/strict';
import test from 'node:test';

const { pricingRuleDirection, pricingRuleHasConfiguredSide, pricingRuleMatchesSide, visiblePricingSelection } = await import(process.env.PRICING_RULE_FILTER_MODULE);

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

test('concrete two-sided routes use one source-led group; Any to Any only All Rules', () => {
  const both = { sourceSettlementOptionId: 'source', targetSettlementOptionId: 'target' };
  assert.equal(pricingRuleMatchesSide(both, 'all'), true);
  assert.equal(pricingRuleMatchesSide(both, 'send'), true);
  assert.equal(pricingRuleMatchesSide(both, 'receive'), false);
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

test('two-sided route display remains intact without adding the rule to both groups', () => {
  for (const extra of [{ targetCryptoAssetId: 'usdc' }, { targetAsset: 'USDC', targetNetwork: '__ALL_NETWORKS__' }]) {
    const rule = { sourceSettlementOptionId: 'fiat:eur:old-bank', ...extra };
    assert.equal(pricingRuleMatchesSide(rule, 'send'), true);
    assert.equal(pricingRuleMatchesSide(rule, 'receive'), false);
    assert.equal(pricingRuleHasConfiguredSide(rule, 'receive'), true);
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
    ['receive']);
  assert.deepEqual(visiblePricingSelection([], ['send']), []);
});

for (const method of ['wise', 'ing', 'sepa-instant']) {
  test(`Any source → EUR → ${method} is receive-only even with a misleading name`, () => {
    const rule = { name: 'EUR to USDT', targetSettlementOptionId: `fiat:eur:${method}`, targetAsset: 'EUR', targetNetwork: 'SEPA' };
    assert.equal(pricingRuleDirection(rule), 'receive');
    assert.equal(pricingRuleMatchesSide(rule, 'send'), false);
  });
}

for (const [method, asset] of [['ing', 'usdt'], ['sepa-instant', 'usdt'], ['commerzbank', 'usdc']]) {
  test(`EUR → ${method} → ${asset} is send-only even with a misleading name`, () => {
    const rule = { name: 'Coin to Eur', sourceSettlementOptionId: `fiat:eur:${method}`, sourceAsset: 'EUR',
      targetCryptoAssetId: asset, sourceNetwork: 'SEPA' };
    assert.equal(pricingRuleDirection(rule), 'send');
    assert.equal(pricingRuleMatchesSide(rule, 'receive'), false);
  });
}

test('crypto source → destination payment method is receive-only, not send', () => {
  const rule = { sourceCryptoAssetId: 'usdt', targetSettlementOptionId: 'fiat:eur:wise' };
  assert.equal(pricingRuleDirection(rule), 'receive');
  assert.equal(pricingRuleHasConfiguredSide(rule, 'send'), true);
});

test('catalog kind, not arbitrary option names or currency strings, determines the payment role', () => {
  const rule = { sourceSettlementOptionId: 'opaque-crypto-option', targetSettlementOptionId: 'opaque-fiat-option' };
  const catalog = [{ id: 'opaque-crypto-option', kind: 'crypto-network' }, { id: 'opaque-fiat-option', kind: 'fiat-payment-method' }];
  assert.equal(pricingRuleDirection(rule, catalog), 'receive');
  assert.equal(pricingRuleMatchesSide(rule, 'send', catalog), false);
});

test('legacy payment/payout field roles outrank the opposite crypto asset selector', () => {
  assert.equal(pricingRuleDirection({ paymentMethod: 'configured-bank-id', targetCryptoAssetId: 'usdt' }), 'send');
  assert.equal(pricingRuleDirection({ sourceCryptoAssetId: 'usdt', payoutMethod: 'configured-bank-id' }), 'receive');
});

test('immutable crypto option identity ignores stale same-side payment labels', () => {
  const rule = { sourceSettlementOptionId: 'crypto:usdt:erc20', paymentMethod: 'obsolete-bank',
    targetSettlementOptionId: 'fiat:eur:wise' };
  assert.equal(pricingRuleDirection(rule), 'receive');
});

test('source and destination asset-wide wildcards are exclusive; unrestricted fallback remains All-only', () => {
  assert.equal(pricingRuleDirection({ sourceCryptoAssetId: 'usdt' }), 'send');
  assert.equal(pricingRuleDirection({ targetCryptoAssetId: 'usdt' }), 'receive');
  assert.equal(pricingRuleDirection({ sourceAsset: 'USDT', sourceNetwork: '__ALL_NETWORKS__' }), 'send');
  assert.equal(pricingRuleDirection({ targetAsset: 'USDT', targetNetwork: '__ALL_NETWORKS__' }), 'receive');
  assert.equal(pricingRuleDirection({}), null);
});
