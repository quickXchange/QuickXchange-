import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTrackingInput } from './tracking-input';

test('tracking accepts current links and legacy token aliases without fetching them', () => {
  assert.deepEqual(parseTrackingInput('https://example.test/track?order=abc&trackingToken=current&token=old'), {
    orderId: 'abc', trackingToken: 'current',
  });
  assert.deepEqual(parseTrackingInput('/track?order=abc&token=legacy'), {
    orderId: 'abc', trackingToken: 'legacy',
  });
  assert.deepEqual(parseTrackingInput('https://example.test/telegram-mini-app/orders/abc?trackingToken=signed'), {
    orderId: 'abc', trackingToken: 'signed',
  });
});

test('plain order IDs never invent tracking capabilities', () => {
  assert.deepEqual(parseTrackingInput(' abc '), { orderId: 'abc', trackingToken: '' });
  assert.deepEqual(parseTrackingInput('https://example.test/'), { orderId: '', trackingToken: '' });
});