import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const IDS = ['introduction','swap-vs-convert','starting-exchange','selecting-assets','reviewing-quote','entering-details','terms-submission','funding-order','tracking-order','account-features','history-notifications','affiliate-program','safety-troubleshooting','common-questions','support'];

test('manual keeps all 15 anchors, route testids and has no jpg/video placeholder', async () => {
  const page = await read('../src/pages/user-manual.tsx');
  for (const id of IDS) assert.ok(page.includes(`id="${id}"`) || page.includes(`id: '${id}'`), id);
  for (const t of ['link-home', 'link-swap', 'link-convert', 'link-track', 'link-orders']) assert.ok(page.includes(t), t);
  assert.doesNotMatch(page, /\.jpg|VideoPlaceholder/);
});

test('every manual key exists in English and all six completed locales', async () => {
  const page = (await read('../src/pages/user-manual.tsx'))
    + (await read('../src/components/manual/manual-guides.tsx'))
    + (await read('../src/components/manual/manual-toc.tsx'));
  // Include computed keys in step/status arrays and the responsive TOC.
  const keys = new Set([...page.matchAll(/\bmanual[A-Z]\w+/g)].map((m) => m[0]));
  const en = await read('../../../lib/i18n/src/customer.ts');
  for (const k of keys) assert.ok(en.includes(`"${k}":`), `en ${k}`);
  for (const l of ['fr','de','ru','es','ko','uk']) {
    const d = await read(`../../../lib/i18n/src/completed/${l}.ts`);
    for (const k of keys) assert.ok(d.includes(`"customer.${k}"`), `${l} ${k}`);
  }
});

test('refund destination is always optional in every locale and guides match the real UI', async () => {
  const en = await read('../../../lib/i18n/src/customer.ts');
  assert.match(en, /"manualRefundBody":"A refund address is optional on every route/);
  assert.doesNotMatch(en, /manualRefundBody":"[^"]*(is required|must provide|others require)/);
  for (const l of ['fr','de','ru','es','ko','uk']) {
    const d = await read(`../../../lib/i18n/src/completed/${l}.ts`);
    assert.equal((d.match(/"customer\.manualRefundBody"/g) ?? []).length, 1, l);
  }
  const g = await read('../src/components/manual/manual-guides.tsx');
  assert.doesNotMatch(g, /manualGetQuote/);
  assert.match(g, /requestFullscreen/); assert.match(g, /fullscreenEnabled/); assert.match(g, /previous\?\.focus/);
});
