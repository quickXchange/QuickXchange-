import assert from 'node:assert/strict';
import test from 'node:test';
import {
  orderTimelineLineWidthPercent,
  projectSwapOrderTimeline,
  swapOrderStatusTerminal,
} from './swap-order-status';

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