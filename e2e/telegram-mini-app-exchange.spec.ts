import { expect, test, type Page, type TestInfo } from '@playwright/test';

const miniApp = '/telegram-mini-app';
const sessionToken = 'mini-app-exchange-e2e-session';
const expiry = '2099-01-01T00:00:00.000Z';

async function checkExchangeViewports(page: Page, info: TestInfo, step: string) {
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const outsideInputs = await page.locator('input:visible, select:visible').evaluateAll(inputs =>
        inputs.filter(input => {
          const rect = input.getBoundingClientRect();
          return rect.left < -1 || rect.right > window.innerWidth + 1;
        }).length,
      );
      expect(outsideInputs).toBe(0);
      const actionBounds = await page.locator('.qx-sticky-action button').last().boundingBox();
      const navigationBounds = await page.locator('.glass-nav').last().boundingBox();
      expect(actionBounds).not.toBeNull();
      expect(navigationBounds).not.toBeNull();
      expect(actionBounds!.y).toBeGreaterThanOrEqual(0);
      expect(actionBounds!.y + actionBounds!.height)
        .toBeLessThanOrEqual(navigationBounds!.y);
      await page.screenshot({ path: info.outputPath(`${step}-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    }
  }
}

const quickexConfig = {
  provider: 'Quickex',
  signedOrders: true,
  instruments: [
    { currencyTitle: 'BTC', networkTitle: 'TRC20', slug: 'btc-trc20', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', precisionDecimals: 8, requiresMemo: false },
    { currencyTitle: 'ETH', networkTitle: 'ERC20', slug: 'eth-erc20', instrumentType: 'crypto', fullName: 'Ethereum', currencyFriendlyTitle: 'Ethereum', precisionDecimals: 8, requiresMemo: false },
  ],
  pairs: [{ fromAsset: 'BTC', fromNetwork: 'TRC20', toAsset: 'ETH', toNetwork: 'ERC20' }],
};

function quote(mode: 'swap' | 'convert') {
  return {
    quoteId: `${mode}-quote-e2e`,
    type: mode === 'swap' ? 'manual' : 'instant',
    fromAsset: mode === 'swap' ? 'BTC' : 'BTC',
    fromNetwork: mode === 'swap' ? 'TRC20' : 'TRC20',
    toAsset: mode === 'swap' ? 'USDT' : 'ETH',
    toNetwork: mode === 'swap' ? 'TRC20' : 'ERC20',
    amount: 0.5,
    receiveAmount: 20,
    rate: 40,
    fee: 0,
    minAmount: 0.01,
    maxAmount: 1000,
    expiresAt: expiry,
    ...(mode === 'swap' ? {
      sourceSettlementOptionId: 'source-btc',
      targetSettlementOptionId: 'target-usdt',
      selectedAddOnKeys: [],
      manualSwapFees: { existingPricingFee: 0, totalFees: 0, selectedAddons: [] },
    } : {}),
  };
}

function swapConfig() {
  const options = [
    { id: 'source-btc', assetId: 'btc', assetCode: 'BTC', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Bitcoin TRC20', direction: 'both', executionMode: 'manual', lifecycle: 'active', regions: [], countries: [] },
    { id: 'target-usdt', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Tether TRC20', direction: 'both', executionMode: 'manual', lifecycle: 'active', regions: [], countries: [] },
  ];
  return {
    assets: [],
    fiatCurrencies: [],
    settlementOptions: options,
    manualSettlementOptions: options,
    manualRouteAvailability: {
      available: true,
      routes: [{ sourceSettlementOptionId: 'source-btc', targetSettlementOptionId: 'target-usdt' }],
      unavailableMessage: null,
    },
    providers: [],
    feePercent: 0,
  };
}

async function mockTelegramSession(page: Page) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(() => {
    (window as any).Telegram = {
      WebApp: {
        initData: 'query_id=mini-app-exchange-e2e',
        initDataUnsafe: { user: { id: 99, first_name: 'Exchange tester' } },
        platform: 'web',
        version: '7.0',
        colorScheme: 'dark',
        ready() {},
        expand() {},
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      },
    };
  });
  await page.route('**/api/telegram/mini-app/session', route =>
    route.fulfill({
      status: 200,
      json: {
        token: sessionToken,
        expiresAt: expiry,
        user: { id: '99', displayName: 'Exchange tester' },
        linkedAccount: false,
      },
    }),
  );
  await page.route('**/api/website/branding', route => route.fulfill({ status: 200, json: {} }));
}

test('live canonical USDT TRC20 to SEPA Instant EUR reverse quote populates send and finishes loading', async ({ page }) => {
  test.skip(process.env.MINI_APP_LIVE_QUOTE_TESTS !== '1', 'Requires the routed development API and its real Admin-configured route.');
  test.setTimeout(60_000);
  await mockTelegramSession(page);
  // Only Telegram bootstrap is mocked. All catalog/pricing/quote calls below
  // go to the real canonical website API with the current Admin configuration.
  const configResponse = await page.request.get('/api/exchange/config');
  expect(configResponse.status()).toBe(200);
  const config = await configResponse.json();
  const source = config.manualSettlementOptions.find((option: any) =>
    option.assetCode === 'USDT' && option.routeNetwork === 'TRC20');
  const target = config.manualSettlementOptions.find((option: any) =>
    option.assetCode === 'EUR' && option.title === 'SEPA Instant');
  expect(source, 'The configured USDT/TRC20 source must exist').toBeTruthy();
  expect(target, 'The configured SEPA Instant/EUR target must exist').toBeTruthy();
  expect(config.manualRouteAvailability.routes.some((route: any) =>
    route.sourceSettlementOptionId === source.id && route.targetSettlementOptionId === target.id)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${miniApp}/exchange?mode=swap`);
  await page.getByTestId('source-selector-trigger').click();
  await page.getByPlaceholder('Search by name, symbol, or network...').fill('USDT');
  await page.locator('button.group').filter({ hasText: 'USDT' }).filter({ hasText: 'TRC20' }).last().click();
  await page.getByTestId('target-selector-trigger').click();
  await page.getByPlaceholder('Search by name, symbol, or network...').fill('SEPA');
  await page.locator('button.group').filter({ hasText: 'SEPA Instant' }).filter({ hasText: 'EUR' }).last().click();
  await expect(page.getByTestId('text-exchange-rate')).not.toHaveText('Checking rate...');

  const reverseResponse = page.waitForResponse(response => {
    if (!response.url().endsWith('/api/exchange/quote-by-receive')) return false;
    const body = response.request().postDataJSON();
    return body.sourceSettlementOptionId === source.id &&
      body.targetSettlementOptionId === target.id && body.desiredReceiveAmount === 1000;
  });
  await page.getByTestId('input-receive-amount').fill('1000');
  const response = await reverseResponse;
  expect(response.status(), 'The real reverse solver must return a quote, not exhaust its budget').toBe(200);
  const serverQuote = await response.json();
  expect(Number.isFinite(serverQuote.amount) && serverQuote.amount > 0).toBe(true);
  expect(serverQuote.receiveAmount).toBeGreaterThanOrEqual(1000);
  expect(serverQuote.sourceSettlementOptionId).toBe(source.id);
  expect(serverQuote.targetSettlementOptionId).toBe(target.id);
  await expect(page.getByTestId('input-send-amount')).toHaveValue(String(serverQuote.amount));
  await expect(page.getByTestId('input-receive-amount')).toHaveValue('1000');
  await expect(page.getByTestId('text-exchange-rate')).toHaveText(`1 USDT = ${serverQuote.rate} EUR`);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await expect(page.getByText('Processing...', { exact: true })).toHaveCount(0);
});

test('Swap stalled transport and real-shaped budget errors both end quote loading', async ({ page }) => {
  await mockTelegramSession(page);
  await page.route('**/api/exchange/config', route => route.fulfill({ status: 200, json: swapConfig() }));
  await page.route('**/api/exchange/manual-swap-addons', route => route.fulfill({ status: 200, json: { items: [] } }));
  await page.route('**/api/exchange/route-pricing**', route => route.fulfill({
    status: 200,
    json: {
      sourceSettlementOptionId: 'source-btc', targetSettlementOptionId: 'target-usdt',
      fromAsset: 'BTC', toAsset: 'USDT', rate: 40, pricingRuleName: 'Failure-state fixture',
    },
  }));
  let requests = 0;
  await page.route('**/api/exchange/quote-by-receive', async route => {
    requests++;
    if (requests === 1) {
      // Never respond: the browser watchdog, not a mocked quote, must settle.
      await new Promise<void>(() => {});
      return;
    }
    await route.fulfill({
      status: 503,
      json: {
        code: 'MANUAL_RECEIVE_QUOTE_BUDGET_EXCEEDED',
        error: 'The receive quote could not be solved within the bounded pricing time and attempt budget. Please try again.',
      },
    });
  });
  await page.goto(`${miniApp}/exchange?mode=swap`);
  await expect(page.getByTestId('input-receive-amount')).toBeEnabled();
  await page.clock.install();
  const requestStarted = page.waitForRequest('**/api/exchange/quote-by-receive');
  await page.getByTestId('input-receive-amount').fill('1000');
  await page.clock.runFor(250);
  await requestStarted;
  await page.clock.runFor(20_100);
  await expect(page.getByText('The quote request timed out. Please try again.')).toBeVisible();
  await expect(page.getByTestId('text-exchange-rate')).toHaveText('Rate unavailable');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await expect(page.getByText('Processing...', { exact: true })).toHaveCount(0);

  await page.getByTestId('input-receive-amount').fill('1001');
  await page.clock.runFor(250);
  await expect(page.getByText(/could not be solved within the bounded pricing time/)).toBeVisible();
  await expect(page.getByTestId('text-exchange-rate')).toHaveText('Rate unavailable');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await expect(page.getByText('Processing...', { exact: true })).toHaveCount(0);
  expect(requests).toBe(2);
});

test('Swap synchronizes authoritative quotes, rejects stale replies, and keeps mobile amount selectors symmetric', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTelegramSession(page);
  const source = {
    ...swapConfig().manualSettlementOptions[0],
    assetCode: 'USDT', title: 'Tether', assetId: 'usdt',
  };
  const sepa = {
    ...swapConfig().manualSettlementOptions[1],
    assetCode: 'EUR', title: 'SEPA Instant', assetId: 'eur',
    kind: 'fiat-payment-method', routeNetwork: 'SEPA', paymentMethodId: 'sepa',
  };
  const paysera = { ...sepa, id: 'target-paysera', title: 'Paysera', routeNetwork: 'PAYSERA', paymentMethodId: 'paysera' };
  const options = [source, sepa, paysera];
  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    json: {
      ...swapConfig(),
      settlementOptions: options,
      manualSettlementOptions: options,
      manualRouteAvailability: {
        available: true, unavailableMessage: null,
        routes: [sepa, paysera].map(target => ({
          sourceSettlementOptionId: source.id, targetSettlementOptionId: target.id,
        })),
      },
    },
  }));
  await page.route('**/api/exchange/manual-swap-addons', route => route.fulfill({
    status: 200,
    json: { items: [{
      id: 'priority-addon', key: 'priority', name: 'Priority service',
      description: 'Optional service', feeType: 'fixed', fixedAmount: 4,
      feeCurrency: 'EUR', selectionRule: 'multiple', presentation: { group: 'Service' },
    }] },
  }));
  await page.route('**/api/exchange/route-pricing**', route => {
    const targetId = new URL(route.request().url()).searchParams.get('targetSettlementOptionId');
    return route.fulfill({
      status: 200,
      json: {
        sourceSettlementOptionId: source.id, targetSettlementOptionId: targetId,
        fromAsset: 'USDT', toAsset: 'EUR', rate: 0.9, pricingRuleName: 'Server fixture',
        minAmount: 1, maxAmount: 100000,
      },
    });
  });
  const reverseRequests: Array<Record<string, any>> = [];
  const forwardRequests: Array<Record<string, any>> = [];
  const cancelledRequests: string[] = [];
  page.on('requestfailed', request => {
    if (request.url().includes('/api/exchange/quote')) cancelledRequests.push(request.url());
  });
  let staleResponseReleased = false;
  const serverQuote = (body: Record<string, any>, send: number, receive: number, rate: number) => ({
    ...quote('swap'),
    fromAsset: body.fromAsset, fromNetwork: body.fromNetwork,
    toAsset: body.toAsset, toNetwork: body.toNetwork,
    sourceSettlementOptionId: body.sourceSettlementOptionId,
    targetSettlementOptionId: body.targetSettlementOptionId,
    amount: send, receiveAmount: receive, rate,
    selectedAddOnKeys: body.selectedAddOnKeys,
    manualSwapFees: { existingPricingFee: 5, totalFees: 9, selectedAddons: [] },
  });
  await page.route('**/api/exchange/quote-by-receive', async route => {
    const body = route.request().postDataJSON();
    reverseRequests.push(body);
    // Deliberately non-proportional prepared server amounts: the frontend must
    // consume the signed response, never invert or extrapolate a local rate.
    if (body.desiredReceiveAmount === 1100) {
      await new Promise(resolve => setTimeout(resolve, 900));
      try {
        await route.fulfill({ status: 200, json: serverQuote(body, 1235, 1100, 0.93) });
      } catch {
        // Aborting this superseded request is the expected browser behavior.
      } finally {
        staleResponseReleased = true;
      }
      return;
    }
    const addon = body.selectedAddOnKeys.includes('priority');
    const send = body.desiredReceiveAmount === 1000 ? 1125 : addon ? 2260 : 2240;
    await route.fulfill({
      status: 200,
      json: serverQuote(body, send, body.desiredReceiveAmount, addon ? 0.95 : 0.94),
    });
  });
  await page.route('**/api/exchange/quote', async route => {
    const body = route.request().postDataJSON();
    forwardRequests.push(body);
    await route.fulfill({ status: 200, json: serverQuote(body, body.amount, 1065, 0.92) });
  });

  await page.goto(`${miniApp}/exchange?mode=swap`);
  const sendInput = page.getByTestId('input-send-amount');
  const receiveInput = page.getByTestId('input-receive-amount');
  await expect(receiveInput).toBeEnabled();
  await receiveInput.fill('1000');
  await expect(sendInput).toHaveValue('1125');
  await expect(receiveInput).toHaveValue('1000');
  expect(reverseRequests.at(-1)).toMatchObject({
    desiredReceiveAmount: 1000, sourceSettlementOptionId: source.id,
    targetSettlementOptionId: sepa.id, selectedAddOnKeys: [],
  });
  await sendInput.fill('1200');
  await expect(receiveInput).toHaveValue('1065');
  await expect(page.getByTestId('text-exchange-rate')).toContainText('0.92');
  expect(forwardRequests.at(-1)).toMatchObject({ amount: 1200 });

  await receiveInput.fill('1100');
  await expect.poll(() => reverseRequests.some(body => body.desiredReceiveAmount === 1100)).toBe(true);
  await receiveInput.fill('2000');
  await expect(sendInput).toHaveValue('2240');
  await expect.poll(() => staleResponseReleased).toBe(true);
  await expect(sendInput).toHaveValue('2240');
  await expect(receiveInput).toHaveValue('2000');
  expect(cancelledRequests.length).toBeGreaterThan(0);

  await page.getByRole('checkbox').check();
  await expect(sendInput).toHaveValue('2260');
  expect(reverseRequests.at(-1)?.selectedAddOnKeys).toEqual(['priority']);
  await expect(page.getByTestId('text-exchange-rate')).toContainText('0.95');
  await expect(page.getByText('Selected add-ons are deducted from receive')).toHaveCount(0);
  await expect(page.getByText('Existing pricing fee')).toHaveCount(0);
  await expect(page.getByText('Total fees')).toHaveCount(0);
  await expect(page.getByText('Final receive')).toHaveCount(0);
  const rateCard = await page.getByTestId('exchange-rate-summary').boundingBox();
  const addonsTitle = await page.getByRole('heading', { name: 'Optional add-ons' }).boundingBox();
  expect(rateCard!.y + rateCard!.height).toBeLessThanOrEqual(addonsTitle!.y);

  for (const name of ['SEPA Instant', 'Paysera']) {
    if (name === 'Paysera') {
      await page.getByTestId('target-selector-trigger').click();
      await page.getByRole('button').filter({ hasText: 'Paysera' }).click();
      await expect(page.getByTestId('target-selector-trigger')).toContainText(name);
      await expect.poll(() => reverseRequests.at(-1)?.targetSettlementOptionId).toBe(paysera.id);
      await expect(sendInput).toHaveValue('2260');
    }
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await page.locator('.qx-swap-amounts').evaluate(container => {
        const rect = (node: Element) => {
          const bounds = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            width: bounds.width, height: bounds.height, padding: style.padding,
            radius: style.borderRadius, align: style.alignItems,
          };
        };
        return {
          cards: Array.from(container.querySelectorAll('.qx-swap-amount-card')).map(rect),
          selectors: Array.from(container.querySelectorAll('.qx-asset-trigger')).map(rect),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      expect(geometry.cards[0]).toEqual(geometry.cards[1]);
      expect(geometry.selectors[0]).toEqual(geometry.selectors[1]);
      expect(geometry.selectors[0]).toMatchObject({ width: 144, height: 56 });
      expect(geometry.overflow).toBe(false);
    }
  }
});

test('Convert receive-target quoting honors fixed rate mode, requires policy acceptance, and omits refund data', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date('2025-01-01T00:00:00.000Z') });
  await mockTelegramSession(page);
  const reverseQuotes: unknown[] = [];
  const createdOrders: Array<Record<string, unknown>> = [];
  let createAttempt = 0;
  await page.route('**/api/quickex/config', route => route.fulfill({ status: 200, json: quickexConfig }));
  const expiringQuote = { ...quote('convert'), expiresAt: '2025-01-01T00:01:00.000Z' };
  await page.route('**/api/quickex/quote', route => route.fulfill({ status: 200, json: expiringQuote }));
  await page.route('**/api/quickex/quote-by-receive', async route => {
    reverseQuotes.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, json: expiringQuote });
  });
  await page.route('**/api/quickex/create-order', async route => {
    createdOrders.push(route.request().postDataJSON());
    createAttempt++;
    if (createAttempt === 1) {
      await route.fulfill({ status: 503, json: { message: 'Temporary provider response timeout' } });
      return;
    }
    await route.fulfill({ status: 200, json: { id: 'convert-order-fixture', trackingToken: 'convert-tracking-fixture' } });
  });
  await page.route('**/api/telegram/mini-app/orders/link', route =>
    route.fulfill({ status: 200, json: { linked: true } }),
  );

  await page.goto(`${miniApp}/exchange?mode=convert`);
  await expect(page.getByTestId('convert-rate-floating')).toBeVisible();
  await expect(page.getByTestId('exchange-rate-summary')).toHaveCount(0);
  await expect(page.getByTestId('source-selector-trigger')).toContainText('BTC');
  await expect(page.getByTestId('target-selector-trigger')).toContainText('ETH');
  await expect(page.getByTestId('input-receive-amount')).toBeEnabled();
  await page.getByTestId('convert-rate-fixed').click();
  await expect(page.getByTestId('exchange-rate-summary')).toHaveCount(0);
  await page.getByTestId('input-receive-amount').fill('20');
  await page.clock.runFor(600);
  await expect.poll(() => reverseQuotes.length).toBeGreaterThan(0);
  expect(reverseQuotes.at(-1)).toMatchObject({
    desiredReceiveAmount: 20,
    fromAsset: 'BTC',
    toAsset: 'ETH',
    rateMode: 'FIXED',
  });
  await checkExchangeViewports(page, testInfo, 'convert-step1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Enter wallet address').fill('mock-destination-wallet');
  await page.getByPlaceholder('you@example.com').fill('customer@example.test');
  await checkExchangeViewports(page, testInfo, 'convert-step2');
  await page.getByRole('button', { name: 'Review Order' }).click();

  await expect(page.getByTestId('telegram-exchange-policy-checkbox')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms & Conditions' })).toHaveAttribute('href', '/terms');
  await expect(page.getByRole('link', { name: 'AML / KYC policy' })).toHaveAttribute('href', '/aml-kyc');
  await expect(page.getByText(/refund address/i)).toHaveCount(0);
  await checkExchangeViewports(page, testInfo, 'convert-step3');
  await page.getByRole('button', { name: 'Place Order' }).click();
  expect(createdOrders).toHaveLength(0);

  await page.getByTestId('telegram-exchange-policy-checkbox').check();
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect.poll(() => createdOrders.length).toBe(1);
  await expect(page.getByRole('status')).toContainText('Order submission may have been accepted');
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();
  await page.clock.fastForward(61_000);
  await page.reload();
  await expect(page.getByText('Quote expired')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Order submission may have been accepted');
  await page.getByRole('button', { name: 'Retry same order request' }).click();
  await expect.poll(() => createdOrders.length).toBe(2);
  await expect(page).toHaveURL(/\/orders\/convert-order-fixture$/);
  expect(createdOrders[1].clientRequestId).toBe(createdOrders[0].clientRequestId);
  expect(createdOrders[1]).toMatchObject({
    amount: 0.5,
    rateMode: 'FIXED',
    destinationAddress: 'mock-destination-wallet',
    customerEmail: 'customer@example.test',
  });
  expect(createdOrders[0]).not.toHaveProperty('refundAddress');
  expect(createdOrders[0]).not.toHaveProperty('refundMemo');
});

test('Swap receive-target input uses the signed manual receive quote and order contains the exact quoted amounts', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await mockTelegramSession(page);
  const reverseQuotes: unknown[] = [];
  const createdOrders: Array<Record<string, unknown>> = [];
  const swapQuote = {
    ...quote('swap'),
    requiredSettlementFields: [
      { key: 'destination_address', label: 'Custom payout wallet', type: 'wallet-address', required: true },
      { key: 'settlement_channel', label: 'Settlement channel', type: 'select', required: true, options: [{ value: 'bank', label: 'Bank' }, { value: 'card', label: 'Card' }] },
      { key: 'memo', label: 'Conditional custom memo', type: 'memo-tag', requiredWhen: { fieldKey: 'settlement_channel', equals: 'bank' } },
    ],
  };
  await page.route('**/api/exchange/config', route => route.fulfill({ status: 200, json: swapConfig() }));
  await page.route('**/api/exchange/manual-swap-addons', route => route.fulfill({ status: 200, json: { items: [] } }));
  await page.route('**/api/exchange/quote', route => route.fulfill({ status: 200, json: swapQuote }));
  await page.route('**/api/exchange/route-pricing**', route =>
    route.fulfill({ status: 200, json: { rate: 40, minAmount: 0.01, maxAmount: 1000 } }),
  );
  await page.route('**/api/exchange/quote-by-receive', async route => {
    reverseQuotes.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, json: swapQuote });
  });
  await page.route('**/api/exchange/orders', async route => {
    createdOrders.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, json: { id: 'swap-order-fixture', trackingToken: 'swap-tracking-fixture' } });
  });
  await page.route('**/api/telegram/mini-app/orders/link', route =>
    route.fulfill({ status: 200, json: { linked: true } }),
  );

  await page.goto(`${miniApp}/exchange?mode=swap`);
  await page.getByTestId('input-receive-amount').fill('20');
  await expect.poll(() => reverseQuotes.length).toBeGreaterThan(0);
  expect(reverseQuotes.at(-1)).toMatchObject({
    desiredReceiveAmount: 20,
    sourceSettlementOptionId: 'source-btc',
    targetSettlementOptionId: 'target-usdt',
    selectedAddOnKeys: [],
  });
  await checkExchangeViewports(page, testInfo, 'swap-step1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Enter wallet address').fill('mock-destination-wallet');
  await page.getByPlaceholder('Enter custom payout wallet').fill('mock-custom-admin-wallet');
  await page.getByRole('combobox').selectOption('bank');
  await page.getByPlaceholder('Enter conditional custom memo').fill('custom-bank-memo');
  await page.getByPlaceholder('you@example.com').fill('customer@example.test');
  await checkExchangeViewports(page, testInfo, 'swap-step2');
  await page.getByRole('button', { name: 'Review Order' }).click();
  await checkExchangeViewports(page, testInfo, 'swap-step3');
  await page.getByTestId('telegram-exchange-policy-checkbox').check();
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect.poll(() => createdOrders.length).toBe(1);
  expect(createdOrders[0]).toMatchObject({
    amount: 0.5,
    quoteId: 'swap-quote-e2e',
    destinationAddress: 'mock-destination-wallet',
    customerEmail: 'customer@example.test',
    settlementDetails: {
      destination_address: 'mock-custom-admin-wallet',
      settlement_channel: 'bank',
      memo: 'custom-bank-memo',
    },
  });
  expect(createdOrders[0]).not.toHaveProperty('refundAddress');
  expect(createdOrders[0]).not.toHaveProperty('refundMemo');
});

test('definitive Convert validation rejection releases recovery for a corrected new request', async ({ page }) => {
  await mockTelegramSession(page);
  const createdOrders: Array<Record<string, unknown>> = [];
  await page.route('**/api/quickex/config', route => route.fulfill({ status: 200, json: quickexConfig }));
  await page.route('**/api/quickex/quote', route => route.fulfill({ status: 200, json: quote('convert') }));
  await page.route('**/api/quickex/quote-by-receive', route =>
    route.fulfill({ status: 200, json: quote('convert') }),
  );
  await page.route('**/api/quickex/create-order', async route => {
    createdOrders.push(route.request().postDataJSON());
    if (createdOrders.length === 1) {
      await route.fulfill({ status: 400, json: { message: 'Destination details failed validation' } });
      return;
    }
    await route.fulfill({ status: 200, json: { id: 'corrected-convert-order', trackingToken: 'corrected-token' } });
  });
  await page.route('**/api/telegram/mini-app/orders/link', route =>
    route.fulfill({ status: 200, json: { linked: true } }),
  );

  await page.goto(`${miniApp}/exchange?mode=convert`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Enter wallet address').fill('first-wallet');
  await page.getByPlaceholder('you@example.com').fill('customer@example.test');
  await page.getByRole('button', { name: 'Review Order' }).click();
  await page.getByTestId('telegram-exchange-policy-checkbox').check();
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect.poll(() => createdOrders.length).toBe(1);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back' })).toBeEnabled();

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByPlaceholder('Enter wallet address').fill('corrected-wallet');
  await page.getByRole('button', { name: 'Review Order' }).click();
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect.poll(() => createdOrders.length).toBe(2);
  await expect(page).toHaveURL(/\/orders\/corrected-convert-order$/);
  expect(createdOrders[0].clientRequestId).not.toBe(createdOrders[1].clientRequestId);
  expect(createdOrders[1].destinationAddress).toBe('corrected-wallet');
});

test('link failure persists the created order and reload retries linking without another create', async ({ page }) => {
  await mockTelegramSession(page);
  const createdOrders: Array<Record<string, unknown>> = [];
  const linkRequests: Array<Record<string, unknown>> = [];
  await page.route('**/api/quickex/config', route => route.fulfill({ status: 200, json: quickexConfig }));
  await page.route('**/api/quickex/quote', route => route.fulfill({ status: 200, json: quote('convert') }));
  await page.route('**/api/quickex/quote-by-receive', route =>
    route.fulfill({ status: 200, json: quote('convert') }),
  );
  await page.route('**/api/quickex/create-order', async route => {
    createdOrders.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, json: { id: 'link-recovery-order', trackingToken: 'link-recovery-token' } });
  });
  await page.route('**/api/telegram/mini-app/orders/link', async route => {
    linkRequests.push(route.request().postDataJSON());
    if (linkRequests.length === 1) {
      await route.fulfill({ status: 503, json: { message: 'Temporary link failure' } });
      return;
    }
    await route.fulfill({ status: 200, json: { linked: true } });
  });

  await page.goto(`${miniApp}/exchange?mode=convert`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByPlaceholder('Enter wallet address').fill('mock-destination-wallet');
  await page.getByPlaceholder('you@example.com').fill('customer@example.test');
  await page.getByRole('button', { name: 'Review Order' }).click();
  await page.getByTestId('telegram-exchange-policy-checkbox').check();
  await page.getByRole('button', { name: 'Place Order' }).click();
  await expect.poll(() => createdOrders.length).toBe(1);
  await expect.poll(() => linkRequests.length).toBe(1);
  await expect(page.getByRole('status')).toContainText('order was created');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry order linking' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry order linking' }).click();
  await expect.poll(() => linkRequests.length).toBe(2);
  await expect(page).toHaveURL(/\/orders\/link-recovery-order$/);
  expect(createdOrders).toHaveLength(1);
  expect(linkRequests[1]).toEqual(linkRequests[0]);
});