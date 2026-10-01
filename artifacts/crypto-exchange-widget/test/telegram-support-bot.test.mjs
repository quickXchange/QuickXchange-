import assert from 'node:assert/strict';
import test from 'node:test';

const { cleanSettings, validate, newId, applyFaqEdit } = await import(process.env.SUPPORT_BOT_SETTINGS_MODULE);

const tr = (q = 'Q', a = 'A', aliases = []) => ({ question: q, answer: a, aliases });
const base = (o = {}) => ({
  enabled: false, automaticRepliesEnabled: true, contactSupportEnabled: true, supportUrl: null,
  welcomeMessages: { en: 'Hello' }, categories: [{ id: 'cat-1', label: { en: 'Billing' }, enabled: true }], faqs: [], ...o,
});
const ok = { tokenConfigured: true, webhookSecretConfigured: true };
const missing = { tokenConfigured: false, webhookSecretConfigured: false };

test('blank English welcome is invalid', () => {
  assert.ok(validate(base({ welcomeMessages: { en: '  ', fr: 'Salut' } })).some((e) => /English welcome/.test(e)));
  assert.deepEqual(validate(base()), []);
});

test('support account formats', () => {
  for (const u of ['@support_team', 'support_team', 'https://t.me/support_team', 'https://telegram.me/support_team/', null, '  '])
    assert.deepEqual(validate(base({ supportUrl: u })), [], String(u));
  for (const u of ['https://evil.com/support_team', 'https://t.me/+AbCdEfGh', 'https://t.me/joinchat/abc', 'https://t.me/support_team?start=x', 'http://t.me/support_team', 'javascript:alert(1)', 'https://t.me.evil.com/support_team', '@ab'])
    assert.ok(validate(base({ supportUrl: u })).some((e) => /Support account/.test(e)), u);
});

test('missing secrets block enabling but allow disabled edits', () => {
  assert.ok(validate(base({ enabled: true, supportUrl: '@support_team' }), missing).some((e) => /secrets/.test(e)));
  assert.deepEqual(validate(base({ enabled: false }), missing), []);
  assert.deepEqual(validate(base({ enabled: true, supportUrl: '@support_team' }), ok), []);
});

test('enabled contact button requires URL', () => {
  assert.ok(validate(base({ enabled: true, contactSupportEnabled: true }), ok).some((e) => /Contact Support/.test(e)));
  assert.deepEqual(validate(base({ enabled: true, contactSupportEnabled: false }), ok), []);
});

test('locale pruning keeps other languages', () => {
  const c = cleanSettings(base({
    welcomeMessages: { en: ' Hi ', fr: '  ', de: 'Hallo' },
    categories: [{ id: 'cat-1', label: { en: 'A', ru: ' ', ko: 'B' }, enabled: true }],
  }));
  assert.deepEqual(c.welcomeMessages, { en: 'Hi', de: 'Hallo' });
  assert.deepEqual(c.categories[0].label, { en: 'A', ko: 'B' });
});

test('IDs and approvals preserved on normalization', () => {
  const c = cleanSettings(base({ faqs: [{ id: 'faq-x', categoryId: 'cat-1', approved: true, translations: { en: tr() } }] }));
  assert.equal(c.categories[0].id, 'cat-1');
  assert.equal(c.faqs[0].id, 'faq-x');
  assert.equal(c.faqs[0].approved, true);
});

test('aliases trimmed and blanks pruned; empty locales dropped', () => {
  const c = cleanSettings(base({ faqs: [{ id: 'f', categoryId: 'cat-1', approved: false, translations: { en: tr('Q', 'A', [' a ', '', '  ', 'b']), fr: tr(' ', '', ['  ']) } }] }));
  assert.deepEqual(c.faqs[0].translations.en.aliases, ['a', 'b']);
  assert.equal(c.faqs[0].translations.fr, undefined);
});

test('incomplete translations are invalid, including alias-only', () => {
  const mk = (fr) => base({ faqs: [{ id: 'f', categoryId: 'cat-1', approved: false, translations: { en: tr(), fr } }] });
  assert.ok(validate(mk(tr('Q', ''))).some((e) => /\(fr\)/.test(e)));
  assert.ok(validate(mk(tr('', 'A'))).some((e) => /\(fr\)/.test(e)));
  assert.ok(validate(mk(tr('', '', ['alias']))).some((e) => /\(fr\)/.test(e)));
  assert.deepEqual(validate(mk(tr('', '', ['  ']))), []);
  assert.deepEqual(validate(mk(tr('Q', 'A'))), []);
});

test('FAQ needs English and a valid category', () => {
  assert.ok(validate(base({ faqs: [{ id: 'f', categoryId: 'nope', approved: false, translations: { en: tr() } }] })).some((e) => /category/.test(e)));
  assert.ok(validate(base({ faqs: [{ id: 'f', categoryId: 'cat-1', approved: false, translations: { fr: tr() } }] })).some((e) => /English/.test(e)));
});

test('editing unapproves unless explicitly kept; ids are valid slugs', () => {
  const f = { id: 'f', categoryId: 'cat-1', approved: true, translations: { en: tr() } };
  assert.equal(applyFaqEdit(f, (x) => ({ ...x, categoryId: 'c2' })).approved, false);
  assert.equal(applyFaqEdit(f, (x) => ({ ...x, approved: false }), true).approved, false);
  assert.equal(applyFaqEdit(f, (x) => x, true).approved, true);
  assert.match(newId('faq', ''), /^[a-z0-9][a-z0-9_-]*$/);
  assert.match(newId('category', 'Billing & Fees!'), /^billing-fees-[a-z0-9]+$/);
});
