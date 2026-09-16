import { expect, test, type Page } from '@playwright/test';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const payoutId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reviewId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const createdAt = '2026-08-23T12:00:00.000Z';

const dashboard = {
  code: 'REF-EXACT-2026',
  referralLinkCode: 'REF-EXACT-2026',
  referrerBound: false,
  programEnabled: true,
  referralCount: 2,
  totalEarnedUsd: '9007199254740993.129',
  referredVolumeUsd: '123456789012345678.999',
  availableUsd: '125.50',
  reservedUsd: '25.25',
  paidUsd: '50.00',
  minimumPayoutUsd: '100.00',
  payoutEligible: true,
  activeReferrals: 1,
  totalReferrals: 2,
};

const commission = {
  id: 'commission-1',
  affiliateAccountId: accountId,
  aggregateId: 'completion-event-safe-id',
  aggregateType: 'completion',
  kind: 'commission',
  volumeUsd: '123456789012345678.999',
  amountUsd: '9007199254740993.129',
  rate: '0.075',
  createdAt,
};

let payout = {
  id: payoutId,
  affiliateAccountId: accountId,
  amountUsd: '25.25',
  destination: {
    asset: 'USDT',
    networkId: 'usdt-trc20',
    networkCode: 'TRC20',
    networkName: 'TRON Network',
    walletAddress: 'TX7mockedPrivacySafeDestination8F2A',
  },
  status: 'requested',
  requestedAt: createdAt,
  decidedAt: null,
  decidedBy: null,
  paidAt: null,
  txid: null,
};

const settings = {
  id: 'settings-v3',
  version: 3,
  enabled: true,
  quickexEnabled: true,
  manualEnabled: true,
  commissionRate: '0.075',
  minimumEligibleUsd: '10.00',
  payoutMinimumUsd: '100.00',
  transactionCapUsd: '500.00',
  cookieDurationDays: 45,
  createdAt,
};

async function mockAffiliateApis(page: Page, dashboardOverrides: Partial<typeof dashboard> = {}) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = {};
    let status = 200;

    if (path.startsWith('/api/affiliate/referral/')) {
      status = 204;
      body = null;
    }
    else if (path === '/api/account/affiliate/attribution') body = { status: 'no_referral' };
    else if (path === '/api/account/affiliate') body = { ...dashboard, ...dashboardOverrides };
    else if (path === '/api/admin/summary') {
      body = {
        product: 'swap',
        from: createdAt,
        to: createdAt,
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
        valuation: { observedAt: createdAt, status: 'complete', valuedOrders: 0, totalOrders: 0, unavailableCurrencies: [] },
        operationalHealth: {
          providerFreshness: { state: 'healthy', syncing: false },
          catalog: { stale: false, ageMs: null },
          unresolvedOrders: 0,
          notificationsPending: 0,
          notificationsFailed: 0,
          oldestPendingNotificationAt: null,
        },
      };
    }
    else if (path === '/api/account/affiliate/commissions') body = [commission];
    else if (path === '/api/account/affiliate/payout-networks') {
      body = [
        { id: 'usdt-trc20', code: 'TRC20', name: 'TRON Network' },
        { id: 'usdt-erc20', code: 'ERC20', name: 'Ethereum Network' },
      ];
    }
    else if (path === '/api/account/affiliate/referrals') {
      // The public dashboard deliberately receives no customer identity fields.
      body = [{ joinedAt: createdAt, status: 'active' }, { joinedAt: '2026-08-22T12:00:00.000Z', status: 'inactive' }];
    } else if (path === '/api/account/affiliate/payouts' && request.method() === 'GET') body = [payout];
    else if (path === '/api/account/affiliate/payouts' && request.method() === 'POST') {
      body = { ...payout, id: 'requested-in-test', ...request.postDataJSON() };
      status = 201;
    } else if (path === '/api/admin/affiliate/overview') {
      body = {
        affiliateCount: 2,
        activeAffiliates: 2,
        ledgerEntries: 1,
        netCommissionUsd: '9007199254740993.129',
        reservedPayoutUsd: '25.25',
        growth: [
          { date: '2026-09-03', count: 1 },
          { date: '2026-09-05', count: 1 },
        ],
        topAffiliates: [
          { id: accountId, code: 'REF-EXACT-2026', commissionUsd: '9007199254740993.129', referredUsers: 2 },
        ],
      };
    } else if (path === '/api/admin/affiliate/accounts') {
      body = {
        items: [{
          id: accountId,
          code: 'REF-EXACT-2026',
          createdAt,
          referrerBoundAt: createdAt,
          status: 'bound',
          referredUsers: 2,
          commissionUsd: '9007199254740993.129',
        }],
        page: 1,
        pageSize: 10,
        total: 1,
      };
    } else if (path === `/api/admin/affiliate/accounts/${accountId}`) {
      body = { id: accountId, code: 'REF-EXACT-2026', createdAt, referrerBoundAt: createdAt, commissions: [commission] };
    } else if (path === '/api/admin/affiliate/payouts' && request.method() === 'GET') body = [payout];
    else if (path === `/api/admin/affiliate/payouts/${payoutId}` && request.method() === 'PATCH') {
      payout = { ...payout, status: request.postDataJSON().status, txid: request.postDataJSON().txid ?? payout.txid };
      body = payout;
    } else if (path === '/api/admin/affiliate/settings' && request.method() === 'GET') body = settings;
    else if (path === '/api/admin/affiliate/settings' && request.method() === 'POST') {
      body = { ...settings, ...request.postDataJSON(), version: 4 };
      status = 201;
    } else if (path === '/api/admin/affiliate/valuation-reviews') {
      body = [{ id: reviewId, completionEventId: 'completion-needing-valuation', state: 'pending', reason: 'Provider value unavailable.', createdAt }];
    } else if (path === `/api/admin/affiliate/valuation-reviews/${reviewId}` && request.method() === 'PATCH') {
      body = { id: reviewId, state: request.postDataJSON().state };
    } else if (path === '/api/exchange/config') {
      body = { assets: [], fiatCurrencies: [], settlementOptions: [], manualSettlementOptions: [], instantSettlementOptions: [], manualRouteAvailability: { available: false, routes: [], unavailableMessage: 'Unavailable' }, providers: [] };
    } else {
      await route.abort('blockedbyclient');
      return;
    }
    if (status === 204) {
      await route.fulfill({ status });
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  payout = { ...payout, status: 'requested', decidedAt: null, decidedBy: null, paidAt: null, txid: null };
  await mockAffiliateApis(page);
});

test('paused affiliate program hides referral sharing', async ({ page }) => {
  await page.unroute('**/api/**');
  await mockAffiliateApis(page, { programEnabled: false });
  await page.goto('/account/affiliate');

  await expect(page.getByTestId('affiliate-program-paused')).toBeVisible();
  await expect(page.getByTestId('text-referral-link')).toHaveCount(0);
  await expect(page.getByTestId('affiliate-payouts-paused')).toBeVisible();
  await expect(page.getByTestId('button-request-payout')).toHaveCount(0);
});

test('a transient referral capture failure retries and binds after authentication', async ({ page }) => {
  let captureAttempts = 0;
  let attributionAttempts = 0;
  let explicitlyBoundCode: string | undefined;
  await page.route('**/api/affiliate/referral/RECOVER2', async route => {
    captureAttempts += 1;
    if (captureAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Referral capture is temporarily unavailable.',
          code: 'REFERRAL_CAPTURE_UNAVAILABLE',
          retryable: true,
          outcomeUnknown: false,
        }),
      });
      return;
    }
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/account/affiliate/attribution', async route => {
    attributionAttempts += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ status: 'no_referral' }),
    });
  });
  await page.route('**/api/account/affiliate/bind', async route => {
    explicitlyBoundCode = route.request().postDataJSON()?.code;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  await page.goto('/?ref=RECOVER2');

  await expect.poll(() => captureAttempts).toBeGreaterThanOrEqual(2);
  await expect.poll(() => explicitlyBoundCode).toBe('RECOVER2');
  await expect(page.getByTestId('affiliate-referral-capture-status')).toContainText('Referral connected to your account.');
});

test('signed-in customers see exact, privacy-safe affiliate history and submit only a mocked payout', async ({ page }) => {
  let payoutRequest: unknown;
  await page.route('**/api/account/affiliate/payouts', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([payout]) });
      return;
    }
    payoutRequest = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'requested-in-test' }) });
  });

  await page.goto('/account/affiliate');
  await expect(page.getByTestId('text-referral-link')).toHaveText(
    `${new URL(page.url()).origin}/?ref=${dashboard.referralLinkCode}`,
  );
  await expect(page.getByTestId('text-total-earned')).toHaveText('$9,007,199,254,740,993.12');
  await expect(page.getByTestId('text-referred-volume')).toHaveText('$123,456,789,012,345,678.99');
  await expect(page.getByTestId('text-available-payout')).toHaveText('$125.50');
  await expect(page.getByTestId('row-commission-commission-1')).toContainText('$9,007,199,254,740,993.12');
  await expect(page.getByTestId(`row-payout-${payoutId}`)).toContainText('TRC20');
  await expect(page.getByText('operator@example.test')).toHaveCount(0);
  await page.getByTestId('button-profile-menu').click();
  await expect(page.getByText('operator@example.test')).toHaveCount(1);
  await page.getByTestId('button-profile-menu').click();
  await expect(page.getByText(/customer@example|customerClerkUserId|referredCustomer/i)).toHaveCount(0);

  await page.getByTestId('input-payout-amount').fill('100.25');
  await page.getByTestId('button-payout-network').click();
  const networkSheet = page.locator('.qx-overlay-card.qx-standalone');
  const networkBackdrop = page.locator('.qx-overlay-backdrop.qx-standalone');
  await expect(networkSheet).toBeVisible();
  await expect(networkBackdrop).toBeVisible();
  await expect(networkSheet.getByRole('heading', { name: 'Select a network...' })).toBeVisible();
  await expect(networkSheet.locator('[role="option"].selected')).toHaveCount(0);
  await expect(networkSheet.locator('[role="option"]:not(.selected) .qx-asset-option-chevron').first()).toBeVisible();
  const sheetContract = await networkSheet.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      bodyPortal: element.parentElement === document.body,
      position: getComputedStyle(element).position,
      centered: Math.abs((bounds.left + bounds.right) / 2 - window.innerWidth / 2) <= 1,
      bottomGap: window.innerHeight - bounds.bottom,
      pageFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  expect(sheetContract.bodyPortal).toBe(true);
  expect(sheetContract.position).toBe('fixed');
  expect(sheetContract.centered).toBe(true);
  expect(Math.abs(sheetContract.bottomGap - 24)).toBeLessThanOrEqual(1);
  expect(sheetContract.pageFitsViewport).toBe(true);
  await page.getByTestId('input-payout-network-search').fill('TRC');
  await page.getByTestId('option-payout-network-usdt-trc20').click();
  await expect(networkSheet).toHaveCount(0);
  await page.getByTestId('button-payout-network').click();
  await expect(page.getByTestId('input-payout-network-search')).toHaveValue('');
  await expect(networkSheet.locator('[role="option"].selected .qx-asset-option-check')).toBeVisible();
  await networkBackdrop.click({ position: { x: 4, y: 4 } });
  await expect(networkSheet).toHaveCount(0);
  await page.getByTestId('input-payout-destination').fill('TX7mockedAffiliateWallet8F2A');
  await page.getByTestId('button-request-payout').click();
  await expect.poll(() => payoutRequest).toEqual({
    amountUsd: '100.25',
    networkId: 'usdt-trc20',
    walletAddress: 'TX7mockedAffiliateWallet8F2A',
  });
  await expect(page.getByText('Payout requested successfully.')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('button-mobile-menu').click();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNavigation.getByText('Affiliates', { exact: true })).toBeVisible();
  const linkHeights = await mobileNavigation.getByRole('link').evaluateAll(
    links => links.map(link => link.getBoundingClientRect().height),
  );
  expect(linkHeights.every(height => height >= 44)).toBe(true);
});

test('operators navigate affiliate directory, ledger, and mocked payout transitions', async ({ page }) => {
  const transitionRequests: unknown[] = [];
  await page.route(`**/api/admin/affiliate/payouts/${payoutId}`, async (route) => {
    const transition = route.request().postDataJSON();
    transitionRequests.push(transition);
    payout = { ...payout, status: transition.status, txid: transition.txid ?? payout.txid };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payout) });
  });

  await page.goto('/admin/affiliates');
  await expect(page.getByTestId('stat-affiliates')).toHaveText('2');
  await expect(page.locator('.admin-sidebar')).toHaveCount(0);
  await page.getByTestId('button-admin-mobile-menu').click();
  await expect(page.getByTestId('link-mobile-admin-affiliates')).toBeVisible();
  await expect(page.getByTestId('link-mobile-admin-payouts')).toBeVisible();
  await expect(page.getByTestId('link-mobile-admin-affiliate-settings')).toBeVisible();
  await page.getByTestId('button-close-admin-menu').click();
  await expect(page.getByTestId('stat-affiliates')).toHaveText('2');
  await expect(page.getByTestId('chart-affiliate-growth')).toBeVisible();
  await expect(page.getByTestId(`link-top-affiliate-${accountId}`)).toContainText('$9,007,199,254,740,993.12');
  await expect(page.getByTestId('select-affiliate-status')).toHaveValue('all');
  await expect(page.getByTestId('select-affiliates-page-size')).toHaveValue('10');
  await page.getByTestId('input-search-affiliates').fill('EXACT');
  await expect(page.getByTestId(`row-account-${accountId}`)).toContainText('REF-EXACT-2026');
  await page.getByTestId(`row-account-${accountId}`).getByRole('link', { name: 'REF-EXACT-2026' }).click();
  await expect(page.getByTestId('row-ledger-commission-1')).toContainText('$123,456,789,012,345,678.99');

  await page.goto('/admin/payouts');
  await expect(page.getByTestId(`row-payout-${payoutId}`)).toContainText('TX7mockedPrivacySafeDestination8F2A');
  await page.getByTestId(`btn-approve-${payoutId}`).click();
  await expect.poll(() => transitionRequests).toEqual([{ status: 'approved' }]);
  await expect(page.getByTestId(`btn-process-${payoutId}`)).toBeVisible();
  await page.getByTestId(`btn-process-${payoutId}`).click();
  await expect.poll(() => transitionRequests).toEqual([{ status: 'approved' }, { status: 'processing' }]);
  await page.getByTestId(`btn-paid-${payoutId}`).click();
  await expect(page.getByTestId(`btn-submit-txid-${payoutId}`)).toBeDisabled();
  await page.getByTestId(`input-txid-${payoutId}`).fill('0xaffiliate-payout-transaction-hash');
  await page.getByTestId(`btn-submit-txid-${payoutId}`).click();
  await expect.poll(() => transitionRequests).toEqual([
    { status: 'approved' },
    { status: 'processing' },
    { status: 'paid', txid: '0xaffiliate-payout-transaction-hash' },
  ]);
  await page.getByTestId(`btn-view-payout-${payoutId}`).click();
  await expect(page.getByTestId('payout-details')).toContainText('0xaffiliate-payout-transaction-hash');
  await page.getByRole('button', { name: 'Close payout details' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('button-admin-mobile-menu').click();
  await expect(page.getByTestId('link-mobile-admin-affiliates')).toBeVisible();
  await expect(page.getByTestId('link-mobile-admin-payouts')).toBeVisible();
  await expect(page.getByTestId('link-mobile-admin-affiliate-settings')).toBeVisible();
});

test('operators submit valuation and settings forms to mocked affiliate APIs', async ({ page }) => {
  let settingsRequest: unknown;
  let valuationRequest: unknown;
  await page.route('**/api/admin/affiliate/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) });
      return;
    }
    settingsRequest = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...settings, version: 4 }) });
  });
  await page.route(`**/api/admin/affiliate/valuation-reviews/${reviewId}`, async (route) => {
    valuationRequest = route.request().postDataJSON();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: reviewId, state: route.request().postDataJSON().state }) });
  });

  await page.goto('/admin/affiliate-settings');
  await page.getByTestId('button-theme-dark').click();
  await expect(page.getByRole('heading', { name: 'Valuation Review Queue' })).toBeVisible();
  const queueSearch = page.getByTestId('input-queue-search');
  await expect(queueSearch).toHaveAttribute('type', 'search');
  await expect(queueSearch.locator('xpath=..').locator('svg').first()).toBeVisible();
  await queueSearch.fill('  PROVIDER value  ');
  await expect(page.getByTestId(`btn-approve-${reviewId}`)).toBeVisible();
  await page.getByTestId('input-queue-search-clear').click();
  await expect(queueSearch).toHaveValue('');
  await expect(page.getByTestId('input-commission-rate')).toHaveValue('0.075');
  await expect(page.getByTestId('input-payout-minimum')).toHaveValue('100');
  await page.getByTestId('input-commission-rate').fill('0.080');
  await page.getByTestId('btn-save-settings').click();
  await expect.poll(() => settingsRequest).toMatchObject({ commissionRate: '0.080', payoutMinimumUsd: '100' });

  await page.getByTestId(`btn-approve-${reviewId}`).click();
  await page.getByTestId('input-confirm-usd').fill('123.456789');
  await page.getByTestId('btn-confirm-submit').click();
  await expect.poll(() => valuationRequest).toEqual({ state: 'approved', usd: '123.456789' });

  await page.getByTestId(`btn-reject-${reviewId}`).click();
  await page.getByTestId('input-confirm-note').fill('The source valuation cannot be independently verified.');
  await page.getByTestId('btn-confirm-submit').click();
  await expect.poll(() => valuationRequest).toEqual({
    state: 'rejected',
    note: 'The source valuation cannot be independently verified.',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const valuationTable = page.getByTestId('table-affiliate-valuations');
  await expect(valuationTable).toBeVisible();
  const swipeMetrics = await valuationTable.evaluate(async (table) => {
    const viewport = table.closest<HTMLElement>('.mobile-table-scroll')!;
    const hint = viewport.previousElementSibling as HTMLElement;
    const firstHeader = table.querySelector<HTMLElement>('thead th:first-child')!;
    const lastHeader = table.querySelector<HTMLElement>('thead th:last-child')!;
    const before = [firstHeader.getBoundingClientRect().left, lastHeader.getBoundingClientRect().left];
    viewport.scrollLeft = Math.min(140, viewport.scrollWidth - viewport.clientWidth);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const after = [firstHeader.getBoundingClientRect().left, lastHeader.getBoundingClientRect().left];
    return {
      viewportWidth: viewport.clientWidth,
      tableWidth: table.getBoundingClientRect().width,
      scrollLeft: viewport.scrollLeft,
      hintOpacity: hint.style.opacity,
      stickyParts: Array.from(table.querySelectorAll<HTMLElement>('thead, th, td')).filter(
        element => getComputedStyle(element).position === 'sticky',
      ).length,
      movement: before.map((left, index) => after[index] - left),
    };
  });
  expect(swipeMetrics.tableWidth).toBeGreaterThan(swipeMetrics.viewportWidth);
  expect(swipeMetrics.scrollLeft).toBeGreaterThan(0);
  expect(swipeMetrics.hintOpacity).toBe('0');
  expect(swipeMetrics.stickyParts).toBe(0);
  for (const movement of swipeMetrics.movement) {
    expect(movement).toBeCloseTo(-swipeMetrics.scrollLeft, 0);
  }
});