import assert from 'node:assert/strict';
import test from 'node:test';
import { createClientRequestId } from './client-request-id';

test('uses native secure UUIDs when supported', () => {
  assert.equal(createClientRequestId({ randomUUID: () => 'native-id' } as Crypto), 'native-id');
});

test('uses secure random bytes in Telegram WebViews without randomUUID', () => {
  let seed = 0;
  const cryptoApi = { getRandomValues: (bytes: Uint8Array) => bytes.map(() => ++seed) };
  const id = createClientRequestId(cryptoApi as unknown as Crypto);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('does not silently generate unsafe order identities', () => {
  assert.throws(() => createClientRequestId({} as Crypto), /Secure random ID generation/);
});