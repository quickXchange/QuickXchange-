import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadLocalePair } from '../src/load-locale-pair';
import type { Locale, TranslationDictionary } from '../src/types';

test('selected fallback dictionary is fetched once per switch, without a stale cache', async () => {
  const calls: Locale[] = [];
  const load = async (locale: Locale): Promise<TranslationDictionary> => {
    calls.push(locale);
    return { common: { loading: `revision-${calls.length}` } };
  };
  const [selected, fallback] = await loadLocalePair('en', 'en', load);
  assert.deepEqual(calls, ['en']);
  assert.equal(selected, fallback);
  const [refreshed] = await loadLocalePair('en', 'en', load);
  assert.equal(refreshed.common.loading, 'revision-2');
});

test('different selected and fallback dictionaries load concurrently and failures propagate', async () => {
  const calls: Locale[] = [];
  let resolveSelected!: (dictionary: TranslationDictionary) => void;
  const selected = new Promise<TranslationDictionary>(resolve => { resolveSelected = resolve; });
  const result = loadLocalePair('fr', 'en', locale => {
    calls.push(locale);
    return locale === 'fr' ? selected : Promise.resolve({ common: { loading: 'Loading' } });
  });
  assert.deepEqual(calls, ['fr', 'en']);
  resolveSelected({ common: { loading: 'Chargement' } });
  const dictionaries = await result;
  assert.equal(dictionaries[0].common.loading, 'Chargement');
  assert.equal(dictionaries[1].common.loading, 'Loading');
  await assert.rejects(loadLocalePair('de', 'en', async () => { throw new Error('offline'); }), /offline/);
});
