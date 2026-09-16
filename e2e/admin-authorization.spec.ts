import { expect, test } from '@playwright/test';

const adminSummary = {
  product: 'swap',
  from: '2026-08-29T00:00:00.000Z',
  to: '2026-08-29T23:59:59.999Z',
  totalOrders: 0,
  pendingOrders: 0,
  completedOrders: 0,
  failedCancelledOrders: 0,
  totalCustomers: 0,
  totalUsers: 0,
  completionRate: 0,
  averageCompletionTimeMinutes: null,
  averageOrderValueUsd: 0,
  topPaymentMethods: [],
  topCurrencies: [],
  topTradingPairs: [],
  dailySeries: [],
  recentActivity: [],
  valuation: {
    observedAt: '2026-08-29T12:00:00.000Z',
    status: 'complete',
    valuedOrders: 0,
    totalOrders: 0,
    unavailableCurrencies: [],
  },
  operationalHealth: {
    providerFreshness: {
      state: 'healthy',
      syncing: false,
      lastSucceededAt: '2026-08-29T12:00:00.000Z',
    },
    catalog: {
      ageMs: null,
      stale: false,
      lastFailureAt: null,
    },
    unresolvedOrders: 0,
    notificationsPending: 0,
    notificationsFailed: 0,
    oldestPendingNotificationAt: null,
  },
};

test('an authenticated approved operator reaches the admin desk', async ({ page }) => {
  const authorizationStatuses: number[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/admin/summary') {
      authorizationStatuses.push(response.status());
    }
  });

  await page.route(/\/api\/admin\/summary(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(adminSummary),
    }));
  await page.route(/\/api\/orders(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 6 }),
    }));
  await page.route(/\/api\/admin\/manual-desk-revenue(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        from: adminSummary.from,
        to: adminSummary.to,
        groupBy: 'route',
        reportingCurrency: 'USD',
        normalizationPolicy: { decimalScale: 30, rounding: 'truncateAfterAggregation' },
        generatedAt: adminSummary.valuation.observedAt,
        totals: [],
        normalizedTotals: [],
        groups: [],
      }),
    }));

  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByTestId('operator-access-denied')).toHaveCount(0);
  await expect(page.getByTestId('operator-access-unavailable')).toHaveCount(0);
  expect(authorizationStatuses.length).toBeGreaterThan(0);
  expect(authorizationStatuses).not.toContain(502);
});

test('a genuine operator denial is presented as access denied', async ({ page }) => {
  await page.route(/\/api\/admin\/summary(?:\?|$)/, (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Operator access is denied.',
        code: 'OPERATOR_ACCESS_DENIED',
        retryable: false,
        outcomeUnknown: false,
      }),
    }));

  await page.goto('/admin');

  await expect(page.getByTestId('operator-access-denied')).toBeVisible();
  await expect(page.getByText('This account is not an approved operator.')).toBeVisible();
  await expect(page.getByTestId('operator-access-unavailable')).toHaveCount(0);
});

test('authorization backend failures are not presented as operator denials', async ({ page }) => {
  let available = false;
  await page.route(/\/api\/admin\/summary(?:\?|$)/, (route) =>
    route.fulfill({
      status: available ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(available
        ? adminSummary
        : {
            error: 'Operator authorization is temporarily unavailable.',
            code: 'OPERATOR_AUTH_UNAVAILABLE',
            retryable: true,
            outcomeUnknown: false,
          }),
    }));
  await page.route(/\/api\/orders(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 6 }),
    }));
  await page.route(/\/api\/admin\/manual-desk-revenue(?:\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        from: adminSummary.from,
        to: adminSummary.to,
        groupBy: 'route',
        reportingCurrency: 'USD',
        normalizationPolicy: { decimalScale: 30, rounding: 'truncateAfterAggregation' },
        generatedAt: adminSummary.valuation.observedAt,
        totals: [],
        normalizedTotals: [],
        groups: [],
      }),
    }));

  await page.goto('/admin');

  const unavailable = page.getByTestId('operator-access-unavailable');
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toContainText('Your account has not been denied.');
  await expect(page.getByTestId('operator-access-denied')).toHaveCount(0);

  available = true;
  await unavailable.getByRole('button', { name: 'Try again' }).click();

  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});