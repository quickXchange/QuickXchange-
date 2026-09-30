import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const widgetDir = fileURLToPath(new URL('..', import.meta.url));
const output = await mkdtemp(join(tmpdir(), 'swap-quote-request-'));
const bundle = join(output, 'request.mjs');
execFileSync(resolve(widgetDir, '../../node_modules/.pnpm/node_modules/.bin/esbuild'), [
  resolve(widgetDir, 'src/lib/swap-quote-request.ts'), '--bundle', '--platform=node',
  '--format=esm', `--outfile=${bundle}`,
], { stdio: 'pipe' });
const { SwapQuoteRequest, SWAP_QUOTE_DEBOUNCE_MS } = await import(pathToFileURL(bundle).href);
after(() => rm(output, { recursive: true, force: true }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = amount => ({ amount, receiveAmount: amount * 2, expiresAt: new Date(Date.now() + 60_000).toISOString() });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const options = overrides => ({
  key: 'send:100', run: async () => quote(100),
  onPhase() {}, onCached() {}, onSuccess() {}, onError(error) { throw error; },
  ...overrides,
});

test('rapid typing makes one request after a short debounce, without waiting for blur', async () => {
  const request = new SwapQuoteRequest();
  const calls = [], results = [];
  try {
    assert.equal(SWAP_QUOTE_DEBOUNCE_MS, 120);
    for (const amount of [1, 10, 100, 1000]) {
      request.schedule(options({
        key: `receive:${amount}`,
        run: async () => { calls.push(amount); return quote(amount); },
        onSuccess: result => results.push(result.amount),
      }));
      await pause(10);
    }
    assert.deepEqual(calls, []);
    await pause(SWAP_QUOTE_DEBOUNCE_MS + 25);
    assert.deepEqual(calls, [1000]);
    assert.deepEqual(results, [1000]);
  } finally { request.cancel(); }
});

test('a superseded fetch is aborted and late success or error can never replace newer input', async () => {
  const request = new SwapQuoteRequest();
  const older = deferred(), newer = deferred(), failed = deferred();
  const results = [], errors = [];
  let signal;
  try {
    request.schedule(options({
      immediate: true, key: 'receive:1',
      run: s => { signal = s; return older.promise; },
      onSuccess: q => results.push(q.amount), onError: e => errors.push(e),
    }));
    await pause(5);
    request.schedule(options({
      immediate: true, key: 'receive:1000', run: () => newer.promise,
      onSuccess: q => results.push(q.amount), onError: e => errors.push(e),
    }));
    assert.equal(signal.aborted, true);
    await pause(5);
    newer.resolve(quote(1000));
    await pause(0);
    older.resolve(quote(1)); // Simulates a server/transport that ignores abort.
    await pause(0);
    assert.deepEqual(results, [1000]);
    request.schedule(options({ immediate: true, key: 'send:1', run: () => failed.promise, onError: e => errors.push(e) }));
    await pause(5);
    request.cancel();
    failed.reject(new Error('late error'));
    await pause(0);
    assert.deepEqual(errors, []);
  } finally { request.cancel(); }
});

test('synchronous input invalidation fences a completion before the next render/effect', async () => {
  const request = new SwapQuoteRequest();
  const pending = deferred(), results = [];
  request.schedule(options({ immediate: true, run: () => pending.promise, onSuccess: q => results.push(q) }));
  await pause(5);
  request.cancel();
  pending.resolve(quote(100));
  await pause(0);
  assert.deepEqual(results, []);
});

test('cache only shows an exact recent input and still confirms through a fresh authoritative request', async () => {
  const request = new SwapQuoteRequest();
  const cached = [], phases = [], confirmed = [];
  try {
    request.schedule(options({ immediate: true }));
    await pause(5);
    request.schedule(options({
      immediate: true,
      onCached: q => cached.push(q?.amount ?? null),
      onPhase: phase => phases.push(phase),
      run: async () => quote(101), // Authoritative refresh may legitimately differ.
      onSuccess: q => confirmed.push(q.amount),
    }));
    assert.deepEqual(cached, [100]);
    assert.deepEqual(confirmed, []);
    await pause(5);
    assert.deepEqual(phases, ['debouncing', 'loading']);
    assert.deepEqual(confirmed, [101]);
    request.schedule(options({ key: 'receive:100', onCached: q => cached.push(q?.amount ?? null) }));
    assert.equal(cached.at(-1), null);
    request.schedule(options({ key: 'different-route:100', onCached: q => cached.push(q?.amount ?? null) }));
    assert.equal(cached.at(-1), null);
    request.schedule(options({ key: 'different-addon:100', onCached: q => cached.push(q?.amount ?? null) }));
    assert.equal(cached.at(-1), null);
  } finally { request.cancel(); }
});

test('expired or unsigned quote results are never cached for instant display', async () => {
  for (const expiry of [undefined, new Date(Date.now() - 100).toISOString(), new Date(Date.now() + 500).toISOString()]) {
    const request = new SwapQuoteRequest();
    const cached = [];
    try {
      request.schedule(options({ immediate: true, run: async () => ({ amount: 100, expiresAt: expiry }) }));
      await pause(5);
      request.schedule(options({ onCached: q => cached.push(q) }));
      assert.deepEqual(cached, [null]);
    } finally { request.cancel(); }
  }
});

test('amount inputs do not trigger focus quotes and only authoritative input-matched tickets enable Continue', async () => {
  const source = await readFile(resolve(widgetDir, 'src/components/exchange-surface.tsx'), 'utf8');
  for (const fn of ['activateSendAmount', 'activateReceiveAmount']) {
    const start = source.indexOf(`const ${fn} = () => {`);
    const handler = source.slice(start, source.indexOf('\n  };', start));
    assert.doesNotMatch(handler, /invalidateQuote|setActiveAmountSide|schedule|mutate/);
  }
  assert.match(source, /createExchangeQuoteByReceive\([\s\S]*?\}, \{ signal \}\)/);
  assert.match(source, /createExchangeQuote\([\s\S]*?\}, \{ signal \}\)/);
  assert.match(source, /quoteStatus === 'idle' && quotePreview\?\.requestKey === quoteRequestKey/);
  assert.match(source, /Number\(value\) !== Number\(quoteAmountInput\)/);
  assert.doesNotMatch(source, /selectionChanged \? 0 : 450|receiveQuoteMutation|quoteMutation/);
  assert.match(source, /onChange=\{\(event\) => changeAmount\('receive', event\.target\.value\)\}/);
  assert.match(source, /onChange=\{\(event\) => changeAmount\('send', event\.target\.value\)\}/);
});