import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSettlementDetails,
  isConvertDedicatedSettlementField,
  isExchangeFieldRequired,
  isExchangeFieldVisible,
} from './exchange-quote';

test('quote-owned conditional settlement fields follow the controlling value', () => {
  const field = {
    key: 'bank_account',
    requiredWhen: { fieldKey: 'payout_method', equals: ['bank', 'sepa'] },
  };

  assert.equal(isExchangeFieldVisible(field, { payout_method: 'bank' }), true);
  assert.equal(isExchangeFieldVisible(field, { payout_method: 'card' }), false);
  assert.equal(isExchangeFieldRequired(field), true);
  assert.equal(isExchangeFieldRequired({ key: 'optional_note' }), false);
  assert.equal(isExchangeFieldVisible({ ...field, enabled: false }, { payout_method: 'bank' }), false);
});

test('only Quickex canonical destination keys map to dedicated Convert fields', () => {
  const fields = [
    { key: 'destinationAddress', type: 'text' },
    { key: 'destinationMemo', type: 'text' },
    { key: 'payout_wallet', type: 'wallet-address', requiredWhen: { fieldKey: 'payout_method', equals: 'bank' } },
    { key: 'memo', type: 'memo-tag', requiredWhen: { fieldKey: 'payout_method', equals: 'bank' } },
    { key: 'account_number', type: 'integer' },
    { key: 'account_name', type: 'text', requiredWhen: { fieldKey: 'payout_method', equals: 'bank' } },
    { key: 'unused_field', enabled: false },
  ];

  assert.equal(isConvertDedicatedSettlementField(fields[0]), true);
  assert.equal(isConvertDedicatedSettlementField(fields[2]), false);
  assert.equal(isConvertDedicatedSettlementField(fields[3]), false);
  assert.equal(isExchangeFieldRequired(fields[2]), true);
  assert.equal(isExchangeFieldVisible(fields[2], { payout_method: 'bank' }), true);
  assert.equal(isExchangeFieldVisible(fields[3], { payout_method: 'card' }), false);
  const values = {
    destinationAddress: 'destination-wallet',
      destinationMemo: 'tag',
      payout_wallet: 'custom-wallet',
      memo: 'custom-memo',
      account_number: '42',
      account_name: 'Ada',
      payout_method: 'bank',
      unused_field: 'ignored',
    };
  assert.deepEqual(buildSettlementDetails(fields, values), {
    destinationAddress: 'destination-wallet',
    destinationMemo: 'tag',
    payout_wallet: 'custom-wallet',
    memo: 'custom-memo',
    account_number: 42,
    account_name: 'Ada',
  });
});