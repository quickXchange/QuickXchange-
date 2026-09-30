import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  isHistoricalTelegramSupportDestination,
  normalizeTelegramSupportInput,
  resolveFooterTelegramSupportItems,
  resolveTelegramSupportForPublicShell,
  resolveTelegramSupportFromPublishedSnapshot,
  telegramSupportHandle,
} = await import(process.env.TELEGRAM_SUPPORT_VALUE_MODULE);
const testDir = dirname(fileURLToPath(import.meta.url));
const source = (path) => readFile(resolve(testDir, '../src', path), 'utf8');

test('unresolved published settings never fall back, while known snapshots resolve canonical/default values', () => {
  assert.equal(resolveTelegramSupportFromPublishedSnapshot(undefined), undefined); // loading
  assert.equal(resolveTelegramSupportFromPublishedSnapshot(undefined), undefined); // fetch error with no cached success
  assert.equal(resolveTelegramSupportFromPublishedSnapshot(null), undefined);
  assert.equal(resolveTelegramSupportFromPublishedSnapshot({ socialTrust: { telegramUrl: '@NewOwner' } }), 'https://t.me/NewOwner');
  assert.equal(resolveTelegramSupportFromPublishedSnapshot({ socialTrust: { telegramUrl: null } }), 'https://t.me/Quick_change_support');
  assert.equal(resolveTelegramSupportFromPublishedSnapshot({ socialTrust: {} }), 'https://t.me/Quick_change_support');
  assert.equal(resolveTelegramSupportFromPublishedSnapshot({ socialTrust: { telegramUrl: 'https://t.me/CachedOwner' } }), 'https://t.me/CachedOwner');
  assert.equal(resolveTelegramSupportFromPublishedSnapshot({ socialTrust: { telegramUrl: 'https://example.com/unsafe' } }), undefined);
  assert.equal(telegramSupportHandle(undefined), 'Telegram');
  assert.equal(telegramSupportHandle('https://t.me/NewOwner'), '@NewOwner');
});

test('the shared validator accepts only canonical support usernames and safe Telegram URLs', () => {
  assert.deepEqual(normalizeTelegramSupportInput('@NewOwner_7'), { value: 'https://t.me/NewOwner_7', error: null });
  assert.deepEqual(normalizeTelegramSupportInput('https://telegram.me/NewOwner/'), { value: 'https://t.me/NewOwner', error: null });
  for (const invalid of [
    'https://evil.example/NewOwner',
    'http://t.me/NewOwner',
    'tg://resolve?domain=NewOwner',
    'https://t.me/NewOwner?start=unsafe',
    'https://t.me/NewOwner#fragment',
    '@bad',
  ]) {
    assert.match(normalizeTelegramSupportInput(invalid).error ?? '', /Telegram support must be a username or a Telegram username URL/);
  }
  assert.equal(isHistoricalTelegramSupportDestination('https://telegram.me/Quick_change_support/'), true);
  assert.equal(isHistoricalTelegramSupportDestination('https://t.me/QuickXchangeNetBot'), false);
});

test('footer remaps only recognized support catalog entries and preserves bot/channel links', () => {
  const items = [
    { id: 'old-support', name: 'Telegram', href: 'https://t.me/Quick_change_support' },
    { id: 'bot', name: 'Telegram Bot', href: 'https://t.me/QuickXchangeNetBot' },
    { id: 'channel', name: 'Telegram News', href: 'https://t.me/qx_news' },
    { id: 'named-support', name: 'Telegram Support', href: 'https://example.com/support' },
  ];
  const mapped = resolveFooterTelegramSupportItems(items, 'https://t.me/NewOwner');
  assert.equal(mapped.length, 3);
  assert.deepEqual(mapped[0], { id: 'old-support', name: '@NewOwner', href: 'https://t.me/NewOwner' });
  assert.deepEqual(mapped[1], items[1]);
  assert.deepEqual(mapped[2], items[2]);
  assert.deepEqual(resolveFooterTelegramSupportItems(items.slice(0, 1))[0], {
    ...items[0], name: 'Telegram', href: '',
  });
});

test('preview support target overrides published state only when its draft snapshot is resolved', () => {
  const published = 'https://t.me/PublishedOwner';
  assert.equal(resolveTelegramSupportForPublicShell(published, false, false, undefined), published);
  assert.equal(resolveTelegramSupportForPublicShell(published, true, false, undefined), published);
  assert.equal(resolveTelegramSupportForPublicShell(published, true, true, {
    status: 'configured',
    value: '@DraftOwner',
  }), 'https://t.me/DraftOwner');
  assert.equal(resolveTelegramSupportForPublicShell(published, true, true, { status: 'invalid' }), undefined);
  assert.equal(resolveTelegramSupportForPublicShell(published, true, true, { status: 'unresolved' }), undefined);
  assert.equal(resolveTelegramSupportForPublicShell(published, true, true, { status: 'error' }), undefined);
  assert.equal(resolveTelegramSupportForPublicShell(published, true, true, { status: 'confirmed-empty' }), 'https://t.me/Quick_change_support');
  assert.equal(resolveTelegramSupportForPublicShell(published, true, true, undefined), undefined);
});

test('all public support anchors use the shared resolved target and cannot act before resolution', async () => {
  const [supportButton, publicShell, contactPage, userManual, app, orderConfirmation, account, sharedUi, orderCompletion, admin, invoicePdf, editor] = await Promise.all([
    source('components/telegram-support-button.tsx'),
    source('components/public-shell.tsx'),
    source('pages/public-info-pages.tsx'),
    source('pages/user-manual.tsx'),
    source('App.tsx'),
    source('pages/order-confirmation.tsx'),
    source('pages/account.tsx'),
    source('components/shared-app-ui.tsx'),
    source('components/order-completion.tsx'),
    source('pages/admin.tsx'),
    source('lib/invoice-pdf.ts'),
    source('components/social-trust-editor.tsx'),
  ]);
  assert.match(supportButton, /TelegramSupportButton\(\{ supportUrl \}/);
  assert.match(supportButton, /href=\{supportUrl\}/);
  assert.match(supportButton, /aria-disabled=\{!supportUrl\}/);
  assert.doesNotMatch(supportButton, /usePublishedTelegramSupportUrl/);
  assert.match(publicShell, /usePublishedTelegramSupportUrl/);
  assert.match(publicShell, /resolveTelegramSupportForPublicShell\(/);
  assert.match(publicShell, /href=\{telegramSupportUrl\}/);
  assert.match(publicShell, /aria-disabled=\{!telegramSupportUrl\}/);
  assert.match(publicShell, /href=\{item\.href \|\| undefined\}/);
  assert.match(publicShell, /aria-disabled=\{!item\.href\}/);
  assert.match(publicShell, /resolveFooterTelegramSupportItems\(socialItems, supportUrl\)/);
  assert.match(publicShell, /<TelegramSupportButton supportUrl=\{telegramSupportUrl\} \/>/);
  assert.match(contactPage, /href=\{telegramSupportUrl\}/);
  assert.match(contactPage, /aria-disabled=\{!telegramSupportUrl\}/);
  assert.match(userManual, /href=\{telegramSupportUrl\}/);
  assert.match(userManual, /aria-disabled=\{!telegramSupportUrl\}/);
  assert.match(app, /supportHref=\{telegramSupportUrl\}/);
  assert.match(orderConfirmation, /supportHref=\{telegramSupportUrl\}/);
  assert.match(account, /supportHref=\{telegramSupportUrl\}/);
  assert.match(sharedUi, /href=\{supportHref\}/);
  assert.match(sharedUi, /aria-disabled=\{!supportHref\}/);
  assert.match(orderCompletion, /if \(!telegramSupportUrl \|\| !isCompletedInvoiceOrder/);
  assert.match(orderCompletion, /downloadInvoicePdf\(invoiceSnapshot\(order\), telegramSupportUrl\)/);
  assert.match(admin, /if \(!telegramSupportUrl\)/);
  assert.match(admin, /downloadInvoicePdf\(invoiceSnapshot\(safeOrder\), telegramSupportUrl\)/);
  assert.match(invoicePdf, /canonicalSupportUrl !== supportTelegramUrl/);
  assert.match(editor, /telegramUrl: initialized \? telegramUrl\.trim\(\) \|\| null : undefined/);
  assert.match(editor, /status: 'invalid'/);
  assert.match(editor, /status: 'confirmed-empty'/);
});