import assert from 'node:assert/strict';
import test from 'node:test';
import {
  convertOrderStatusLabel,
  convertOrderStatusStep,
  isConvertTerminalStatus,
  normalizeConvertOrderStatus,
} from './convert-order-status';

test('Convert status aliases share labels and terminal freshness behavior', () => {
  for (const [alias, label] of [
    ['reversed', 'REFUNDED'],
    ['overdue', 'EXPIRED'],
  ] as const) {
    assert.equal(convertOrderStatusLabel(alias), label);
    assert.equal(isConvertTerminalStatus(alias), true);
  }
  for (const existingLabelAlias of ['complete', 'finished', 'paid']) {
    assert.equal(convertOrderStatusLabel(existingLabelAlias), 'DONE');
    assert.equal(isConvertTerminalStatus(existingLabelAlias), false);
  }
  assert.equal(normalizeConvertOrderStatus('awaiting_funds'), 'awaiting funds');
  assert.equal(convertOrderStatusLabel('awaiting_funds'), 'AWAITING FUNDS');
  assert.equal(convertOrderStatusStep('payment_detected'), 1);
  assert.equal(convertOrderStatusStep('completed'), 3);
});