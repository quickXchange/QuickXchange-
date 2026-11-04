import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
// The first dev-server navigation compiles the existing large Admin module.
// Do not turn a cold Vite build into a false accounting regression.
test.setTimeout(60_000);

const ids = {
  verified: 'QX-PROFIT-VERIFIED-001',
  loss: 'QX-PROFIT-LOSS-002',
  missing: 'QX-PROFIT-MISSING-003',
  reversed: 'QX-PROFIT-REVERSED-004',
  usd: 'QX-PROFIT-USD-005',
};
const basis = { currency: 'EUR', sourceUnitValue: '1', targetUnitCost: '0.8905', providerFee: '2', networkFee: '1', bankFee: '0.5', otherFee: '0', evidence: 'provider fill statement #E2E-51', costsVerified: true };
const rows: any[] = [
  { key: ids.verified, id: ids.verified, type: 'Swap', createdAt: '2026-05-12T10:00:00.000Z', completedAt: '2026-05-12T10:05:00.000Z', status: 'completed', fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'USDT', toNetwork: 'TRC20', amount: '898', receiveAmount: '1000', paymentMethod: 'SEPA', customerRate: '1.1135857461', basis, basisId: 'basis-51', revenue: '898', acquisitionCost: '890.5', fees: '3.5', grossSpread: '7.5', netProfit: '4.5', adjustments: '0', state: 'verified', href: `/admin/orders/${ids.verified}?type=manual`, audit: [{ id: 'audit-basis-51', kind: 'Historical basis', currency: 'EUR', amount: null, reason: 'Provider fill statement #E2E-51', createdAt: '2026-05-12T10:08:00.000Z' }] },
  { key: ids.loss, id: ids.loss, type: 'Swap', createdAt: '2026-05-11T10:00:00.000Z', completedAt: '2026-05-11T10:05:00.000Z', status: 'completed', fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'EUR', toNetwork: 'SEPA', amount: '0.01', receiveAmount: '850', paymentMethod: 'Bank transfer', customerRate: '85000', basis: { ...basis, sourceUnitValue: '84000', targetUnitCost: '1', providerFee: '4', networkFee: '2', bankFee: '0', otherFee: '0' }, basisId: 'basis-52', revenue: '840', acquisitionCost: '850', fees: '6', grossSpread: '-10', netProfit: '-16', adjustments: '0', state: 'verified', href: `/admin/orders/${ids.loss}?type=instant`, audit: [] },
  { key: ids.missing, id: ids.missing, type: 'Convert', createdAt: '2026-05-10T10:00:00.000Z', completedAt: '2026-05-10T10:05:00.000Z', status: 'completed', fromAsset: 'USDT', fromNetwork: 'TRC20', toAsset: 'EUR', toNetwork: 'SEPA', amount: '500', receiveAmount: '0', paymentMethod: 'Convert', customerRate: null, basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.missing}?type=instant`, audit: [] },
  { key: ids.reversed, id: ids.reversed, type: 'Swap', createdAt: '2026-05-09T10:00:00.000Z', completedAt: '2026-05-09T10:05:00.000Z', status: 'reversed', fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'USDT', toNetwork: 'TRC20', amount: '100', receiveAmount: '110', paymentMethod: 'SEPA', customerRate: '1.1', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: '-2', adjustments: '-2', state: 'reversed', href: `/admin/orders/${ids.reversed}?type=manual`, audit: [{ id: 'audit-residual', kind: 'Residual cost adjustment', currency: 'EUR', amount: '-2', reason: 'Unrecoverable network fee after reversal', createdAt: '2026-05-09T10:06:00.000Z' }] },
  { key: ids.usd, id: ids.usd, type: 'Convert', createdAt: '2026-05-08T10:00:00.000Z', completedAt: '2026-05-08T10:05:00.000Z', status: 'completed', fromAsset: 'USD', fromNetwork: 'Bank', toAsset: 'USDT', toNetwork: 'TRC20', amount: '100', receiveAmount: '105', paymentMethod: 'Wire', customerRate: '1.05', basis: { ...basis, currency: 'USD', sourceUnitValue: '1', targetUnitCost: '0.88', providerFee: '2', networkFee: '1', bankFee: '0', otherFee: '0' }, basisId: 'basis-usd', revenue: '100', acquisitionCost: '92.4', fees: '3', grossSpread: '7.6', netProfit: '4.6', adjustments: '0', state: 'verified', href: `/admin/orders/${ids.usd}?type=instant`, audit: [] },
];
for (let i = 6; i <= 25; i++) rows.push({ ...rows[0], key: `QX-PROFIT-PAGE-${i}`, id: `QX-PROFIT-PAGE-${i}`, href: `/admin/orders/QX-PROFIT-PAGE-${i}?type=manual` });

function report(owner = true, page = 1) {
  return {
    rows, total: 26, page, pageSize: 25, owner, currencies: ['EUR', 'USD', 'USDT', 'BTC'],
    routes: [{ fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'USDT', toNetwork: 'TRC20' }, { fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'EUR', toNetwork: 'SEPA' }],
    methods: ['SEPA', 'Bank transfer', 'Convert', 'Wire'],
    rules: [{ id: 'rule-1', effectiveAt: '2026-05-01T00:00:00.000Z', ...basis, fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'USDT', toNetwork: 'TRC20' }],
    summary: [
      { currency: 'EUR', revenue: '898', acquisitionCost: '890.5', fees: '3.5', costs: '894', profit: '4.5', adjustments: '0', valued: 1 },
      { currency: 'USD', revenue: '100', acquisitionCost: '92.4', fees: '3', costs: '95.4', profit: '4.6', adjustments: '0', valued: 1 },
    ],
    completedOrders: 5, missingCosts: 1, volume: [{ currency: 'EUR', amount: '1498' }, { currency: 'USD', amount: '100' }],
  };
}

async function fixture(page: Page, owner = true, theme = 'light') {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  const requests: { path: string; method: string; url: string; body?: any }[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path === '/api/languages') return route.fulfill({ json: { enabledLanguages: ['en', 'fr', 'de', 'ru', 'es', 'ko', 'uk'], fallbackLanguage: 'en', revision: 'e2e' } });
    if (path.startsWith('/api/languages/dictionaries/')) return route.fulfill({ json: { translations: {} } });
    if (path === '/api/account/affiliate/attribution') return route.fulfill({ json: { status: 'no_referral' } });
    if (path === '/api/admin/operators') return route.fulfill({ json: [{ id: 'profit-e2e', email: 'profit@example.test', role: owner ? 'owner' : 'operator', status: 'active', linkedToClerk: true }] });
    if (path === '/api/admin/authorization') return route.fulfill({ json: { member: { id: 'profit-e2e', email: 'profit@example.test', role: owner ? 'owner' : 'operator', status: 'active' }, owner, effectivePermissions: ['statistics.view'], catalog: [] } });
    if (path === '/api/exchange/config') return route.fulfill({ json: { assets: [], fiatCurrencies: ['EUR', 'USD'], settlementOptions: [], manualSettlementOptions: [], instantSettlementOptions: [], providers: [], capabilities: { instantQuotes: true, instantOrders: true } } });
    if (path === '/api/site-content') return route.fulfill({ json: {} });
    if (path === '/api/site-navigation') return route.fulfill({ json: [] });
    if (path === '/api/admin/profit-dashboard' && req.method() === 'GET') {
      requests.push({ path, method: 'GET', url: req.url() });
      return route.fulfill({ json: report(owner, Number(url.searchParams.get('page') || 1)) });
    }
    if (path === '/api/admin/profit-dashboard.csv') {
      requests.push({ path, method: req.method(), url: req.url() });
      return route.fulfill({ contentType: 'text/csv; charset=utf-8', body: 'order_id,currency,net_profit\\nfixture-order,EUR,4.5\\n' });
    }
    if (req.method() === 'POST') {
      requests.push({ path, method: 'POST', url: req.url(), body: req.postDataJSON() });
      return route.fulfill({ json: { ok: true, id: 'fixture-write-only' } });
    }
    // Isolate all other API traffic; never contact backend services/providers.
    return route.fulfill({ status: 404, json: { error: 'Isolated frontend fixture: no matching API response' } });
  });
  return requests;
}

async function goDashboard(page: Page, owner = true, theme = 'light') {
  const requests = await fixture(page, owner, theme);
  await page.goto('/admin/revenue', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByTestId('table-profit')).toBeVisible();
  await page.evaluate(t => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
  return requests;
}

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`${viewport.width}px ${theme}: profit dashboard layout and fixture data`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await goDashboard(page, true, theme);
      await expect(page.getByTestId('profit-summary-EUR')).toContainText('4.5');
      await expect(page.getByTestId('profit-summary-USD')).toContainText('4.6');
      await expect(page.getByText('Customer volume (not revenue):')).toBeVisible();
      await expect(page.getByTestId('table-profit')).toContainText('Customer rate');
      await expect(page.getByTestId('table-profit')).toContainText('Costs + fees');
      await expect(page.getByTestId('table-profit')).toContainText('Profit unavailable');
      await expect(page.getByTestId('table-profit').locator('tbody tr')).toHaveCount(25);
      const scrollState = await page.evaluate(() => ({
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        wrapOverflow: [...document.querySelectorAll('.pd-table-panel .table-wrap')].some(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX !== 'visible'),
      }));
      expect(scrollState.pageOverflow).toBe(false);
      expect(scrollState.wrapOverflow).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`order-profit-${viewport.width}-${theme}.png`), fullPage: true });
    });
  }
}

test('filters, paging, CSV export, order links and isolated owner cost forms', async ({ page }) => {
  const requests = await goDashboard(page);
  const table = page.getByTestId('table-profit');
  await expect(table.locator(`a[href="/admin/orders/${ids.verified}?type=manual"]`)).toBeVisible();
  await expect(table.locator(`a[href="/admin/orders/${ids.loss}?type=instant"]`)).toBeVisible();
  await expect(table.locator('tbody tr').filter({ hasText: ids.loss }).locator('.pd-money.is-loss')).toContainText('-16');
  await expect(table.locator('tbody tr').filter({ hasText: ids.verified }).locator('.pd-money.is-profit').last()).toContainText('4.5');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect.poll(() => requests.some(r => r.method === 'GET' && new URL(r.url).searchParams.get('page') === '2')).toBe(true);
  await page.locator('.pd-filters input[type="date"]').nth(0).fill('2026-05-01');
  await page.locator('.pd-filters input[type="date"]').nth(1).fill('2026-05-31');
  const selects = page.locator('.pd-filters select');
  await selects.nth(0).selectOption('EUR');
  await selects.nth(1).selectOption('SEPA');
  await selects.nth(2).selectOption('Swap');
  await selects.nth(3).selectOption('profit');
  await page.getByTestId('input-profit-search').fill('BTC');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect.poll(() => requests.some(r => {
    const q = new URL(r.url).searchParams;
    return q.get('from') === '2026-05-01' && q.get('to') === '2026-05-31' && q.get('currency') === 'EUR' && q.get('paymentMethod') === 'SEPA' && q.get('type') === 'Swap' && q.get('profit') === 'profit' && q.get('search') === 'BTC' && q.get('page') === '1';
  })).toBe(true);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('button-export-profit').click()]);
  expect(download.suggestedFilename()).toMatch(/^profit-2026-05-01-2026-05-31\.csv$/);
  expect(requests.some(r => r.path.endsWith('.csv') && new URL(r.url).searchParams.get('currency') === 'EUR' && new URL(r.url).searchParams.get('search') === 'BTC')).toBe(true);
  expect(await readFile((await download.path())!, 'utf8')).toContain('fixture-order,EUR,4.5');

  await page.getByRole('button', { name: 'Reset' }).click();
  const missingRow = table.locator('tbody tr').filter({ hasText: ids.missing });
  await missingRow.getByRole('button', { name: 'Record verified costs' }).click();
  const detail = page.getByTestId('profit-row-detail');
  await detail.getByTestId('button-record-costs').click();
  await expect(detail).toContainText('Record verified historical costs');
  const basisForm = detail.locator('form.pd-subform').first();
  const save = basisForm.getByRole('button', { name: 'Save basis' });
  await expect(save).toBeDisabled();
  await basisForm.getByLabel('Source unit value').fill('0');
  await basisForm.locator('textarea').fill('short');
  await basisForm.getByRole('checkbox').check();
  await expect(save).toBeDisabled();
  expect(requests.filter(r => r.method === 'POST' && r.path.endsWith('/basis'))).toHaveLength(0);
  await basisForm.getByLabel('Source unit value').fill('1');
  await basisForm.getByLabel('Target unit cost').fill('0.88');
  await basisForm.getByLabel('Provider fee (per order, EUR)').fill('2.10');
  await basisForm.getByLabel('Network fee (per order, EUR)').fill('1.20');
  await basisForm.getByLabel('Bank fee (per order, EUR)').fill('0');
  await basisForm.getByLabel('Other fee (per order, EUR)').fill('0');
  await basisForm.locator('textarea').fill('Verified settlement receipt 0042');
  await expect(save).toBeEnabled();
  await basisForm.getByRole('checkbox').check();
  await expect(save).toBeEnabled();
  await save.click();
  const basisPost = requests.find(r => r.method === 'POST' && r.path.endsWith('/basis'));
  expect(basisPost?.body).toMatchObject({ currency: 'EUR', sourceUnitValue: '1', targetUnitCost: '0.88', providerFee: '2.10', networkFee: '1.20', bankFee: '0', otherFee: '0', evidence: 'Verified settlement receipt 0042', costsVerified: true });
  expect(basisPost?.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(requests.every(r => !r.method.startsWith('POST') || r.path.includes('/profit-dashboard/'))).toBe(true);
});

test('details preserve audit history, reversed costs, adjustments, route version timing and future-only wording', async ({ page }) => {
  const requests = await goDashboard(page);
  const verifiedRow = page.getByTestId('table-profit').locator('tbody tr').filter({ hasText: ids.verified });
  await verifiedRow.getByRole('button', { name: 'Details' }).click();
  const detail = page.getByTestId('profit-row-detail');
  await expect(detail).toContainText('Immutable history');
  await expect(detail).toContainText('Provider fill statement #E2E-51');
  await expect(detail.getByRole('link', { name: 'Open order' })).toHaveAttribute('href', `/admin/orders/${ids.verified}?type=manual`);
  await page.getByRole('button', { name: 'Close detail' }).click();
  await page.getByTestId('table-profit').locator('tbody tr').filter({ hasText: ids.reversed }).getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('profit-row-detail')).toContainText('Reversed order: the base spread is excluded');
  await expect(page.getByTestId('profit-row-detail')).toContainText('Unrecoverable network fee after reversal');
  await expect(page.getByTestId('profit-row-detail').getByRole('button', { name: 'Record verified costs' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close detail' }).click();
  await expect(page.locator('.pd-rate-form')).toContainText('Past orders are never re-valued');
  await expect(page.locator('.pd-rate-form')).toContainText('effective time');
  const rateForm = page.locator('.pd-rate-form');
  await expect(rateForm).toContainText('Past orders are never re-valued');
  await expect(rateForm).toContainText('after its effective time');
  const saveRate = rateForm.getByRole('button', { name: 'Save version' });
  await rateForm.getByTestId('select-rate-from').selectOption('BTC');
  await rateForm.getByTestId('select-rate-to').selectOption('USDT');
  await rateForm.getByLabel('Source network / payment method').fill('Bitcoin');
  await rateForm.getByLabel('Target network / payment method').fill('TRC20');
  await rateForm.getByLabel('Source unit value').fill('84000');
  await rateForm.getByLabel('Target unit cost').fill('0.90');
  await rateForm.getByLabel('Provider fee (per order, EUR)').fill('2.00');
  await rateForm.getByLabel('Network fee (per order, EUR)').fill('1.00');
  await rateForm.getByLabel('Bank fee (per order, EUR)').fill('0');
  await rateForm.getByLabel('Other fee (per order, EUR)').fill('0');
  await rateForm.locator('textarea').fill('future route rate evidence 07');
  await expect(saveRate).toBeDisabled();
  await rateForm.getByRole('checkbox').check();
  await expect(saveRate).toBeEnabled();
  await saveRate.click();
  expect(requests.find(r => r.method === 'POST' && r.path.endsWith('/rates'))?.body).toMatchObject({ fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20', currency: 'EUR', sourceUnitValue: '84000', targetUnitCost: '0.90', providerFee: '2.00', networkFee: '1.00', bankFee: '0', otherFee: '0', evidence: 'future route rate evidence 07', costsVerified: true });
  await expect(rateForm).toContainText('Version saved. Applies to future orders only.');
  await expect(verifiedRow).toContainText('4.5');

  await verifiedRow.getByRole('button', { name: 'Details' }).click();
  const correction = page.getByTestId('profit-row-detail');
  await correction.getByTestId('button-record-costs').click();
  const correctionForm = correction.locator('form.pd-subform').first();
  await correctionForm.getByLabel('Source unit value').fill('1');
  await correctionForm.getByLabel('Target unit cost').fill('0.8905');
  await correctionForm.getByLabel('Provider fee (per order, EUR)').fill('2');
  await correctionForm.getByLabel('Network fee (per order, EUR)').fill('1');
  await correctionForm.getByLabel('Bank fee (per order, EUR)').fill('0.5');
  await correctionForm.getByLabel('Other fee (per order, EUR)').fill('0');
  await correctionForm.locator('textarea').fill('corrective actual fill invoice');
  await correctionForm.getByRole('checkbox').check();
  await correctionForm.getByRole('button', { name: 'Save basis' }).click();
  expect(requests.find(r => r.method === 'POST' && r.path.endsWith('/basis'))?.body).toMatchObject({ currency: 'EUR', sourceUnitValue: '1', targetUnitCost: '0.8905', providerFee: '2', networkFee: '1', bankFee: '0.5', otherFee: '0', evidence: 'corrective actual fill invoice', costsVerified: true });
  const adjustmentForm = correction.locator('form.pd-subform').last();
  await adjustmentForm.getByLabel('Amount (signed)').fill('-1.25');
  await adjustmentForm.getByLabel('Reason').fill('additional bank settlement fee');
  await adjustmentForm.getByRole('button', { name: 'Append' }).click();
  expect(requests.find(r => r.method === 'POST' && r.path.endsWith('/adjustments'))?.body).toMatchObject({ currency: 'EUR', amount: '-1.25', reason: 'additional bank settlement fee' });
  expect(requests.filter(r => r.method === 'POST').every(r => r.path.startsWith('/api/admin/profit-dashboard/'))).toBe(true);
});

test('non-owner is read-only and dashboard network errors are explicit', async ({ page }) => {
  test.setTimeout(90_000);
  await goDashboard(page, false);
  await expect(page.getByText('Read-only view. Only the Owner can record costs, versions and adjustments.')).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).nth(0).click();
  await expect(page.getByTestId('profit-row-detail').getByRole('button', { name: 'Record verified costs' })).toHaveCount(0);
  await expect(page.getByTestId('profit-row-detail').locator('form')).toHaveCount(0);

  await page.close();
  const errorPage = await page.context().newPage();
  await errorPage.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/languages') return route.fulfill({ json: { enabledLanguages: ['en', 'fr', 'de', 'ru', 'es', 'ko', 'uk'], fallbackLanguage: 'en', revision: 'e2e' } });
    if (path.startsWith('/api/languages/dictionaries/')) return route.fulfill({ json: { translations: {} } });
    if (path === '/api/account/affiliate/attribution') return route.fulfill({ json: { status: 'no_referral' } });
    if (path === '/api/admin/operators') return route.fulfill({ json: [{ id: 'profit-error-e2e', email: 'error@example.test', role: 'owner', status: 'active' }] });
    if (path === '/api/exchange/config') return route.fulfill({ json: { assets: [], fiatCurrencies: ['EUR', 'USD'], settlementOptions: [], manualSettlementOptions: [], instantSettlementOptions: [], providers: [], capabilities: { instantQuotes: true, instantOrders: true } } });
    if (path === '/api/site-content') return route.fulfill({ json: {} });
    if (path === '/api/site-navigation') return route.fulfill({ json: [] });
    if (path === '/api/admin/authorization') return route.fulfill({ json: { member: { id: 'error-e2e', email: 'error@example.test', role: 'owner', status: 'active' }, owner: true, effectivePermissions: ['statistics.view'], catalog: [] } });
    if (path === '/api/admin/profit-dashboard') return route.fulfill({ status: 503, json: { error: 'Fixture report unavailable' } });
    return route.fulfill({ status: 404, json: { error: 'Isolated frontend fixture' } });
  });
  await errorPage.goto('/admin/revenue');
  await expect(errorPage.getByText('The profit report could not be loaded.')).toBeVisible({ timeout: 30_000 });
  await expect(errorPage.getByTestId('profit-summary-EUR')).toHaveCount(0);
  await expect(errorPage.getByTestId('table-profit')).toHaveCount(0);
});
