import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLanguageSettings, englishDictionary, flattenDictionary, isSupportedLocale, loadDictionary, mergeDictionary, sourceTemplate, sourceTranslationKey, translate } from '../src/runtime';
import { buildClerkLocalization } from '../src/clerk-localization';
import { SUPPORTED_LOCALES } from '../src/types';

const placeholders = (text: string) => [...text.matchAll(/\{\{?\s*([\w.-]+)\s*\}?\}/g)].map(match => match[0]).sort();
const customerSource = Object.entries(flattenDictionary(englishDictionary)).filter(([key]) => !key.startsWith('admin'));
for (const locale of SUPPORTED_LOCALES) {
  test(`${locale}: complete customer dictionary and exact interpolation contract`, async () => {
    const dictionary = await loadDictionary(locale);
    const flattened = flattenDictionary(dictionary);
    for (const [key, text] of customerSource) {
      assert.ok(flattened[key]?.trim(), `${locale}: missing ${key}`);
      assert.ok(!/^customer\.m[0-9a-f]+$/.test(flattened[key]!), `${locale}: untranslated alias ${key}`);
      assert.deepEqual(placeholders(flattened[key]!), placeholders(text), `${locale}: altered placeholders in ${key}`);
      assert.notEqual(translate(dictionary, key), key, `${locale}: raw key ${key}`);
    }
  });
  test(`${locale}: Clerk uses the same dictionary and overrides`, async () => {
    const dictionary = mergeDictionary(await loadDictionary(locale), { 'clerk.formFieldLabel__emailAddress': 'TEST OVERRIDE' });
    const t = (key: string) => translate(dictionary, key);
    const resource = buildClerkLocalization(t, locale);
    assert.equal(resource.formFieldLabel__emailAddress, 'TEST OVERRIDE');
    assert.ok(resource.signIn.start.title);
    assert.ok(resource.signUp.start.title);
  });
}
test('only the requested seven languages are enabled; Arabic is unsupported', () => {
  assert.deepEqual([...SUPPORTED_LOCALES].sort(), ['de','en','es','fr','ko','ru','uk']);
  assert.deepEqual(defaultLanguageSettings.enabledLanguages, [...SUPPORTED_LOCALES]);
  assert.equal(isSupportedLocale('ar'), false);
});
test('missing translation uses the configured fallback, never a raw key', async () => {
  const french = await loadDictionary('fr');
  assert.equal(translate({}, 'common.loading', undefined, french), translate(french, 'common.loading'));
  assert.notEqual(translate({}, 'missing.rawKey', undefined, french), 'missing.rawKey');
});
test('canonical amounts, addresses and codes remain exact interpolation values', async () => {
  const value = '0.0001234567890123456789';
  const address = '0x0123456789abcdef0123456789abcdef01234567';
  const dictionary = mergeDictionary(await loadDictionary('de'), {
    'customer.testPayment': '{{amount}} {{asset}} {{network}} {{address}} {{orderId}}',
  });
  assert.equal(translate(dictionary, 'customer.testPayment', {
    amount: value, asset: 'USDT', network: 'BEP20', address, orderId: 'ORDER-123',
  }), `${value} USDT BEP20 ${address} ORDER-123`);
});
test('source phrase lookup and templates only affect presentation', () => {
  assert.ok(sourceTranslationKey('Copy'));
  assert.equal(sourceTranslationKey('customer.m3b73900b8d29'), 'customer.m3b73900b8d29');
  assert.equal(translate(englishDictionary, 'customer.m3b73900b8d29'), 'Explore');
  assert.ok(sourceTranslationKey('Exchange Rates'));
  assert.equal(sourceTranslationKey('0x0123456789abcdef'), undefined);
  assert.equal(sourceTemplate('0.000123456789 BTC BEP20'), undefined);
});
test('already-localized feedback changes language without changing frozen values', () => {
  const history = new Map([['Envoyez exactement {{amount}} {{asset}} à {{address}}.', 'customer.frozenHistory']]);
  const amount = '0.0001234567890123456789', address = '0x0123456789abcdef0123456789abcdef01234567';
  const match = sourceTemplate(`Envoyez exactement ${amount} BTC à ${address}.`, history);
  assert.ok(match);
  const german = mergeDictionary({}, { 'customer.frozenHistory': 'Senden Sie genau {{amount}} {{asset}} an {{address}}.' });
  assert.equal(translate(german, match.key, match.params), `Senden Sie genau ${amount} BTC an ${address}.`);
});
