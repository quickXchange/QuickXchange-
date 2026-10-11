import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { getRatesXmlCodeOptions } from '../src/lib/rates-xml-code-options.ts';

const catalogue = JSON.parse(await readFile(
  new URL('../../api-server/src/data/rates-currency-codes.json', import.meta.url), 'utf8',
));

test('the complete 332-row catalogue is selectable across the appropriate method editors', () => {
  assert.equal(catalogue.length, 332);
  for (const [type, count] of [['fiat', 234], ['crypto', 98]]) {
    const expected = catalogue.filter(entry => entry.type === type);
    const options = getRatesXmlCodeOptions(catalogue, type);
    assert.equal(options.length, count);
    assert.deepEqual(options, expected, 'preserve every code and description in original order');
    assert.ok(options.includes(expected.at(-1)), 'last CSV entry must not be truncated');
    assert.deepEqual(getRatesXmlCodeOptions(catalogue, type, '  '), expected);
  }
});

test('search finds entries beyond the former 80-code limit and never caps broad results', () => {
  assert.equal(getRatesXmlCodeOptions(catalogue, 'fiat', 'cashsar')[0].code, 'CASHSAR');
  const options = getRatesXmlCodeOptions(catalogue, 'fiat', 'a');
  assert.deepEqual(options, catalogue.filter(entry => entry.type === 'fiat' &&
    (entry.code.toLowerCase().includes('a') || entry.description.toLowerCase().includes('a'))));
  assert.ok(options.length > 80);
  assert.ok(getRatesXmlCodeOptions(catalogue, 'crypto', '  BITCOIN  ').some(entry => entry.code === 'BTC'));
});

test('search preserves the source catalogue and only returns compatible code types', () => {
  const before = structuredClone(catalogue);
  assert.equal(getRatesXmlCodeOptions(catalogue, 'fiat', 'BTC').length, 0);
  assert.equal(getRatesXmlCodeOptions(catalogue, 'crypto', 'PPUSD').length, 0);
  assert.deepEqual(getRatesXmlCodeOptions(catalogue, 'fiat', 'not-a-real-code'), []);
  assert.deepEqual(catalogue, before);
});
