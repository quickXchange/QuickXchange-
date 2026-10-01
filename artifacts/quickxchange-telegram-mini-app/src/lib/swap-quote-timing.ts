export type SwapQuoteTimingRecord = {
  traceId: string;
  trigger: 'input' | 'configuration';
  outcome: 'pending' | 'rendered' | 'error' | 'aborted';
  debounceMs?: number;
  inputToRequestMs?: number;
  apiResponseMs?: number;
  responseToStateMs?: number;
  stateToRenderMs?: number;
  totalMs?: number;
};

declare global {
  interface Window {
    __quickxSwapQuoteTimings?: SwapQuoteTimingRecord[];
  }
}

let sequence = 0;
const rounded = (value: number) => Math.round(value * 100) / 100;

/** Development only: no amounts, session headers, signed quotes, or identities. */
export function createSwapQuoteTiming(inputAt?: number) {
  if (!import.meta.env?.DEV) return null;
  const scheduledAt = performance.now();
  const startedAt = inputAt ?? scheduledAt;
  const record: SwapQuoteTimingRecord = {
    traceId: `mini-quote-${Date.now().toString(36)}-${++sequence}`,
    trigger: inputAt === undefined ? 'configuration' : 'input',
    outcome: 'pending',
  };
  const records = window.__quickxSwapQuoteTimings ??= [];
  records.push(record);
  if (records.length > 50) records.shift();
  let dispatchedAt: number | undefined;
  let receivedAt: number | undefined;
  let stateAt: number | undefined;
  const finish = (outcome: Exclude<SwapQuoteTimingRecord['outcome'], 'pending'>) => {
    if (record.outcome !== 'pending') return;
    record.outcome = outcome;
    record.totalMs = rounded(performance.now() - startedAt);
    console.debug('[Swap quote timing]', JSON.stringify(record));
  };
  return {
    traceId: record.traceId,
    requestStarted() {
      dispatchedAt = performance.now();
      record.debounceMs = rounded(dispatchedAt - scheduledAt);
      record.inputToRequestMs = rounded(dispatchedAt - startedAt);
    },
    responseReceived() {
      receivedAt = performance.now();
      if (dispatchedAt !== undefined) record.apiResponseMs = rounded(receivedAt - dispatchedAt);
    },
    stateQueued() {
      stateAt = performance.now();
      if (receivedAt !== undefined) record.responseToStateMs = rounded(stateAt - receivedAt);
    },
    rendered() {
      if (stateAt !== undefined) record.stateToRenderMs = rounded(performance.now() - stateAt);
      finish('rendered');
    },
    finish,
  };
}

export type SwapQuoteTiming = NonNullable<ReturnType<typeof createSwapQuoteTiming>>;