import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteErrorTranslationKey } from '../src/quote-errors';
import { loadDictionary, translate } from '../src/runtime';
import { SUPPORTED_LOCALES } from '../src/types';

test('solver budgets, stale quotes and provider outages hide raw HTTP diagnostics', () => {
  for (const error of [
    { data: { code: 'MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED' }, status: 503 },
    { data: { code: 'MANUAL_RECEIVE_QUOTE_STALE' } },
    { status: 503, message: 'HTTP 503: private provider diagnostics' },
    { status: 504 },
    { name: 'SwapQuoteTimeoutError' },
  ]) assert.equal(quoteErrorTranslationKey(error), 'quoteErrors.temporary');
  assert.equal(quoteErrorTranslationKey({ data: { code: 'MANUAL_AMOUNT_OUT_OF_RANGE' }, status: 422 }), undefined);
});

test('all supported languages have actionable quote recovery copy, including Russian', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    const dictionary = await loadDictionary(locale);
    const message = translate(dictionary, 'quoteErrors.temporary');
    assert.ok(message.length > 30);
    assert.doesNotMatch(message, /HTTP|503|budget|quoteErrors\./);
    if (locale === 'ru') assert.match(message, /Повторите попытку/);
  }
});
