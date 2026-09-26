import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOrderVisual } from './logo-catalog';

test('Admin settlement logo stays canonical ahead of order and payment snapshots', () => {
  const visual = resolveOrderVisual([{
    id: 'bank-eur',
    assetCode: 'EUR',
    routeNetwork: 'SEPA',
    kind: 'fiat-payment-method',
    paymentMethodId: 'sepa',
    logoUrl: '/objects/admin-bank-logo.svg',
    flagUrl: '/objects/eu-flag.svg',
    title: 'SEPA Instant',
  }], {
    fromAsset: 'EUR',
    fromNetwork: 'SEPA',
    sourceSettlementOptionId: 'bank-eur',
    logos: { from: '/objects/order-logo.svg', fromFlag: '/objects/order-flag.svg' },
    sourcePaymentMethod: { name: 'SEPA Instant', logoUrl: '/objects/payment-logo.svg' },
  }, 'source');

  assert.equal(visual.logoUrl, '/objects/admin-bank-logo.svg');
  assert.deepEqual(visual.fallbackSrcs?.slice(0, 2), [
    '/objects/payment-logo.svg',
    '/objects/order-logo.svg',
  ]);
  assert.equal(visual.badgeUrl, '/objects/eu-flag.svg');
  assert.equal(visual.variant, 'payment');
});

test('order logo is retained as primary if no canonical catalog logo exists', () => {
  const visual = resolveOrderVisual([{
    id: 'btc-tron',
    assetCode: 'BTC',
    routeNetwork: 'TRC20',
    kind: 'crypto-network',
    networkLogoUrl: '/objects/tron.svg',
    title: 'Bitcoin on Tron',
  }], {
    fromAsset: 'BTC',
    fromNetwork: 'TRC20',
    sourceSettlementOptionId: 'btc-tron',
    logos: { from: '/objects/order-btc.svg', fromNetwork: '/objects/order-tron.svg' },
  }, 'source');

  assert.equal(visual.logoUrl, '/objects/order-btc.svg');
  assert.equal(visual.fallbackSrcs?.includes('/objects/order-btc.svg'), false);
  assert.equal(visual.badgeUrl, '/objects/tron.svg');
});