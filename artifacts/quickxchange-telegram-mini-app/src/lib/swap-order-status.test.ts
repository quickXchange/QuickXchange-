import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSwapOrderStatus,
  orderTimelineLineWidthPercent,
  projectSwapOrderTimeline,
  swapOrderStatusLabel,
  swapOrderStatusTerminal,
  swapOrderStatusCompleted,
  swapOrderStatusFailed,
} from './swap-order-status';
import {
  convertOrderStatusLabel,
  convertOrderStatusStep,
  isConvertTerminalStatus,
} from './convert-order-status';
import { isOrderDepositActionable } from './deposit-actionability';

// These statuses match the existing WhiteBIT finality and blockchain-monitoring
// fixtures: detection is not settlement, and both funded paths enter processing.
const whitebit = { fundingSource: 'whitebit', verifiedFundingTransaction: { transactionHash: 'whitebit-deposit' } };
const blockchain = { fundingSource: 'blockchain_monitoring', verifiedFundingTransaction: { transactionHash: 'chain-deposit' } };

test('WhiteBIT and Blockchain Monitoring share the canonical Swap timeline', () => {
  for (const funding of [whitebit, blockchain]) {
    for (const [status, label, step, lineWidth] of [
      ['awaiting funds', 'AWAITING FUNDS', 1, 0],
      ['payment detected', 'PAYMENT DETECTED', 2, 80 / 3],
      ['confirming', 'CONFIRMING', 2, 80 / 3],
      ['processing', 'PROCESSING', 3, 160 / 3],
      ['funds_confirmed', 'PROCESSING', 3, 160 / 3],
      ['completed', 'DONE', 4, 80],
    ] as const) {
      const timeline = projectSwapOrderTimeline({ ...funding, status });
      assert.deepEqual(timeline, { label, step }, `${funding.fundingSource}: ${status}`);
      // The line length and circle states are both derived from this one step.
      assert.ok(Math.abs(orderTimelineLineWidthPercent(timeline.step) - lineWidth) < 1e-10);
    }
  }
});

test('deposit evidence or a customer paid report never advances Done without completed status', () => {
  for (const funding of [whitebit, blockchain]) {
    for (const status of ['awaiting funds', 'payment detected', 'processing']) {
      const order = { ...funding, customerMarkedPaidAt: '2026-01-01T00:00:00Z', status };
      assert.ok(projectSwapOrderTimeline(order).step < 4);
      assert.equal(swapOrderStatusTerminal(order.status), false);
    }
  }
  assert.equal(projectSwapOrderTimeline({ status: 'completed' }).step, 4);
  assert.equal(swapOrderStatusTerminal('completed'), true);
});

test('a newly polled backend status advances the same timeline projection', () => {
  const initial = { ...whitebit, status: 'awaiting funds', verifiedFundingTransaction: undefined };
  const detected = { status: 'payment detected', verifiedFundingTransaction: whitebit.verifiedFundingTransaction };
  const processing = { status: 'processing', verifiedFundingTransaction: whitebit.verifiedFundingTransaction };
  assert.equal(projectSwapOrderTimeline(initial).step, 1);
  assert.equal(projectSwapOrderTimeline({ ...initial, ...detected }).step, 2);
  assert.equal(projectSwapOrderTimeline({ ...initial, ...processing }).step, 3);
  assert.equal(projectSwapOrderTimeline({ ...initial, ...processing, status: 'completed' }).step, 4);
});

test('terminal aliases are normalized consistently and never look active', () => {
  for (const [alias, label] of [
    ['reversed', 'REFUNDED'],
    ['overdue', 'EXPIRED'],
  ] as const) {
    assert.equal(swapOrderStatusLabel(alias), label);
    assert.equal(swapOrderStatusTerminal(alias), true);
  }
  assert.equal(normalizeSwapOrderStatus('funds_confirmed'), 'funds confirmed');
  for (const unsupportedSuccessAlias of ['complete', 'finished', 'paid']) {
    assert.notEqual(swapOrderStatusLabel(unsupportedSuccessAlias), 'DONE');
    assert.equal(swapOrderStatusCompleted(unsupportedSuccessAlias), false);
    assert.equal(swapOrderStatusTerminal(unsupportedSuccessAlias), false);
  }
  assert.equal(swapOrderStatusFailed('reversed'), true);
});

test('Convert terminal aliases and progression match website labels without implying payment proof', () => {
  for (const [alias, label] of [
    ['reversed', 'REFUNDED'],
    ['overdue', 'EXPIRED'],
  ] as const) {
    assert.equal(convertOrderStatusLabel(alias), label);
    assert.equal(isConvertTerminalStatus(alias), true);
  }
  assert.equal(convertOrderStatusStep('awaiting_funds'), 0);
  assert.equal(convertOrderStatusStep('payment_detected'), 1);
  assert.equal(convertOrderStatusStep('processing'), 2);
  assert.equal(convertOrderStatusStep('completed'), 3);
  for (const unconfirmedAlias of ['paid', 'complete', 'finished']) {
    assert.notEqual(convertOrderStatusLabel(unconfirmedAlias), 'DONE');
    assert.equal(isConvertTerminalStatus(unconfirmedAlias), false);
    assert.ok(convertOrderStatusStep(unconfirmedAlias) < 3);
  }
});

test('deposit details are actionable only while awaiting funds with complete, unclaimed instructions', () => {
  for (const status of ['awaiting funds', 'pending']) {
    assert.equal(isOrderDepositActionable(status, true), true, status);
    assert.equal(isOrderDepositActionable(status, false), false, `${status}: missing details`);
    assert.equal(isOrderDepositActionable(status, true, 'customer-reported'), false, `${status}: reported paid`);
    assert.equal(isOrderDepositActionable(status, true, undefined, true), false, `${status}: uncertain`);
  }
  for (const fundedOrStopped of [
    'payment detected', 'confirming', 'processing', 'completed', 'failed', 'cancelled',
    'refunded', 'expired', 'held', 'verification required',
  ]) {
    assert.equal(isOrderDepositActionable(fundedOrStopped, true), false, fundedOrStopped);
  }
});