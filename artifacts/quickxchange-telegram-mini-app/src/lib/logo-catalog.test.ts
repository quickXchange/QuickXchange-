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
  assert.equal(visual.network, 'TRC20');
  assert.equal(visual.badgeVariant, 'network');
});

test('network identity is passed through for shared fallback badges when no logo is configured', () => {
  const visual = resolveOrderVisual([{
    id: 'usdt-ethereum',
    assetCode: 'USDT',
    routeNetwork: 'ERC20',
    kind: 'crypto-network',
    logoUrl: '/objects/usdt.svg',
  }], {
    fromAsset: 'USDT',
    fromNetwork: 'ERC20',
    sourceSettlementOptionId: 'usdt-ethereum',
  }, 'source');

  assert.equal(visual.badgeVariant, 'network');
  assert.equal(visual.network, 'ERC20');
  assert.equal(visual.badgeUrl, undefined);
  assert.equal(visual.logoUrl, '/objects/usdt.svg');
});

test('fiat visuals do not invent a flag when no configured or stored flag exists', () => {
  const visual = resolveOrderVisual([{
    id: 'eur-sepa',
    assetCode: 'EUR',
    routeNetwork: 'SEPA',
    kind: 'fiat-payment-method',
  }], {
    fromAsset: 'EUR',
    fromNetwork: 'SEPA',
    sourceSettlementOptionId: 'eur-sepa',
  }, 'source');

  assert.equal(visual.badgeVariant, 'flag');
  assert.equal(visual.network, 'SEPA');
  assert.equal(visual.badgeUrl, undefined);
});

test('orders without a current catalog row do not invent a network logo for EUR payment methods', () => {
  const visual = resolveOrderVisual([], {
    toAsset: 'EUR',
    toNetwork: 'SEPA',
  }, 'target');
  assert.equal(visual.badgeVariant, 'flag');
  assert.equal(visual.badgeUrl, undefined);
});