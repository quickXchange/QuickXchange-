import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearExchangeRecovery,
  EXCHANGE_RECOVERY_LEGACY_KEY,
  getExchangeRecoverySessionKey,
  isDefinitiveCreateRejection,
  persistExchangeRecovery,
  readExchangeRecovery,
  type ExchangeRecovery,
} from './exchange-recovery';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

const pending: ExchangeRecovery = {
  version: 1,
  phase: 'create-pending',
  mode: 'convert',
  requestId: 'same-request-id',
  data: { quoteId: 'signed-quote', amount: 1.25, destinationAddress: 'wallet' },
  sourceId: 'btc',
  targetId: 'eth',
  amount: '1.25',
  desiredReceiveAmount: '2',
  activeAmountSide: 'receive',
  rateMode: 'FIXED',
  quoteData: { quoteId: 'signed-quote', expiresAt: '2000-01-01T00:00:00.000Z' },
  selectedAddonKeys: [],
  destinationAddress: 'wallet',
  destinationMemo: '',
  customerEmail: 'customer@example.test',
  settlementFields: {},
};

test('exchange create recovery persists the exact request and restores link phase without another create', () => {
  const storage = memoryStorage();
  persistExchangeRecovery(storage, pending, '99');
  assert.deepEqual(readExchangeRecovery(storage, '99'), pending);

  const orderLinkedPending: ExchangeRecovery = {
    ...pending,
    phase: 'link-pending',
    order: { id: 'created-order', trackingToken: 'link-token' },
  };
  persistExchangeRecovery(storage, orderLinkedPending, '99');
  assert.deepEqual(readExchangeRecovery(storage, '99'), orderLinkedPending);
  clearExchangeRecovery(storage, '99');
  assert.equal(storage.getItem(getExchangeRecoverySessionKey('99')), null);
  assert.equal(readExchangeRecovery(storage, '99'), null);
});

test('recovery is partitioned by authenticated server user ID', () => {
  const storage = memoryStorage();
  persistExchangeRecovery(storage, pending, '99');

  assert.equal(readExchangeRecovery(storage, '42'), null);
  assert.deepEqual(readExchangeRecovery(storage, '99'), pending);
  assert.notEqual(getExchangeRecoverySessionKey('99'), getExchangeRecoverySessionKey('42'));
  assert.throws(() => readExchangeRecovery(storage, ''), /verified Telegram user ID/i);
  assert.throws(() => persistExchangeRecovery(storage, pending, '  '), /verified Telegram user ID/i);
});

test('unscoped pending recovery is preserved and fails closed instead of being discarded', () => {
  const storage = memoryStorage();
  const unknownPending = JSON.stringify(pending);
  storage.setItem(EXCHANGE_RECOVERY_LEGACY_KEY, unknownPending);
  assert.throws(() => readExchangeRecovery(storage, '99'), /cannot be safely attributed/i);
  assert.equal(storage.getItem(EXCHANGE_RECOVERY_LEGACY_KEY), unknownPending);
});

test('only definitive create rejections release frozen recovery', () => {
  assert.equal(isDefinitiveCreateRejection({ status: 400 }), true);
  assert.equal(isDefinitiveCreateRejection({ status: 422 }), true);
  assert.equal(isDefinitiveCreateRejection({
    status: 410,
    data: { code: 'QUOTE_EXPIRED', outcomeUnknown: false },
  }), true);
  assert.equal(isDefinitiveCreateRejection({ status: 410, data: { code: 'QUOTE_MISMATCH' } }), false);
  assert.equal(isDefinitiveCreateRejection({ status: 422, outcomeUnknown: true }), false);
  assert.equal(isDefinitiveCreateRejection({ status: 503 }), false);
  assert.equal(isDefinitiveCreateRejection(new Error('network failure')), false);
});

test('malformed recovery never silently becomes an empty order flow', () => {
  const storage = memoryStorage();
  storage.setItem(getExchangeRecoverySessionKey('99'), JSON.stringify({ version: 1, phase: 'link-pending' }));
  assert.throws(() => readExchangeRecovery(storage, '99'), /recovery data is invalid/i);
});