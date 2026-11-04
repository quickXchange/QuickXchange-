import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60_000);

const ids = { sell: 'QX-TRADE-BTC-SELL', buy: 'QX-TRADE-BTC-BUY', pending: 'QX-TRADE-PENDING', loss: 'QX-TRADE-FUTURE-LOSS', convert: 'QX-TRADE-CONVERT' };
const legacy = { currency: 'EUR', sourceUnitValue: '1', targetUnitCost: '1', providerFee: '99', networkFee: '40', bankFee: '20', otherFee: '10', evidence: 'old provider basis evidence', costsVerified: true };
const rows: any[] = [
  { key: ids.sell, id: ids.sell, type: 'Swap', createdAt: '2026-06-01T10:00:00Z', completedAt: '2026-06-01T10:05:00Z', status: 'completed', fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'EUR', toNetwork: 'SEPA', amount: '1', receiveAmount: '61000', paymentMethod: 'SEPA', customerRate: '61000', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.sell}?type=manual`, audit: [] },
  { key: ids.buy, id: ids.buy, type: 'Swap', createdAt: '2026-06-02T10:00:00Z', completedAt: '2026-06-02T10:05:00Z', status: 'completed', fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin', amount: '15000', receiveAmount: '0.25', paymentMethod: 'SEPA', customerRate: '0.0000166667', basis: legacy, basisId: 'old-basis', revenue: '15000', acquisitionCost: '0.25', fees: '169', grossSpread: '14999.75', netProfit: '14830.75', adjustments: '0', state: 'verified', href: `/admin/orders/${ids.buy}?type=manual`, audit: [{ id: 'old-audit', kind: 'Historical basis', currency: 'EUR', amount: null, reason: 'old provider basis evidence', createdAt: '2026-06-02T10:06:00Z' }] },
  { key: ids.pending, id: ids.pending, type: 'Swap', createdAt: '2026-06-03T10:00:00Z', completedAt: null, status: 'processing', fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin', amount: '100', receiveAmount: '0.001', paymentMethod: 'SEPA', customerRate: null, basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'not_completed', href: `/admin/orders/${ids.pending}?type=manual`, audit: [] },
  { key: ids.loss, id: ids.loss, type: 'Swap', createdAt: '2026-06-04T10:00:00Z', completedAt: '2026-06-04T10:05:00Z', status: 'completed', fromAsset: 'FUTURECOIN', fromNetwork: 'new-chain', toAsset: 'EUR', toNetwork: 'SEPA', amount: '0.25', receiveAmount: '90', paymentMethod: 'SEPA', customerRate: '360', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.loss}?type=manual`, audit: [] },
  { key: ids.convert, id: ids.convert, type: 'Convert', createdAt: '2026-06-05T10:00:00Z', completedAt: '2026-06-05T10:05:00Z', status: 'completed', fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'EUR', toNetwork: 'SEPA', amount: '1', receiveAmount: '50000', paymentMethod: 'Convert', customerRate: '50000', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.convert}?type=instant`, audit: [] },
];
const period = (profit: string, orders: number) => [{ currency: 'EUR', profit, orders }];

function report(owner: boolean, saved = false) {
  const rs = rows.map(r => r.key === ids.sell && saved ? { ...r, basis: { calculation: 'trade', currency: 'EUR', quantitySide: 'source', buyMode: 'total', sellMode: 'total', buyValue: '60000', sellValue: '61000', buyCurrency: 'EUR', sellCurrency: 'EUR', buyFx: '1', sellFx: '1', commission1Percent: '1', receivingCommissionPercent: '0.5', additionalFixedFee: '10', evidence: 'exchange fills verified', costsVerified: true }, basisId: 'trade-e2e', revenue: '61000', acquisitionCost: '60000', fees: '915', grossSpread: '1000', netProfit: '85', state: 'verified', tradeDetails: { asset: 'BTC', quantity: '1', buyTotal: '60000', sellTotal: '61000', commission1: '600', receivingCommission: '305', additionalFixedFee: '10' } } : r);
  return {
    rows: rs, total: rs.length, page: 1, pageSize: 25, owner, currencies: ['EUR', 'USD', 'GBP', 'BTC', 'FUTURECOIN', 'ZETA9'],
    routes: [{ fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin' }], methods: ['SEPA'],
    rules: [{ id: 'future-rule', effectiveAt: '2026-06-01T00:00:00Z', ...legacy, fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin' }],
    summary: saved ? [{ currency: 'EUR', revenue: '61000', acquisitionCost: '60000', fees: '915', costs: '60915', profit: '85', adjustments: '0', valued: 1 }] : [],
    completedOrders: 4, missingCosts: saved ? 3 : 4, volume: [{ currency: 'EUR', amount: '76190' }, { currency: 'FUTURECOIN', amount: '0.25' }],
    assetKinds: { BTC: 'crypto', EUR: 'fiat', USD: 'fiat', GBP: 'fiat' },
    periods: { asOf: '2026-06-06T12:00:00Z', timeZone: 'UTC', dateBasis: 'order_creation', daily: saved ? period('85', 1) : [], weekly: saved ? period('85', 1) : [], monthly: saved ? period('85', 1) : [], total: saved ? period('85', 1) : [] },
  };
}

async function fixture(page: Page, owner = true) {
  const posts: { path: string; body: any }[] = [];
  let saved = false, failedOnce = false;
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/languages') return route.fulfill({ json: { enabledLanguages: ['en'], fallbackLanguage: 'en', revision: 'trade-e2e' } });
    if (path.startsWith('/api/languages/dictionaries/')) return route.fulfill({ json: { translations: {} } });
    if (path === '/api/account/affiliate/attribution') return route.fulfill({ json: { status: 'no_referral' } });
    if (path === '/api/admin/operators') return route.fulfill({ json: [{ id: 'trade-e2e', email: 'trade@example.test', role: owner ? 'owner' : 'operator', status: 'active', linkedToClerk: true }] });
    if (path === '/api/admin/authorization') return route.fulfill({ json: { member: { id: 'trade-e2e', email: 'trade@example.test', role: owner ? 'owner' : 'operator', status: 'active' }, owner, effectivePermissions: ['statistics.view'], catalog: [] } });
    if (path === '/api/exchange/config') return route.fulfill({ json: { assets: [], fiatCurrencies: ['EUR', 'USD'], settlementOptions: [], manualSettlementOptions: [], instantSettlementOptions: [], providers: [], capabilities: { instantQuotes: true, instantOrders: true } } });
    if (path === '/api/site-content') return route.fulfill({ json: {} });
    if (path === '/api/site-navigation') return route.fulfill({ json: [] });
    if (path === '/api/admin/profit-dashboard' && req.method() === 'GET') return route.fulfill({ json: report(owner, saved) });
    if (path === `/api/admin/profit-dashboard/orders/Swap/${ids.sell}/trade` && req.method() === 'POST') {
      const body = req.postDataJSON(); posts.push({ path, body });
      if (!failedOnce) { failedOnce = true; return route.fulfill({ status: 503, json: { error: 'fixture retry' } }); }
      saved = true; return route.fulfill({ json: { id: 'trade-e2e', replay: false } });
    }
    if (req.method() === 'POST') return route.fulfill({ status: 500, json: { error: `Unexpected isolated POST ${path}` } });
    return route.fulfill({ status: 404, json: { error: `Unmatched isolated fixture ${path}` } });
  });
  return { posts };
}

async function dashboard(page: Page, owner = true) {
  const f = await fixture(page, owner);
  await page.goto('/admin/revenue', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByTestId('table-profit')).toBeVisible({ timeout: 60_000 });
  return f;
}

test('owner records actual trade with exact preview, validation, retry idempotency and refreshed periods', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { posts } = await dashboard(page);
  await expect(page.getByTestId('profit-periods')).toContainText('order creation date');
  await expect(page.getByTestId('profit-periods')).toContainText('as of 2026-06-06 12:00 UTC');
  const table = page.getByTestId('table-profit');
  await expect(table).toContainText('FUTURECOIN');
  await expect(page.getByTestId('select-rate-from').locator('option').filter({ hasText: 'ZETA9' })).toHaveCount(1);
  await expect(table.locator('tbody tr').filter({ hasText: ids.pending })).toContainText('Profit unavailable');
  await table.locator('tbody tr').filter({ hasText: ids.pending }).getByRole('button', { name: 'Details' }).click();
  const pendingDetail = page.getByTestId('profit-row-detail');
  await expect(pendingDetail.getByRole('button', { name: 'Record actual trade (buy / sell)' })).toHaveCount(0);
  await expect(pendingDetail).toContainText('no costs can be recorded until it completes');
  await expect(page.getByTestId('button-open-trade-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close detail' }).click();
  await table.locator('tbody tr').filter({ hasText: ids.convert }).getByRole('button', { name: 'Record verified costs' }).click();
  await expect(page.getByTestId('button-open-trade-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close detail' }).click();

  await table.locator('tbody tr').filter({ hasText: ids.sell }).getByRole('button', { name: 'Record verified costs' }).click();
  await page.getByTestId('button-open-trade-editor').click();
  const form = page.getByTestId('form-trade-editor');
  await expect(form.getByTestId('radio-qty-source')).toHaveAttribute('aria-checked', 'true');
  await expect(form.getByTestId('radio-qty-source')).toContainText('1 BTC');
  await expect(form.getByTestId('radio-qty-target')).toContainText('61000 EUR');
  await expect(form.getByTestId('input-buy-fx')).toHaveCount(0);
  await expect(form.getByTestId('input-sell-fx')).toHaveCount(0);
  await form.getByTestId('input-buy-value').fill('60000');
  await form.getByTestId('input-sell-value').fill('61000');
  await expect(form.getByTestId('trade-preview')).toContainText('1 BTC');
  await expect(form.getByTestId('trade-preview')).toContainText('Gross profit');
  await expect(form.getByTestId('trade-preview')).toContainText('1,000 EUR');
  await expect(form.getByTestId('trade-preview')).toContainText('Final net profit');
  await expect(form.getByTestId('trade-preview')).toContainText('1,000 EUR');
  const save = form.getByTestId('button-save-trade');
  await expect(save).toBeDisabled();
  await form.getByTestId('input-trade-evidence').fill('exchange fills verified');
  await expect(save).toBeDisabled();
  await form.getByTestId('checkbox-trade-verified').check();
  await expect(save).toBeEnabled();

  await form.getByTestId('select-buy-currency').selectOption('USD');
  await expect(form.getByTestId('input-buy-fx')).toBeVisible();
  await expect(form.getByTestId('input-buy-fx')).toHaveValue('');
  await expect(save).toBeDisabled();
  await form.getByTestId('input-buy-fx').fill('0.92');
  await form.getByTestId('select-buy-currency').selectOption('GBP');
  await expect(form.getByTestId('input-buy-fx')).toHaveValue('');
  await expect(save).toBeDisabled();
  await form.getByTestId('select-buy-currency').selectOption('EUR');
  await expect(form.getByTestId('input-buy-fx')).toHaveCount(0);
  await expect(form.getByTestId('input-sell-fx')).toHaveCount(0);
  await form.getByTestId('input-commission1').fill('1');
  await form.getByTestId('input-receiving-commission').fill('0.5');
  await form.getByTestId('input-fixed-fee').fill('10');
  await expect(form.getByTestId('trade-preview')).toContainText('-600');
  await expect(form.getByTestId('trade-preview')).toContainText('-305');
  await expect(form.getByTestId('trade-preview')).toContainText('Final net profit');
  await expect(form.getByTestId('trade-preview')).toContainText('85 EUR');
  const layout = await page.evaluate(() => ({ pageOverflow: document.documentElement.scrollWidth > innerWidth, tableCanScroll: [...document.querySelectorAll('.pd-table-panel .table-wrap')].some(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX !== 'visible') }));
  expect(layout).toEqual({ pageOverflow: false, tableCanScroll: true });
  await page.screenshot({ path: testInfo.outputPath('trade-editor-desktop.png') });

  const expected = { calculation: 'trade', currency: 'EUR', quantitySide: 'source', buyMode: 'total', sellMode: 'total', buyValue: '60000', sellValue: '61000', buyCurrency: 'EUR', sellCurrency: 'EUR', buyFx: '1', sellFx: '1', commission1Percent: '1', receivingCommissionPercent: '0.5', additionalFixedFee: '10', evidence: 'exchange fills verified', costsVerified: true };
  await save.click();
  await expect(form).toContainText('fixture retry');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toMatchObject(expected);
  expect(posts[0].body).not.toHaveProperty('quantity');
  expect(posts[0].body).not.toHaveProperty('amount');
  expect(posts[0].body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  const requestId = posts[0].body.requestId;
  await save.click();
  await expect(page.getByTestId('profit-summary-EUR')).toContainText('85');
  await expect(page.getByTestId('profit-periods')).toContainText('85');
  expect(posts).toHaveLength(2);
  expect(posts[1].body).toMatchObject(expected);
  expect(posts[1].body.requestId).toBe(requestId);
  await expect(page.getByTestId('table-profit').locator('tbody tr').filter({ hasText: ids.sell })).toContainText('85');
  expect(posts.every(p => p.path === `/api/admin/profit-dashboard/orders/Swap/${ids.sell}/trade`)).toBe(true);
});

test('completed BUY uses target crypto quantity; legacy fees are warned, non-owner cannot edit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dashboard(page);
  const table = page.getByTestId('table-profit');
  await table.locator('tbody tr').filter({ hasText: ids.buy }).getByRole('button', { name: 'Details' }).click();
  const detail = page.getByTestId('profit-row-detail');
  await detail.getByTestId('button-open-trade-editor').click();
  const form = page.getByTestId('form-trade-editor');
  await expect(form.getByTestId('radio-qty-target')).toHaveAttribute('aria-checked', 'true');
  await expect(form.getByTestId('radio-qty-target')).toContainText('0.25 BTC');
  await expect(form).toContainText('Old fees are not added again');
  await page.close();
  const nonOwner = await page.context().newPage();
  await dashboard(nonOwner, false);
  await nonOwner.getByTestId('table-profit').locator('tbody tr').filter({ hasText: ids.sell }).getByRole('button', { name: 'Details' }).click();
  await expect(nonOwner.getByTestId('button-open-trade-editor')).toHaveCount(0);
  await expect(nonOwner.getByTestId('profit-row-detail').locator('form')).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`390px ${theme}: trade editor fits viewport and table remains swipeable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const f = await dashboard(page);
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByTestId('table-profit').locator('tbody tr').filter({ hasText: ids.sell }).getByRole('button', { name: 'Record verified costs' }).click();
    await page.getByTestId('button-open-trade-editor').click();
    await expect(page.getByTestId('form-trade-editor')).toBeVisible();
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, scrollable: [...document.querySelectorAll('.pd-table-panel .table-wrap')].some(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX !== 'visible') }));
    expect(state).toEqual({ overflow: false, scrollable: true });
    await page.screenshot({ path: testInfo.outputPath(`trade-editor-mobile-${theme}.png`) });
    expect(f.posts).toHaveLength(0);
  });
}
