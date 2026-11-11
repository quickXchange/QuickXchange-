import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60_000);

const ids = { sell: 'QX-TRADE-BTC-SELL', buy: 'QX-TRADE-BTC-BUY', loss: 'QX-TRADE-FUTURE-LOSS', convert: 'QX-TRADE-CONVERT' };
const legacy = { currency: 'EUR', sourceUnitValue: '1', targetUnitCost: '1', providerFee: '99', networkFee: '40', bankFee: '20', otherFee: '10', evidence: 'old provider basis evidence', costsVerified: true };
const rows: any[] = [
  { key: ids.sell, id: ids.sell, type: 'Swap', createdAt: '2026-06-01T10:00:00Z', completedAt: '2026-06-01T10:05:00Z', status: 'completed', fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'EUR', toNetwork: 'SEPA', amount: '1', receiveAmount: '61000', paymentMethod: 'SEPA', customerRate: '61000', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.sell}?type=manual`, audit: [] },
  { key: ids.buy, id: ids.buy, type: 'Swap', createdAt: '2026-06-02T10:00:00Z', completedAt: '2026-06-02T10:05:00Z', status: 'completed', fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin', amount: '15000', receiveAmount: '0.25', paymentMethod: 'SEPA', customerRate: '0.0000166667', basis: legacy, basisId: 'old-basis', revenue: '15000', acquisitionCost: '0.25', fees: '169', grossSpread: '14999.75', netProfit: '14830.75', adjustments: '0', state: 'verified', href: `/admin/orders/${ids.buy}?type=manual`, audit: [{ id: 'old-audit', kind: 'Historical basis', currency: 'EUR', amount: null, reason: 'old provider basis evidence', createdAt: '2026-06-02T10:06:00Z' }] },
  { key: ids.loss, id: ids.loss, type: 'Swap', createdAt: '2026-06-04T10:00:00Z', completedAt: '2026-06-04T10:05:00Z', status: 'completed', fromAsset: 'FUTURECOIN', fromNetwork: 'new-chain', toAsset: 'EUR', toNetwork: 'SEPA', amount: '0.25', receiveAmount: '90', paymentMethod: 'SEPA', customerRate: '360', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.loss}?type=manual`, audit: [] },
  { key: ids.convert, id: ids.convert, type: 'Convert', createdAt: '2026-06-05T10:00:00Z', completedAt: '2026-06-05T10:05:00Z', status: 'completed', fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'EUR', toNetwork: 'SEPA', amount: '1', receiveAmount: '50000', paymentMethod: 'Convert', customerRate: '50000', basis: null, basisId: null, revenue: null, acquisitionCost: null, fees: null, grossSpread: null, netProfit: null, adjustments: '0', state: 'missing', href: `/admin/orders/${ids.convert}?type=instant`, audit: [] },
];
const period = (profit: string, orders: number) => [{ currency: 'EUR', profit, orders }];

function report(owner: boolean, saved = false) {
  const rs = rows.map(r => r.key === ids.sell && saved ? { ...r, basis: { calculation: 'trade', currency: 'EUR', quantitySide: 'source', buyMode: 'unit', sellMode: 'unit', buyValue: '60000', sellValue: '61000', buyCurrency: 'EUR', sellCurrency: 'EUR', buyFx: '1', sellFx: '1', commission1Percent: '1', receivingCommissionPercent: '0.5', additionalFixedFee: '0', evidence: 'Owner override of completion accounting rates', costsVerified: true }, basisId: 'trade-e2e', revenue: '61000', acquisitionCost: '60000', fees: '905', grossSpread: '1000', netProfit: '95', state: 'verified', tradeDetails: { asset: 'BTC', quantity: '1', buyTotal: '60000', sellTotal: '61000', commission1: '600', receivingCommission: '305', additionalFixedFee: '0' } } : r);
  return {
    rows: rs, total: rs.length, page: 1, pageSize: 25, owner, currencies: ['EUR', 'USD', 'GBP', 'BTC', 'FUTURECOIN', 'ZETA9'],
    routes: [{ fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin' }], methods: ['SEPA'],
    rules: [{ id: 'future-rule', effectiveAt: '2026-06-01T00:00:00Z', ...legacy, fromAsset: 'EUR', fromNetwork: 'SEPA', toAsset: 'BTC', toNetwork: 'Bitcoin' }],
    summary: saved ? [{ currency: 'EUR', revenue: '61000', acquisitionCost: '60000', fees: '905', costs: '60905', profit: '95', adjustments: '0', valued: 1 }] : [],
    completedOrders: 4, missingCosts: saved ? 3 : 4, volume: [{ currency: 'EUR', amount: '76190' }, { currency: 'FUTURECOIN', amount: '0.25' }],
    assetKinds: { BTC: 'crypto', EUR: 'fiat', USD: 'fiat', GBP: 'fiat' },
    myRates: [], rateNetworks: ['Bitcoin', 'SEPA', 'new-chain'],
    periods: { asOf: '2026-06-06T12:00:00Z', timeZone: 'UTC', dateBasis: 'order_creation', daily: saved ? period('95', 1) : [], weekly: saved ? period('95', 1) : [], monthly: saved ? period('95', 1) : [], total: saved ? period('95', 1) : [] },
  };
}

async function fixture(page: Page, owner = true) {
  const posts: { path: string; body: any }[] = [];
  const reportRequests: string[] = [];
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
    if (path === '/api/admin/profit-dashboard' && req.method() === 'GET') {
      reportRequests.push(req.url());
      return route.fulfill({ json: report(owner, saved) });
    }
    if (path === `/api/admin/profit-dashboard/orders/Swap/${ids.sell}/trade` && req.method() === 'POST') {
      const body = req.postDataJSON(); posts.push({ path, body });
      if (!failedOnce) { failedOnce = true; return route.fulfill({ status: 503, json: { error: 'fixture retry' } }); }
      saved = true; return route.fulfill({ json: { id: 'trade-e2e', replay: false } });
    }
    if (req.method() === 'POST') return route.fulfill({ status: 500, json: { error: `Unexpected isolated POST ${path}` } });
    return route.fulfill({ status: 404, json: { error: `Unmatched isolated fixture ${path}` } });
  });
  return { posts, reportRequests };
}

async function dashboard(page: Page, owner = true) {
  const f = await fixture(page, owner);
  await page.goto('/admin/revenue', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByTestId('table-profit')).toBeVisible({ timeout: 60_000 });
  return f;
}

test('owner records per-order unit rates with exact preview, retry idempotency and refreshed periods', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { posts, reportRequests } = await dashboard(page);
  const periods = page.getByTestId('profit-periods');
  await expect(periods).toContainText('Today');
  await expect(periods).toContainText('This week');
  await expect(periods).toContainText('This month');
  await expect(periods).toContainText('UTC');
  const table = page.getByTestId('table-profit');
  await expect(table).toContainText('FUTURECOIN');
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table.locator('tbody tr').filter({ hasText: /processing|pending/i })).toHaveCount(0);
  expect(reportRequests.every(url => new URL(url).searchParams.get('completedOnly') === 'true')).toBe(true);

  const originalRow = page.getByTestId(`row-order-${ids.sell}`);
  await page.getByTestId(`button-edit-order-${ids.sell}`).click();
  const form = page.getByTestId('form-order-edit');
  await expect(form).toBeVisible();
  await expect(form.getByTestId('radio-qty-source')).toHaveAttribute('aria-checked', 'true');
  await expect(form.getByTestId('radio-qty-source')).toContainText('1 BTC');
  await expect(form.getByTestId('radio-qty-target')).toContainText('61000 EUR');
  await expect(form.getByTestId('input-edit-buy')).toHaveValue('');
  await expect(form.getByTestId('input-edit-sell')).toHaveValue('');
  await expect(form.getByTestId('input-edit-buy')).toHaveCount(1);
  await expect(form.getByTestId('input-edit-sell')).toHaveCount(1);
  const save = form.getByTestId('button-save-order-edit');
  await expect(save).toBeDisabled();
  await form.getByTestId('input-edit-buy').fill('60000');
  await form.getByTestId('input-edit-sell').fill('61000');
  await form.getByTestId('input-edit-partner').fill('1');
  await form.getByTestId('input-edit-receiving').fill('0.5');
  await expect(form.getByTestId('trade-preview')).toContainText('Gross');
  await expect(form.getByTestId('trade-preview')).toContainText('1,000');
  await expect(form.getByTestId('trade-preview')).toContainText('Partner fee');
  await expect(form.getByTestId('trade-preview')).toContainText('600');
  await expect(form.getByTestId('trade-preview')).toContainText('Receiving fee');
  await expect(form.getByTestId('trade-preview')).toContainText('305');
  await expect(form.getByTestId('trade-preview')).toContainText('95 EUR');
  await expect(save).toBeEnabled();
  const layout = await page.evaluate(() => ({ pageOverflow: document.documentElement.scrollWidth > innerWidth, tableCanScroll: [...document.querySelectorAll('.pd-table-panel .table-wrap')].some(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX !== 'visible') }));
  expect(layout).toEqual({ pageOverflow: false, tableCanScroll: false });
  await page.screenshot({ path: testInfo.outputPath('order-editor-desktop.png') });

  const expected = {
    calculation: 'trade', currency: 'EUR', quantitySide: 'source',
    buyMode: 'unit', sellMode: 'unit', buyValue: '60000', sellValue: '61000',
    buyCurrency: 'EUR', sellCurrency: 'EUR', buyFx: '1', sellFx: '1',
    commission1Percent: '1', receivingCommissionPercent: '0.5',
    additionalFixedFee: '0', evidence: 'Owner override of completion accounting rates',
    costsVerified: true,
  };
  await save.click();
  await expect(form).toContainText('fixture retry');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toMatchObject(expected);
  for (const immutable of ['quantity', 'amount', 'receiveAmount', 'fromAsset', 'toAsset', 'customerRate']) {
    expect(posts[0].body).not.toHaveProperty(immutable);
  }
  expect(posts[0].body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  const requestId = posts[0].body.requestId;
  await save.click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('revenue-cards')).toContainText(/95\s*EUR/);
  await expect(periods).toContainText(/95\s*EUR/);
  expect(posts).toHaveLength(2);
  expect(posts[1].body).toMatchObject(expected);
  expect(posts[1].body.requestId).toBe(requestId);
  await expect(originalRow).toContainText('BTC → EUR');
  await expect(originalRow).toContainText('95');
  expect(reportRequests.length).toBeGreaterThan(1);
  expect(reportRequests.every(url => new URL(url).searchParams.get('completedOnly') === 'true')).toBe(true);
  expect(posts.every(p => p.path === `/api/admin/profit-dashboard/orders/Swap/${ids.sell}/trade`)).toBe(true);

  await page.getByTestId(`button-edit-order-${ids.sell}`).click();
  const savedForm = page.getByTestId('form-order-edit');
  await expect(savedForm).toContainText('Quantity 1 BTC');
  await expect(savedForm.getByTestId('input-edit-buy')).toHaveValue('60000');
  await expect(savedForm.getByTestId('input-edit-sell')).toHaveValue('61000');
  await savedForm.getByRole('button', { name: 'Close editor' }).click();
});

test('completed BUY uses target crypto quantity; legacy fees are warned, non-owner cannot edit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { posts } = await dashboard(page);
  const table = page.getByTestId('table-profit');
  await page.getByTestId(`button-edit-order-${ids.buy}`).click();
  const form = page.getByTestId('form-order-edit');
  await expect(form.getByTestId('radio-qty-target')).toHaveAttribute('aria-checked', 'true');
  await expect(form.getByTestId('radio-qty-target')).toContainText('0.25 BTC');
  await expect(form).toContainText('Earlier recorded fees of 169 EUR are kept as a fixed fee and counted once, not twice.');
  await form.getByTestId('input-edit-buy').fill('56000');
  await form.getByTestId('input-edit-sell').fill('60000');
  await form.getByTestId('input-edit-partner').fill('1');
  await form.getByTestId('input-edit-receiving').fill('0.5');
  await expect(form.getByTestId('trade-preview')).toContainText('14,000');
  await expect(form.getByTestId('trade-preview')).toContainText('15,000');
  await expect(form.getByTestId('trade-preview')).toContainText('169');
  await expect(form.getByTestId('trade-preview')).toContainText('616 EUR');
  expect(posts).toHaveLength(0);
  await page.close();
  const nonOwner = await page.context().newPage();
  await dashboard(nonOwner, false);
  await expect(nonOwner.getByTestId('table-profit').getByRole('button')).toHaveCount(0);
  await expect(nonOwner.getByTestId('form-order-edit')).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`390px ${theme}: trade editor fits viewport and table remains swipeable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const f = await dashboard(page);
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByTestId(`button-edit-order-${ids.sell}`).click();
    await expect(page.getByTestId('form-order-edit')).toBeVisible();
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, scrollable: [...document.querySelectorAll('.pd-table-panel .table-wrap')].some(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX !== 'visible') }));
    expect(state).toEqual({ overflow: false, scrollable: true });
    await page.screenshot({ path: testInfo.outputPath(`order-editor-mobile-${theme}.png`) });
    expect(f.posts).toHaveLength(0);
  });
}
