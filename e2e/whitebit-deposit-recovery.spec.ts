import { expect, test } from '@playwright/test';

const orderId = 'QX-44444444-4444-4444-8444-444444444444';
const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: orderId, type: 'manual', status: 'awaiting funds', manualSettlementState: 'awaiting_funds',
  fundingProviderSource: 'whitebit', fundingStatus: 'ready_whitebit', recordVersion: 1,
  fromAsset: 'USDT', fromNetwork: 'TRC20', toAsset: 'EUR', toNetwork: 'SEPA',
  amount: '10', receiveAmount: '0', customerEmail: 'deposit@example.test',
  customerName: 'Synthetic Deposit', customerRegistered: false, provider: 'Manual desk',
  createdAt: '2025-06-12T10:00:00.000Z', ...overrides,
});
const preview = {
  amount: '10.001000000000000000', asset: 'USDT', network: 'TRC20',
  confirmationsActual: 20, confirmationsRequired: 20, status: 'awaiting funds',
  canApply: true, applied: false,
};
const applied = { ...preview, status: 'processing', canApply: false, applied: true };
const auth = (owner: boolean) => ({
  member: { id: 'owner-e2e', email: 'owner@example.test', role: owner ? 'owner' : 'operator', status: 'active' },
  owner, effectivePermissions: owner ? [] : ['orders.view', 'orders.status', 'orders.confirm_payment'], catalog: [],
});

async function setup(page: import('@playwright/test').Page, owner = true, canApply = true) {
  let state = makeOrder();
  const reconcile: unknown[] = [];
  const forbidden: string[] = [];
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (path === '/api/languages') return route.fulfill({ json: {
      enabledLanguages:['en','fr','de','ru','es','ko','uk'],fallbackLanguage:'en',revision:'e2e',
    }});
    if (path.startsWith('/api/languages/dictionaries/')) return route.fulfill({ json: { translations:{} } });
    if (path === '/api/admin/authorization') return route.fulfill({ json: auth(owner) });
    if (path === '/api/admin/summary') return route.fulfill({ json: {
      product:'swap', totalOrders:1, pendingOrders:1, completedOrders:0, failedCancelledOrders:0,
      totalCustomers:0,totalUsers:0,completionRate:0,averageCompletionTimeMinutes:null,
      averageOrderValueUsd:0,topPaymentMethods:[],topCurrencies:[],topTradingPairs:[],dailySeries:[],recentActivity:[],
      valuation:{status:'unavailable',valuedOrders:0,totalOrders:0,unavailableCurrencies:[]},
      operationalHealth:{providerFreshness:{state:'healthy',syncing:false},catalog:{stale:false},
        unresolvedOrders:0,notificationsPending:0,notificationsFailed:0},
    }});
    if (path === '/api/admin/operators') return route.fulfill({ json: [] });
    if (path === '/api/account/affiliate/attribution') return route.fulfill({ json: { status:'no_referral' } });
    if (path === '/api/exchange/config') return route.fulfill({ json: {
      assets:[], fiatCurrencies:['EUR'], settlementOptions:[], manualSettlementOptions:[], instantSettlementOptions:[],
      providers:[], capabilities:{instantQuotes:true,instantOrders:true},
    }});
    if (path === '/api/orders' && req.method() === 'GET') return route.fulfill({ json: {items:[state],total:1,page:1,pageSize:25} });
    if (path === `/api/orders/${orderId}/audit-log`) return route.fulfill({ json: [] });
    if (path === `/api/orders/${orderId}` && req.method() === 'GET') return route.fulfill({ json: state });
    if (path === '/api/admin/whitebit/reconcile' && req.method() === 'POST') {
      const body = req.postDataJSON();
      reconcile.push(body);
      if (body.apply && canApply) state = makeOrder({status:'processing',manualSettlementState:'funds_confirmed',recordVersion:2});
      return route.fulfill({ json: body.apply ? applied : { ...preview, canApply } });
    }
    if (/\/api\/(payments|payouts)\b/.test(path) ||
      (req.method() !== 'GET' && path !== '/api/admin/whitebit/reconcile')) forbidden.push(`${req.method()} ${path}`);
    return route.fulfill({ json: [] });
  });
  return { reconcile, forbidden };
}

test('owner reviews a saved WhiteBIT deposit before explicit apply; cancel is read-only', async ({ page }) => {
  const { reconcile, forbidden } = await setup(page);
  await page.goto('/admin/orders?type=manual');
  await page.getByTestId(`row-order-${orderId}`).click();
  await expect(page.getByTestId('whitebit-deposit-recovery')).toBeVisible();
  await expect(page.getByTestId('order-details-drawer')).toBeVisible();
  const recovery = page.getByTestId('whitebit-deposit-recovery');
  await expect(recovery.getByRole('button', { name:'Review confirmed deposit' })).toBeEnabled();
  const bounds = async () => recovery.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left:r.left, right:r.right, width:r.width, viewport:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth };
  });
  await recovery.scrollIntoViewIfNeeded();
  const desktopBounds = await bounds();
  await page.screenshot({path:'test-results/whitebit-owner-drawer-desktop.png'});
  await expect.poll(async () => (await bounds()).right).toBeLessThanOrEqual(1280);
  await expect.poll(async () => (await bounds()).left).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await bounds()).scroll).toBeLessThanOrEqual(1280);
  await page.setViewportSize({width:375,height:812});
  const mobileViewport = await page.evaluate(() => document.documentElement.clientWidth);
  await expect.poll(async () => (await bounds()).left).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await bounds()).right).toBeLessThanOrEqual(mobileViewport);
  await expect.poll(async () => (await bounds()).scroll).toBeLessThanOrEqual(mobileViewport);
  await page.setViewportSize({width:1280,height:720});
  await recovery.getByRole('button', { name:'Review confirmed deposit' }).click();
  await expect(page.getByTestId('whitebit-recovery-preview')).toContainText('10.001');
  await expect(page.getByTestId('whitebit-recovery-preview')).toContainText('USDT · TRC20');
  await expect(page.getByTestId('whitebit-recovery-preview')).toContainText('20 / 20');
  expect(reconcile).toEqual([{ orderId, apply:false }]);
  await recovery.getByRole('button', { name:'Cancel' }).click();
  await expect(page.getByTestId('whitebit-recovery-preview')).toHaveCount(0);
  expect(reconcile).toEqual([{ orderId, apply:false }]);
  await recovery.getByRole('button', { name:'Review confirmed deposit' }).click();
  await expect(page.getByTestId('whitebit-recovery-preview')).toBeVisible();
  await recovery.getByRole('button', { name:'Apply confirmed deposit' }).click();
  await expect.poll(() => reconcile).toEqual([{orderId,apply:false},{orderId,apply:false},{orderId,apply:true}]);
  await expect(page.getByTestId('select-edit-manual-state')).toHaveValue('funds_confirmed');
  await expect(page.getByTestId('order-status-progression').locator('.quickx-status-active')).toHaveText('2');
  await expect(page.getByTestId('order-status-progression').locator('.quickx-progress-label')).toHaveText(['Created', 'Processing', 'Done']);
  await expect(page.getByText('Deposit synchronized. Payout completion has not been changed.')).toBeVisible();
  expect(forbidden).toEqual([]);
});

test('apply is disabled when saved-deposit evidence cannot be applied', async ({ page }) => {
  const { reconcile } = await setup(page, true, false);
  await page.goto('/admin/orders?type=manual');
  await page.getByTestId(`row-order-${orderId}`).click();
  const recovery = page.getByTestId('whitebit-deposit-recovery');
  await recovery.getByRole('button', {name:'Review confirmed deposit'}).click();
  await expect(page.getByTestId('whitebit-recovery-preview')).toContainText('has not yet met');
  await expect(recovery.getByRole('button', {name:'Apply confirmed deposit'})).toBeDisabled();
  expect(reconcile).toEqual([{orderId,apply:false}]);
});

test('non-owner cannot see WhiteBIT deposit recovery controls', async ({ page }) => {
  await setup(page, false);
  await page.goto('/admin/orders?type=manual');
  await page.getByTestId(`row-order-${orderId}`).click();
  await expect(page.getByTestId('order-details-drawer')).toBeVisible();
  await expect(page.getByTestId('whitebit-deposit-recovery')).toHaveCount(0);
});
