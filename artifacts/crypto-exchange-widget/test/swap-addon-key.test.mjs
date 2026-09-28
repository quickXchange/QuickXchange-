import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { addonKeyFromText, validAddonKey } from '../src/lib/swap-addon-key.ts';

test('Admin generates server-valid keys from human-readable option names', () => {
  for (const [name, expected] of [
    ['Fast Payment', 'fast-payment'],
    ['Payment via Company', 'payment-via-company'],
    [' Éxpress  Payment! ', 'express-payment-'],
    ['A_1', 'a_1'],
    ['🔥 Fast', 'fast'],
  ]) {
    assert.equal(addonKeyFromText(name), expected);
    assert.equal(validAddonKey.test(expected), true);
  }
  assert.equal(addonKeyFromText('a'.repeat(120)).length, 100);
  assert.equal(validAddonKey.test(addonKeyFromText('!!!')), false);
  assert.equal(validAddonKey.test('Fast Payment'), false);
});

test('Admin form checks the exact key boundary before sending a save request', async () => {
  const source = await readFile(new URL('../src/pages/admin-swap-addons.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(!validAddonKey\.test\(form\.key\)\) \{[\s\S]*?return;/);
  assert.match(source, /editing === 'new' && !keyEdited \? addonKeyFromText\(e\.target\.value\) : p\.key/);
  assert.match(source, /pattern="\[a-z0-9\]\(\?:\[a-z0-9_\]\|-\)\*"/);
});