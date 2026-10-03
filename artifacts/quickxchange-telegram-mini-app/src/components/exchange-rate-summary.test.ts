import { test } from 'node:test';
test('rate presentation rounds decimal strings without changing the authoritative rate', () => {
  const props = { mode: 'swap' as const, sourceAsset: 'BTC', targetAsset: 'ETH', rate: '123.456789' };
  assert.equal(t(props), '1 BTC = 123.457 ETH');
  assert.equal(props.rate, '123.456789');
});
import assert from 'node:assert/strict';
import test from 'node:test';
import { getExchangeRateSummaryText as t } from './exchange-rate-summary';

test('rate text', () => {
  assert.equal(t({ mode: 'swap', sourceAsset: 'BTC', targetAsset: 'ETH', rate: '15.2' }), '1 BTC = 15.2 ETH');
  assert.equal(t({ mode: 'swap', sourceAsset: 'BTC', targetAsset: 'ETH', rate: null }), 'Enter an amount to see your rate');
  assert.equal(t({ mode: 'swap', sourceAsset: null, targetAsset: 'ETH', rate: 2 }), 'Select a route');
  assert.equal(t({ mode: 'convert', sourceAsset: 'BTC', targetAsset: 'ETH', rate: 2, error: true }), 'Rate unavailable');
});
