import { expect, test, type Page } from '@playwright/test';

const detail = (key: string, label: string, value: string) => ({ key, label, value });
const cases = [
  {
    method: 'SEPA', rows: [
      detail('target_account_holder', 'Account Holder', 'JOHN SMITH'),
      detail('target_iban', 'IBAN', 'FR76 0000 1234'),
      detail('target_reference', 'Payment Reference', 'ORDER PAYMENT'),
    ],
    expected: 'Name: JOHN SMITH\nIBAN: FR76 0000 1234\nPayment Description: ORDER PAYMENT\nAmount: 250.00 EUR',
  },
  {
    method: 'Domestic Bank', rows: [
      detail('target_account_holder', 'Account Holder', 'Jane Example'),
      detail('target_account_number', 'Account Number', '00001234'),
      detail('target_bank', 'Bank Name', 'Saved Customer Bank'),
      detail('target_swift', 'BIC/SWIFT', 'ABCDFRPP'),
    ],
    expected: 'Name: Jane Example\nAccount Number: 00001234\nBank Name: Saved Customer Bank\nBIC/SWIFT: ABCDFRPP\nAmount: 250.00 EUR',
  },
  {
    method: 'Payment Wallet', rows: [detail('target_account_id', 'Payment Account ID', '000-Exact-ID')],
    expected: 'Payment Account ID: 000-Exact-ID\nAmount: 250.00 EUR',
  },
  { method: 'Missing optional fields', rows: [], expected: 'Amount: 250.00 EUR' },
];
const orders = cases.map((scenario, index) => ({
  id: `QX-55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
  type: 'manual', status: 'awaiting funds', manualSettlementState: 'awaiting_funds',
  recordVersion: 1, amount: '999.123456', receiveAmount: '250.00', fromAsset: 'USDT',
  fromNetwork: 'TRC20', toAsset: 'EUR', toNetwork: scenario.method, payoutMethod: scenario.method,
  customerName: 'WRONG PROFILE NAME', customerEmail: 'private@example.test', customerRegistered: false,
  provider: 'Manual desk', createdAt: '2026-10-16T10:00:00.000Z', outcomeUnknown: false,
  paymentDetailsApplicable: true, orderSource: 'website',
  customerSafeNote: 'Customer-visible note', note: 'Internal operator note',
  verifiedFundingTransaction: {
    transactionHash: `0x${String(index + 1).repeat(64)}`,
    networkCode: 'TRC20', networkName: 'TRON', confirmations: 12,
    detectedAt: '2026-10-16T10:15:00.000Z',
    explorerUrl: 'https://example.test/tx',
  },
  step2Details: [
    detail('name', 'Name', 'WRONG PROFILE NAME'),
    detail('telegram', 'Telegram', '@must-not-copy'),
    detail('source_iban', 'IBAN', 'MUST-NOT-COPY-SENDER'),
    ...scenario.rows,
  ],
}));

async function fixtures(page: Page, theme: string, owner = true) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('theme', selectedTheme);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { (window as any).__payoutClipboard = text; } },
    });
  }, theme);
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    // Attribution initialization uses POST, but is read-only and must remain fixture-only.
    if (path === '/api/account/affiliate/attribution') {
      return route.fulfill({ json: { status: 'no_referral' } });
    }
    if (route.request().method() !== 'GET') {
      mutations.push(path);
      return route.fulfill({ status: 405, json: { error: 'Read-only test fixture' } });
    }
    if (path === '/api/admin/authorization') return route.fulfill({ json: {
      member: { id: 'owner-e2e', email: 'owner@example.test', role: owner ? 'owner' : 'operator', status: 'active' },
      owner, effectivePermissions: ['orders.view', 'orders.assign', 'orders.details', 'orders.notes'], catalog: [],
    } });
    if (path === '/api/orders') return route.fulfill({ json: { items: orders, total: orders.length, page: 1, pageSize: 25 } });
    const order = orders.find(item => path === `/api/orders/${item.id}`);
    if (order) return route.fulfill({ json: order });
    if (path.endsWith('/audit-log')) return route.fulfill({ json: [] });
    if (path === '/api/admin/operators') return route.fulfill({ json: [
      { id: 'operator-e2e', email: 'operator@example.test', role: 'operator', status: 'active' },
    ] });
    if (path === '/api/account/affiliate/attribution') return route.fulfill({ json: { status: 'no_referral' } });
    if (path === '/api/exchange/config') return route.fulfill({ json: {
      assets: [], fiatCurrencies: ['EUR'], settlementOptions: [], manualSettlementOptions: [],
      instantSettlementOptions: [], providers: [], capabilities: { instantQuotes: true, instantOrders: true },
    } });
    return route.fallback();
  });
  await page.goto('/admin/orders?type=manual');
  await page.evaluate((selectedTheme) => {
    document.documentElement.classList.toggle('dark', selectedTheme === 'dark');
  }, theme);
  return mutations;
}

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`${theme} ${viewport.width}: saved payout clipboard and complete order drawer`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      const mutations = await fixtures(page, theme);
      for (const [index, scenario] of cases.entries()) {
        await page.getByTestId(`row-order-${orders[index].id}`).click();
        const drawer = page.getByTestId('order-details-drawer');
        await expect(drawer).toBeVisible();
        await expect(page.getByTestId('admin-order-information')).toContainText('Order Source');
        await expect(page.getByTestId('admin-additional-payment-details')).toBeVisible();
        await expect(page.getByTestId('order-status-progression')).toBeVisible();
        await expect(page.getByTestId('admin-transaction-details')).toContainText('TRON');
        await expect(page.getByTestId('admin-transaction-details')).toContainText('12');
        await expect(drawer).toContainText('Customer-visible note');
        await page.getByTestId('button-copy-order-info').click();
        await expect.poll(() => page.evaluate(() => (window as any).__payoutClipboard)).toBe(scenario.expected);
        const colors = await drawer.evaluate(el => {
          const style = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { color: style.color, scheme: style.colorScheme, left: r.left, right: r.right,
            scrollWidth: el.scrollWidth, width: el.clientWidth };
        });
        expect(colors.scheme).toBe(theme);
        expect(colors.color).toBe(theme === 'dark' ? 'rgb(245, 248, 255)' : 'rgb(23, 32, 51)');
        expect(colors.left).toBeGreaterThanOrEqual(-1);
        expect(colors.right).toBeLessThanOrEqual(viewport.width + 1);
        expect(colors.scrollWidth).toBeLessThanOrEqual(colors.width + 1);
        if (index === 0) {
          const muted = drawer.locator('.text-muted-foreground').filter({ hasText: 'Selecting a status saves it immediately.' });
          await expect(muted).toHaveCSS('color', theme === 'dark' ? 'rgb(164, 179, 203)' : 'rgb(82, 97, 118)');
          const transactionLabel = page.getByTestId('verified-transaction').locator('.text-muted-foreground').first();
          await expect(transactionLabel).toHaveCSS('color', theme === 'dark' ? 'rgb(164, 179, 203)' : 'rgb(82, 97, 118)');
          await expect(page.getByTestId('button-close-footer')).toHaveCSS('color', 'rgb(255, 255, 255)');
          await expect(page.getByTestId('button-close-footer')).toHaveCSS('background-image', /linear-gradient/);
          await expect(page.getByTestId('button-copy-order-info')).toHaveCSS('background-image', /linear-gradient/);
          const transaction = page.getByTestId('admin-transaction-details');
          await transaction.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/order-transaction-${theme}-${viewport.width}.png` });
          const note = page.getByText('Customer-visible note', { exact: true });
          await note.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/order-notes-${theme}-${viewport.width}.png` });
          const noteColor = await note.evaluate(el => getComputedStyle(el).color);
          console.log(`Notes text color (${theme}, ${viewport.width}): ${noteColor}`);
          if (theme === 'light') expect(noteColor).toBe('rgb(82, 97, 118)');
          await page.getByTestId('assign-order-options').locator('summary').click();
          await expect(page.getByTestId('section-order-support-tools')).toBeVisible();
          await page.getByTestId('section-order-support-tools').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/order-support-${theme}-${viewport.width}.png` });
          await page.getByTestId('assign-order-options').locator('summary').click();
          await page.getByTestId('button-edit-order').click();
          const input = page.getByTestId('input-receiving-payment-method');
          await expect(input).toBeVisible();
          const field = await input.evaluate(el => ({
            color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
          }));
          expect(field.color).not.toBe(field.background);
          const buttonColors = await page.getByTestId('button-save-order-methods').evaluate(el => ({
            color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
          }));
          expect(buttonColors.color).not.toBe(buttonColors.background);
          await page.getByTestId('order-payment-method-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
          await page.getByTestId('admin-order-information').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/order-view-${theme}-${viewport.width}.png` });
        }
        await page.getByTestId('button-close-footer').click();
        await expect(drawer).toHaveCount(0);
      }
      expect(mutations).toEqual([]);
    });
  }
  test(`${theme}: portaled assignee menu retains theme`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const mutations = await fixtures(page, theme, false);
    await page.getByTestId(`row-order-${orders[0].id}`).click();
    await page.getByTestId('select-order-assignee').click();
    const menu = page.locator('.quickx-order-assignee-menu');
    await expect(menu).toBeVisible();
    const colors = await menu.evaluate(el => ({
      text: getComputedStyle(el).color, surface: getComputedStyle(el).backgroundColor,
    }));
    expect(colors.text).toBe(theme === 'dark' ? 'rgb(245, 248, 255)' : 'rgb(23, 32, 51)');
    expect(colors.surface).toBe(theme === 'dark' ? 'rgb(16, 24, 43)' : 'rgb(255, 255, 255)');
    await page.screenshot({ path: `test-results/order-menu-${theme}-mobile.png` });
    await page.keyboard.press('Escape');
    expect(mutations).toEqual([]);
  });
}
