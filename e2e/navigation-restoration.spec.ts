import { expect, test, type Page } from '@playwright/test';
import { safeReturnPath } from '../artifacts/crypto-exchange-widget/src/lib/navigation-state';

const exchangeConfig = {
  assets: [
    { id: 'usd-fiat', code: 'USD', name: 'US Dollar', kind: 'fiat', network: 'fiat', precision: 2 },
    { id: 'btc-bitcoin', code: 'BTC', name: 'Bitcoin', kind: 'crypto', network: 'Bitcoin', precision: 8 },
    { id: 'usdt-trc20', code: 'USDT', name: 'Tether', kind: 'crypto', network: 'TRC20', precision: 6 },
  ],
  fiatCurrencies: ['USD'],
  settlementOptions: [
    { id: 'usd-fiat', assetId: 'usd-fiat', assetCode: 'USD', kind: 'fiat-payment-method', title: 'Bank transfer', paymentMethodId: 'bank-transfer', direction: 'both', routeNetwork: 'Bank transfer' },
    { id: 'btc-bitcoin', assetId: 'btc-bitcoin', assetCode: 'BTC', kind: 'crypto-network', title: 'Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'both' },
    { id: 'usdt-trc20', assetId: 'usdt-trc20', assetCode: 'USDT', kind: 'crypto-network', title: 'TRC20', networkSlug: 'usdt-trc20', networkTitle: 'TRC20', routeNetwork: 'TRC20', direction: 'both' },
  ],
  manualSettlementOptions: [
    { id: 'usd-fiat', assetId: 'usd-fiat', assetCode: 'USD', kind: 'fiat-payment-method', title: 'Bank transfer', paymentMethodId: 'bank-transfer', direction: 'both', routeNetwork: 'Bank transfer' },
    { id: 'btc-bitcoin', assetId: 'btc-bitcoin', assetCode: 'BTC', kind: 'crypto-network', title: 'Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'both' },
    { id: 'usdt-trc20', assetId: 'usdt-trc20', assetCode: 'USDT', kind: 'crypto-network', title: 'TRC20', networkSlug: 'usdt-trc20', networkTitle: 'TRC20', routeNetwork: 'TRC20', direction: 'both' },
  ],
  manualRouteAvailability: { available: true, routes: [{ sourceSettlementOptionId: 'usd-fiat', targetSettlementOptionId: 'btc-bitcoin' }, { sourceSettlementOptionId: 'btc-bitcoin', targetSettlementOptionId: 'usdt-trc20' }], unavailableMessage: null },
  providers: ['Manual desk'], feePercent: 0,
  defaultSwapPair: { sourceSettlementOptionId: 'usd-fiat', targetSettlementOptionId: 'btc-bitcoin' },
};

const installApiFixtures = async (page: Page, now: () => number = () => Date.now()) => {
  await page.route('**/api/exchange/config', route => route.fulfill({ json: exchangeConfig }));
  await page.route('**/api/quickex/config', route => route.fulfill({ json: {
    provider: 'Quickex', signedOrders: true,
    instruments: [
      { currencyTitle: 'BTC', networkTitle: 'Bitcoin', slug: 'btc-bitcoin', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', precisionDecimals: 8 },
      { currencyTitle: 'USDT', networkTitle: 'TRC20', slug: 'usdt-trc20', instrumentType: 'crypto', fullName: 'Tether', currencyFriendlyTitle: 'Tether', precisionDecimals: 6 },
    ],
    pairs: [{ fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' }],
    defaultConvertPair: { fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' },
  } }));
  await page.route('**/api/quickex/quote', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: {
      quoteId: `restoration-quote-${Date.now()}`, type: 'instant', provider: 'Quickex',
      fromAsset: body.fromAsset, fromNetwork: body.fromNetwork, toAsset: body.toAsset,
      toNetwork: body.toNetwork, amount: body.amount, receiveAmount: 99.5, rate: 99.5,
      fee: 0, minAmount: 0.01, maxAmount: 50, rateMode: body.rateMode,
      expiresAt: new Date(now() + 120_000).toISOString(),
    } });
  });
};

test('mobile Swap and Convert drafts restore safely after refresh and lifecycle restoration', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  let fixtureNow = Date.now();
  await installApiFixtures(page, () => fixtureNow);
  await page.setViewportSize({ width: 390, height: 844 });
  let swapQuotes = 0;
  let convertQuotes = 0;
  let creates = 0;
  page.on('request', request => {
    if (request.url().includes('/api/exchange/quote')) swapQuotes++;
    if (request.url().includes('/api/quickex/quote')) convertQuotes++;
    if (/\/api\/(?:orders|quickex\/create-order)/.test(new URL(request.url()).pathname) && request.method() === 'POST') creates++;
  });
  await page.route('**/api/exchange/quote', route => {
    swapQuotes++;
    return route.fulfill({ json: {
      quoteId: `swap-fixture-${swapQuotes}`, type: 'manual', provider: 'Manual desk',
      fromAsset: 'USD', fromNetwork: 'Bank transfer', toAsset: 'BTC', toNetwork: 'Bitcoin',
      amount: 100, receiveAmount: 0.002, rate: 0.00002, fee: 0,
      manualSwapFees: { existingPricingFee: 0, totalFees: 0, selectedAddons: [], addonFee: 0,
        exchangeFee: { enabled: false, percentage: null, fixedAmount: null, fixedCurrency: 'BTC', percentageAmount: 0, fixedTargetAmount: 0, totalAmount: 0 }, totalAdditionalFee: 0 },
      expiresAt: new Date(fixtureNow + 120_000).toISOString(),
    } });
  });
  for (const theme of ['light', 'dark']) {
    await page.goto('/swap?restore=swap#draft');
    fixtureNow = await page.evaluate(() => Date.now());
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByTestId('input-amount').fill('100');
    await expect.poll(() => swapQuotes).toBeGreaterThan(0);
    const before = swapQuotes;
    await expect.poll(async () => await page.evaluate(() => JSON.parse(sessionStorage.getItem('qx:draft:swap') || 'null')?.values?.amount)).toBe('100');
    await page.screenshot({ path: testInfo.outputPath(`mobile-swap-${theme}.png`), fullPage: false, animations: 'disabled', timeout: 15_000 });
    await page.reload();
    await expect(page).toHaveURL(/\/swap\?restore=swap#draft$/);
    await expect(page.getByTestId('input-amount')).toHaveValue('100');
    await expect.poll(() => swapQuotes).toBeGreaterThan(before);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.getByTestId('button-swap-continue').click();
    await page.getByTestId('input-destination-address').fill('fixture-wallet-address');
    await page.getByTestId('button-swap-next').click();
    await expect(page.getByTestId('swap-summary-step')).toBeVisible();
    const beforeExpiredSwapRestore = swapQuotes;
    fixtureNow = await page.evaluate(() => Date.now()) + 180_000;
    await page.clock.setFixedTime(new Date(fixtureNow));
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => swapQuotes).toBeGreaterThan(beforeExpiredSwapRestore);
    await expect(page.getByTestId('swap-summary-step')).toHaveCount(0);
    await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qx:draft:swap') || 'null'));
    expect(Object.keys(draft.values).every(key => ['fromId', 'toId', 'amount', 'desiredReceiveAmount', 'activeAmountSide'].includes(key))).toBe(true);
    expect(creates).toBe(0);

    const quickexConfigLoaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/quickex/config');
    await page.goto('/convert?restore=convert#draft');
    await quickexConfigLoaded;
    fixtureNow = await page.evaluate(() => Date.now());
    await page.getByTestId('convert-input-amount').fill('1');
    await expect(page.getByTestId('convert-input-amount')).toHaveValue('1');
    await expect.poll(() => convertQuotes).toBeGreaterThan(0);
    const freshBefore = convertQuotes;
    await expect.poll(async () => await page.evaluate(() => JSON.parse(sessionStorage.getItem('qx:draft:convert') || 'null')?.values?.amount)).toBe('1');
    await page.screenshot({ path: testInfo.outputPath(`mobile-convert-${theme}.png`), fullPage: false, animations: 'disabled', timeout: 15_000 });
    await page.reload();
    fixtureNow = await page.evaluate(() => Date.now());
    await expect(page).toHaveURL(/\/convert\?restore=convert#draft$/);
    await expect(page.getByTestId('convert-input-amount')).toHaveValue('1');
    await expect.poll(() => convertQuotes).toBeGreaterThan(freshBefore);
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const beforeExpiredConvertRestore = convertQuotes;
    fixtureNow = await page.evaluate(() => Date.now()) + 180_000;
    await page.clock.setFixedTime(new Date(fixtureNow));
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => convertQuotes).toBeGreaterThan(beforeExpiredConvertRestore);
    const convertDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qx:draft:convert') || 'null'));
    expect(Object.keys(convertDraft.values).every(key => ['fromSlug', 'toSlug', 'amount', 'receiveAmount', 'activeAmountSide', 'rateMode'].includes(key))).toBe(true);
    expect(JSON.stringify([draft, convertDraft])).not.toMatch(/email|address|payment|quote|token|accept/i);
    expect(creates).toBe(0);
  }
});

test('selected homepage Convert tab persists, while dedicated routes take precedence', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('/');
  await page.getByTestId('button-mode-select-instant').click();
  await expect(page.locator('.exchange-wrapper')).toHaveAttribute('data-exchange-mode', 'convert');
  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.exchange-wrapper')).toHaveAttribute('data-exchange-mode', 'convert');
  await expect(page.getByTestId('convert-input-amount')).toBeVisible();
  await page.goto('/swap');
  await expect(page.getByTestId('input-amount')).toBeVisible();
  await page.goto('/convert');
  await expect(page.getByTestId('convert-input-amount')).toBeVisible();
});

test('tracking and admin routes survive reload; temporary authorization failures stay in place', async ({ page }) => {
  await installApiFixtures(page);
  await page.route('**/api/orders/*/status**', route => route.fulfill({ status: 200, json: {
    id: 'fixture-order', status: 'processing', type: 'manual', createdAt: new Date().toISOString(),
    fromAsset: 'USD', toAsset: 'BTC', amount: 100, receiveAmount: 0.002,
  } }));
  await page.route('**/api/admin/operators**', route => route.fulfill({ status: 503, json: { error: 'Temporarily unavailable', code: 'OPERATOR_AUTH_UNAVAILABLE', retryable: true } }));
  for (const route of ['/status?order=fixture-order#tracking', '/order/fixture-order']) {
    await page.goto(route);
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  }
  await page.goto('/admin/notifications');
  await expect(page.getByTestId('owner-access-unavailable')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/notifications$/);
  await expect(page.getByTestId('owner-access-unavailable')).toBeVisible();
});

test('signed-out Admin preserves validated return target and nested account login return', async ({ page }) => {
  await page.goto('/admin/orders?__e2eGuest');
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=.*admin%2Forders/);
  await page.goto('/account/orders?__e2eGuest');
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=.*account%2Forders/);
});

test('signed-in Admin keeps its route across 401 refresh and 403 authorization responses', async ({ page }) => {
  let status = 401;
  let requests = 0;
  await page.route('**/api/admin/operators**', route => {
    requests++;
    return route.fulfill({ status, json: { error: 'Authorization unavailable', code: 'OPERATOR_AUTH_UNAVAILABLE', retryable: true } });
  });
  await page.goto('/admin/orders?__e2eSession');
  await expect(page.getByTestId('owner-access-unavailable')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/orders\?__e2eSession$/);
  await expect.poll(() => page.evaluate(() => (window as Window & { __e2eTokenRefreshes?: number }).__e2eTokenRefreshes)).toBe(1);
  await expect.poll(() => requests).toBeGreaterThan(1);
  expect(await page.evaluate(() => (window as Window & { __e2eTokenRefreshes?: number }).__e2eTokenRefreshes)).toBe(1);

  status = 403;
  await page.goto('/admin/notifications?__e2eSession');
  await expect(page.getByTestId('owner-access-unavailable')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/notifications\?__e2eSession$/);
  expect(await page.evaluate(() => (window as Window & { __e2eTokenRefreshes?: number }).__e2eTokenRefreshes ?? 0)).toBe(0);
});

test('safeReturnPath rejects external and unsafe destinations and honors base paths', () => {
  const origin = 'https://example.test';
  expect(safeReturnPath('/admin/orders?status=open#top', '', origin)).toBe('/admin/orders?status=open#top');
  expect(safeReturnPath('https://evil.test/admin', '', origin)).toBeUndefined();
  expect(safeReturnPath('//evil.test/admin', '', origin)).toBeUndefined();
  expect(safeReturnPath('/sign-in?redirect_url=/admin', '', origin)).toBeUndefined();
  expect(safeReturnPath('/api/admin/orders', '', origin)).toBeUndefined();
  expect(safeReturnPath('/app/admin/orders?x=1', '/app', origin)).toBe('/app/admin/orders?x=1');
  expect(safeReturnPath('/admin/orders', '/app', origin)).toBeUndefined();
});
