import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionAwareQueryClient } from './session-expiry';
import {
  createIdempotentSessionExpiry,
  clearTelegramSession,
  handleSessionError,
  registerSessionExpiryHandler,
} from './session-expiry';

test('401 session expiry clears the session through the registered handler', () => {
  let expired = 0;
  const storage = new Map<string, string>([['tg_session_token', 'expired-token']]);
  const unregister = registerSessionExpiryHandler(() => {
    expired += 1;
    clearTelegramSession({ removeItem: (key) => storage.delete(key) });
  });
  try {
     handleSessionError({ response: { status: 401 }, body: { message: 'expired' } });
    assert.equal(expired, 1);
    assert.equal(storage.has('tg_session_token'), false);
  } finally {
    unregister();
  }
});

test('multiple owners survive replacement and only their own unregister removes them', () => {
  const calls: string[] = [];
  const unregisterFirst = registerSessionExpiryHandler(() => calls.push('first'));
  const unregisterSecond = registerSessionExpiryHandler(() => calls.push('second'));
  try {
    unregisterFirst();
    handleSessionError({ status: 401 });
    assert.deepEqual(calls, ['second']);
  } finally {
    unregisterFirst();
    unregisterSecond();
  }
});

test('a real query 401 clears and cancels the protected query cache', async () => {
  const queryClient = createSessionAwareQueryClient({ defaultOptions: { queries: { retry: false } } });
  const pending = queryClient.fetchQuery({
    queryKey: ['protected-pending'],
    queryFn: ({ signal }) => new Promise<string>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }),
  }).catch(() => undefined);
  queryClient.setQueryData(['protected'], { account: 'stale' });
  let expired = 0;
  const unregister = registerSessionExpiryHandler(() => { expired += 1; });
  try {
    await assert.rejects(
      queryClient.fetchQuery({
        queryKey: ['unauthorized'],
        queryFn: async () => { throw { response: { status: 401 } }; },
      }),
    );
    assert.equal(expired, 1);
    assert.equal(queryClient.getQueryData(['protected']), undefined);
    assert.equal(queryClient.getQueryState(['protected-pending']), undefined);
  } finally {
    unregister();
    queryClient.cancelQueries();
    queryClient.clear();
    await pending;
  }
});

test('a real mutation 401 expires the session and clears its cache', async () => {
  const queryClient = createSessionAwareQueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData(['protected'], { account: 'stale' });
  let expired = 0;
  const unregister = registerSessionExpiryHandler(() => { expired += 1; });
  try {
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => { throw { status: 401 }; },
    });
    await assert.rejects(mutation.execute(undefined));
    assert.equal(expired, 1);
    assert.equal(queryClient.getQueryData(['protected']), undefined);
  } finally {
    unregister();
    queryClient.clear();
  }
});

test('non-401 errors do not expire the session', () => {
  let expired = 0;
  const unregister = registerSessionExpiryHandler(() => {
    expired += 1;
  });
  try {
    handleSessionError({ status: 500 });
    handleSessionError(new Error('network failure'));
    assert.equal(expired, 0);
  } finally {
    unregister();
  }
});

test('repeated 401 notifications expire an active session only once', () => {
  let expired = 0;
  const expiry = createIdempotentSessionExpiry(() => {
    expired += 1;
  });
  expiry.expire();
  expiry.expire();
  assert.equal(expired, 1);
  expiry.reset();
  expiry.expire();
  assert.equal(expired, 2);
});