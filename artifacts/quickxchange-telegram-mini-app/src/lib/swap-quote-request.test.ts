import assert from 'node:assert/strict';
import test from 'node:test';
import { runSwapQuoteRequest, SwapQuoteTimeoutError } from './swap-quote-request';

test('USDT TRC20 to SEPA Instant EUR consumes the canonical reverse source amount unchanged', async () => {
  const controller = new AbortController();
  const response = { amount: 1183.0364253268915, receiveAmount: 1000, rate: 0.845282510826904 };
  assert.equal(await runSwapQuoteRequest(controller, async signal => {
    assert.equal(signal, controller.signal);
    return response;
  }), response);
  assert.equal(controller.signal.aborted, false);
});

test('a stalled quote settles on timeout even when the transport ignores abort', async () => {
  const controller = new AbortController();
  await assert.rejects(
    runSwapQuoteRequest(controller, () => new Promise(() => {}), 5),
    SwapQuoteTimeoutError,
  );
  assert.equal(controller.signal.aborted, true);
  assert.ok(controller.signal.reason instanceof SwapQuoteTimeoutError);
});

test('superseded quotes settle immediately even when the old transport is still pending', async () => {
  const controller = new AbortController();
  const pending = runSwapQuoteRequest(controller, () => new Promise(() => {}));
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
});

test('a response arriving after the timeout cannot replace its error', async () => {
  const controller = new AbortController();
  let finish!: (quote: number) => void;
  const result = runSwapQuoteRequest(controller, () => new Promise<number>(resolve => {
    finish = resolve;
  }), 5);
  await assert.rejects(result, SwapQuoteTimeoutError);
  finish(1183);
  await assert.rejects(result, SwapQuoteTimeoutError);
});

test('canonical reverse budget errors propagate without an automatic retry', async () => {
  const controller = new AbortController();
  let requests = 0;
  const budgetError = new Error('MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED');
  await assert.rejects(runSwapQuoteRequest(controller, async () => {
    requests++;
    throw budgetError;
  }), error => error === budgetError);
  assert.equal(requests, 1);
  assert.equal(controller.signal.aborted, false);
});

test('already-cancelled quotes never dispatch', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  await assert.rejects(runSwapQuoteRequest(controller, async () => {
    requests++;
    return 1183;
  }), { name: 'AbortError' });
  assert.equal(requests, 0);
});

test('Convert receive quotes preserve the provider source amount and exact receive target', async () => {
  const controller = new AbortController();
  const response = { amount: 0.01186565, receiveAmount: 1000, toNetwork: 'TRC20' };
  const result = await runSwapQuoteRequest(controller, async signal => {
    assert.equal(signal, controller.signal);
    return response;
  });
  assert.equal(result, response);
});

test('superseded Convert work cannot delay a new quote or return a late result', async () => {
  const oldController = new AbortController();
  let deliverOld!: (value: string) => void;
  const oldRequest = runSwapQuoteRequest(oldController, () => new Promise<string>(resolve => {
    deliverOld = resolve;
  }));
  const oldRejected = assert.rejects(oldRequest, { name: 'AbortError' });
  oldController.abort();
  assert.equal(await runSwapQuoteRequest(new AbortController(), async () => 'latest'), 'latest');
  await oldRejected;
  deliverOld('obsolete');
  await assert.rejects(oldRequest, { name: 'AbortError' });
});