import assert from 'node:assert/strict';
import test from 'node:test';
import { getExchangeRateSummaryText as t } from './exchange-rate-summary';

test('rate text', () => {
  assert.equal(t({ mode: 'swap', sourceAsset: 'BTC', targetAsset: 'ETH', rate: '15.2' }), '1 BTC = 15.2 ETH');
  assert.equal(t({ mode: 'swap', sourceAsset: 'BTC', targetAsset: 'ETH', rate: null }), 'Enter an amount to see your rate');
  assert.equal(t({ mode: 'swap', sourceAsset: null, targetAsset: 'ETH', rate: 2 }), 'Select a route');
  assert.equal(t({ mode: 'convert', sourceAsset: 'BTC', targetAsset: 'ETH', rate: 2, error: true }), 'Rate unavailable');
});
