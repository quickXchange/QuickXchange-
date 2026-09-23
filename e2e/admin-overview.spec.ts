import { expect, test } from '@playwright/test';

const recentSwapOrder = {
  id: 'QX-22222222-2222-4222-8222-222222222222',
  type: 'manual',
  status: 'completed',
  manualSettlementState: 'completed',
  recordVersion: 2,
  fromAsset: 'USD',
  fromNetwork: 'Bank transfer',
  toAsset: 'BTC',
  toNetwork: 'Bitcoin',
  amount: '1200',
  receiveAmount: '0.018',
  customerEmail: 'operator-fixture@example.test',
  customerName: 'Amina Test',
  customerRegistered: true,
  destinationAddress: '',
  destinationMemo: '',
  refundAddress: '',
  refundMemo: '',
  depositAddress: '',
  depositMemo: '',
  paymentMethod: 'Bank transfer',
  payoutMethod: 'Bitcoin',
  provider: 'Manual desk',
  note: '',
  providerReference: '',
  providerOrderId: '',
  providerState: '',
  outcomeUnknown: false,
  providerClaimedDepositAmount: null,
  providerExpectedReceiveAmount: null,
  providerPaidAmount: null,
  providerCreatedAt: null,
  providerUpdatedAt: null,
  providerCompleted: true,
  createdAt: '2025-03-03T10:00:00.000Z',
};

function summary(product: 'swap' | 'convert') {
  const isSwap = product === 'swap';

  return {
    product,
    from: '2025-03-01T00:00:00.000Z',
    to: '2025-03-03T23:59:59.999Z',
    totalOrders: isSwap ? 14 : 7,
    pendingOrders: isSwap ? 3 : 1,
    completedOrders: isSwap ? 10 : 6,
    failedCancelledOrders: isSwap ? 1 : 0,
    totalCustomers: isSwap ? 9 : 5,
    totalUsers: isSwap ? 4 : 2,
    completionRate: isSwap ? 71.4 : 85.7,
    averageCompletionTimeMinutes: isSwap ? 18.5 : null,
    averageOrderValueUsd: isSwap ? 220 : 80,
    topPaymentMethods: [{ method: isSwap ? 'Bank transfer' : 'Card', count: isSwap ? 8 : 5 }],
    topCurrencies: isSwap
      ? [{ currency: 'EUR', count: 2 }, { currency: 'GBP', count: 2 }]
      : [{ currency: 'USD', count: 6 }],
    topTradingPairs: [{
      pair: isSwap ? 'USD/BTC' : 'BTC/USDT',
      fromAsset: isSwap ? 'USD' : 'BTC',
      toAsset: isSwap ? 'BTC' : 'USDT',
      count: isSwap ? 8 : 5,
    }],
    dailySeries: [
      { date: '2025-03-01', orders: isSwap ? 4 : 2, approximateUsdVolume: isSwap ? 600 : 160 },
      { date: '2025-03-02', orders: isSwap ? 10 : 5, approximateUsdVolume: isSwap ? 2480 : 400 },
    ],
    recentActivity: [{
      id: `${product}-activity`,
      label: isSwap ? 'Swap settlement completed' : 'Convert completed',
      time: '2025-03-03T12:00:00.000Z',
    }],
    valuation: {
      observedAt: '2025-03-03T12:00:00.000Z',
      status: isSwap ? 'partial' : 'complete',
      valuedOrders: isSwap ? 10 : 7,
      totalOrders: isSwap ? 14 : 7,
      unavailableCurrencies: isSwap ? ['BTC'] : [],
    },
    operationalHealth: {
      providerFreshness: {
        state: 'healthy',
        syncing: false,
        lastSucceededAt: '2025-03-03T11:55:00.000Z',
      },
      catalog: {
        ageMs: isSwap ? null : 300_000,
        stale: isSwap,
        lastFailureAt: null,
      },
      quickexReconciliation: {
        state: isSwap ? 'healthy' : 'cooling_down',
        consecutiveFailures: isSwap ? 0 : 3,
        freshnessMs: isSwap ? 0 : 600_000,
        lastStartedAt: isSwap ? null : '2025-03-03T11:57:00.000Z',
        lastSucceededAt: isSwap ? null : '2025-03-03T11:50:00.000Z',
        lastFailedAt: isSwap ? null : '2025-03-03T11:57:00.000Z',
        nextRetryAt: isSwap ? null : '2025-03-03T12:05:00.000Z',
      },
      unresolvedOrders: 0,
      notificationsPending: 0,
      notificationsFailed: 0,
      oldestPendingNotificationAt: null,
    },
  };
}

test('operators view product-specific overview analytics and inclusive UTC ranges', async ({ page }) => {
  const summaryRequests: URL[] = [];
  const queueRequests: URL[] = [];
  let hasAuditedCompletedRevenue = true;

  await page.route(/\/api\/admin\/summary(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    summaryRequests.push(url);
    const product = url.searchParams.get('product');
    expect(product === 'swap' || product === 'convert').toBe(true);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(summary(product as 'swap' | 'convert')),
    });
  });
  await page.route(/\/api\/orders(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    queueRequests.push(url);
    const items = url.searchParams.get('status') === 'active' ? [] : [recentSwapOrder];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total: items.length,
        page: 1,
        pageSize: Number(url.searchParams.get('pageSize') ?? 6),
      }),
    });
  });
  await page.route(/\/api\/admin\/manual-desk-revenue(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        from: '2025-03-01T00:00:00.000Z',
        to: '2025-03-03T23:59:59.999Z',
        groupBy: 'route',
        reportingCurrency: 'USD',
        normalizationPolicy: { decimalScale: 30, rounding: 'truncateAfterAggregation' },
        generatedAt: '2025-03-03T12:00:00.000Z',
        totals: [],
        normalizedTotals: hasAuditedCompletedRevenue ? [{
          status: 'completed',
          orderCount: 1,
          historicalGrossCustomerVolume: '1200',
          historicalExpectedFeeRevenue: '12.34',
        }] : [],
        groups: [],
      }),
    });
  });
  await page.route('**/api/healthz', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
  });

  await page.goto('/admin');

  await expect.poll(() => summaryRequests.length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => queueRequests.length).toBeGreaterThan(0);
  await expect(page.getByText('Swap settlement completed')).toBeVisible();
  await expect(page.getByTestId('metric-total-orders')).toContainText('14');
  await expect(page.getByTestId('metric-total-volume').getByText('Partial USD Valuation')).toBeVisible();
  await expect(page.getByTestId('metric-total-volume')).toContainText('Missing rates for BTC. Only 10 of 14 valued.');
  await expect(page.locator('[data-testid^="metric-"]')).toHaveCount(8);
  await expect(page.getByTestId('metric-total-profit')).toContainText('$12.34');
  await expect(page.getByTestId('overview-operational-health')).toContainText('API status');
  await expect(page.getByTestId('status-provider-health')).toHaveAccessibleName(/1Forge rates: Healthy/);
  await expect(page.getByTestId('status-provider-health')).toContainText(/Updated (?:Mar 3|3 Mar)/);
  await expect(page.getByTestId('status-catalog-health')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Top Trading Pairs' })).toBeVisible();
  await expect(page.getByText('USD/BTC')).toBeVisible();
  const topCurrenciesPanel = page.getByRole('heading', { name: 'Top Currencies' })
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " panel ")][1]');
  const topCurrencyFlags = topCurrenciesPanel.locator('.admin-ranking-fiat-logo');
  await expect(topCurrencyFlags).toHaveCount(2);
  for (const flag of await topCurrencyFlags.all()) {
    const geometry = await flag.evaluate((element) => {
      const wrapper = getComputedStyle(element);
      const image = getComputedStyle(element.querySelector('img')!);
      return {
        width: wrapper.width,
        height: wrapper.height,
        borderRadius: wrapper.borderRadius,
        overflow: wrapper.overflow,
        backgroundColor: wrapper.backgroundColor,
        objectFit: image.objectFit,
        objectPosition: image.objectPosition,
      };
    });
    expect(geometry).toEqual({
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      overflow: 'hidden',
      backgroundColor: 'rgba(241, 244, 248, 0.42)',
      objectFit: 'cover',
      objectPosition: '50% 50%',
    });
  }
  await expect(page.getByRole('heading', { name: 'Orders Over Time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Exchange Volume' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Live Exchange Activity' })).toBeVisible();
  await expect(page.getByTestId('table-recent-orders')).toContainText('Amina Test');
  await expect(page.locator('.admin-sidebar')).toBeVisible();
  await expect(page.getByTestId(`link-view-recent-order-${recentSwapOrder.id}`))
    .toHaveAttribute('href', `/admin/orders/${recentSwapOrder.id}`);

  hasAuditedCompletedRevenue = false;
  await page.getByTestId('button-overview-date-30d').click();
  await expect(page.getByTestId('metric-total-profit')).toContainText('Unavailable');
  await expect(page.getByTestId('metric-total-profit')).toContainText('No audited completed revenue');

  const defaultSummary = summaryRequests.find((url) => {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    return from?.endsWith('T00:00:00.000Z') && to?.endsWith('T23:59:59.999Z');
  })!;
  const defaultQueue = queueRequests[0];
  expect(defaultSummary.searchParams.get('product')).toBe('swap');
  expect(defaultQueue.searchParams.get('type')).toBe('manual');
  expect(defaultSummary.searchParams.get('from')).toMatch(/T00:00:00\.000Z$/);
  expect(defaultSummary.searchParams.get('to')).toMatch(/T23:59:59\.999Z$/);
  expect(defaultQueue.searchParams.get('createdFrom')).toBe(defaultSummary.searchParams.get('from'));
  expect(defaultQueue.searchParams.get('createdTo')).toBe(defaultSummary.searchParams.get('to'));
  expect(new Date(defaultSummary.searchParams.get('to')!).getTime() - new Date(defaultSummary.searchParams.get('from')!).getTime())
    .toBe(6 * 24 * 60 * 60 * 1000 + 86_399_999);

  await page.getByTestId('button-overview-convert').click();
  await expect.poll(() => summaryRequests.some((url) => url.searchParams.get('product') === 'convert')).toBe(true);
  await expect.poll(() => queueRequests.some((url) => url.searchParams.get('type') === 'instant')).toBe(true);
  await expect(page.getByText('Convert completed')).toBeVisible();
  await expect(page.getByTestId('metric-total-orders')).toContainText('7');
  await expect(page.getByTestId('metric-total-profit')).toContainText('Not tracked');
  await expect(page.getByTestId('status-provider-health')).toHaveAccessibleName(/Quickex provider: Healthy/);
  await expect(page.getByTestId('status-catalog-health')).toHaveAccessibleName(/Quickex catalog: Healthy/);
  await expect(page.getByTestId('warning-quickex-reconciliation')).toContainText('3 consecutive failures');
  await expect(page.getByTestId('warning-quickex-reconciliation')).toContainText('affiliate completion or reversal credits may be delayed');
  await expect(page.getByRole('heading', { name: 'Live Exchange Activity' })).toBeVisible();

  await page.getByTestId('button-overview-date-custom').click();
  await page.getByLabel('Overview start date').fill('2025-03-01');
  await page.getByLabel('Overview end date').fill('2025-03-03');
  await expect.poll(() => summaryRequests.some((url) =>
    url.searchParams.get('product') === 'convert' &&
    url.searchParams.get('from') === '2025-03-01T00:00:00.000Z' &&
    url.searchParams.get('to') === '2025-03-03T23:59:59.999Z',
  )).toBe(true);
  await expect.poll(() => queueRequests.some((url) =>
    url.searchParams.get('type') === 'instant' &&
    url.searchParams.get('createdFrom') === '2025-03-01T00:00:00.000Z' &&
    url.searchParams.get('createdTo') === '2025-03-03T23:59:59.999Z',
  )).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenuButton = page.getByTestId('button-admin-mobile-menu');
  await expect(mobileMenuButton).toBeVisible();
  await expect(page.locator('.admin-sidebar')).toBeHidden();

  await mobileMenuButton.click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Operations' });
  const mobileDrawerLayer = page.getByTestId('admin-menu-drawer-layer');
  const mobileDrawer = page.getByTestId('admin-menu-drawer');
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileDrawerLayer).toHaveClass(/is-open/);
  await expect(mobileDrawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(mobileNavigation.getByRole('link')).toHaveText([
    'Overview', 'Orders•', 'Revenue', 'Customers', 'Affiliates', 'Payouts', 'Program Settings', 'Appearance', 'Providers', 'Background Studio',
    'API Integrations', 'Notification Settings', 'Currencies & Payment Methods', 'Manual Pricing', 'Staff', 'Site content', 'Blog', 'Newsletter Subscribers', 'Back to exchange',
  ]);

  await mobileDrawer.getByTestId('button-close-admin-menu').click();
  await expect(mobileDrawerLayer).not.toHaveClass(/is-open/);
  await expect(mobileDrawerLayer).toHaveCSS('visibility', 'hidden');
  await expect(mobileNavigation).toBeHidden();
  await mobileMenuButton.click();
  await page.getByTestId('admin-menu-drawer-backdrop').click({ position: { x: 388, y: 422 } });
  await expect(mobileNavigation).toBeHidden();

  await mobileMenuButton.click();
  await page.getByTestId('link-mobile-admin-orders').click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(mobileNavigation).toBeHidden();
});

test('overview exposes stale, unavailable, and refreshing provider context accessibly', async ({ page }) => {
  let state: 'stale' | 'unavailable' | 'syncing' = 'stale';

  await page.route(/\/api\/admin\/summary(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const product = url.searchParams.get('product') as 'swap' | 'convert';
    const response = summary(product);
    response.operationalHealth.providerFreshness = {
      state,
      syncing: state === 'syncing',
      lastFailedAt: '2025-03-03T11:50:00.000Z',
    };
    response.operationalHealth.catalog = {
      ageMs: state === 'unavailable' ? null : 3_600_000,
      stale: state !== 'syncing',
      lastFailureAt: '2025-03-03T11:50:00.000Z',
    };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route(/\/api\/orders(?:\?|$)/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 6 }),
  }));
  await page.route(/\/api\/admin\/manual-desk-revenue(?:\?|$)/, route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ normalizedTotals: [] }),
  }));
  await page.route('**/api/healthz', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok' }),
  }));

  await page.goto('/admin');
  await expect(page.getByTestId('status-provider-health')).toHaveAccessibleName(/1Forge rates: Stale.*Last failure/);

  state = 'unavailable';
  await page.getByTestId('button-overview-convert').click();
  await expect(page.getByTestId('status-provider-health')).toHaveAccessibleName(/Quickex provider: Unavailable.*Last failure/);
  await expect(page.getByTestId('status-catalog-health')).toHaveAccessibleName(/Quickex catalog: Unavailable.*Last failure/);

  state = 'syncing';
  await page.getByTestId('button-overview-swap').click();
  await expect(page.getByTestId('status-provider-health')).toHaveAccessibleName(/1Forge rates: Refreshing.*Last failure/);
});
