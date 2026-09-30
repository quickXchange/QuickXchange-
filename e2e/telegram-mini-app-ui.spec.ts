import { expect, test, type Page } from '@playwright/test';

const base = '/telegram-mini-app';
const sessionToken = 'mini-app-e2e-session';

async function mockAuthenticatedTelegram(page: Page) {
  const authenticatedRequests: Array<{ url: string; authorization?: string }> = [];

  // Keep the external Telegram SDK from replacing the authenticated test WebApp.
  await page.route('https://telegram.org/js/telegram-web-app.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(() => {
    (window as any).Telegram = {
      WebApp: {
        initData: 'query_id=mini-app-e2e',
        initDataUnsafe: { user: { id: 42, first_name: 'Mini App', username: 'test_user' } },
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

  await page.route('**/api/telegram/mini-app/session', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ initData: 'query_id=mini-app-e2e' });
    await route.fulfill({
      status: 200,
      json: {
        token: sessionToken,
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: { id: '42', displayName: 'Mini App Tester' },
        linkedAccount: false,
      },
    });
  });
  await page.route('**/api/website/branding', route =>
    route.fulfill({ status: 200, json: {} }),
  );

  return authenticatedRequests;
}

const quickexConfig = {
  provider: 'Quickex',
  signedOrders: false,
  instruments: [
    {
      currencyTitle: 'BTC',
      networkTitle: 'TRC20',
      slug: 'btc-trc20',
      instrumentType: 'crypto',
      fullName: 'Bitcoin',
      currencyFriendlyTitle: 'Bitcoin',
      precisionDecimals: 8,
      requiresMemo: false,
    },
    {
      currencyTitle: 'USDT',
      networkTitle: 'TRC20',
      slug: 'usdt-trc20',
      instrumentType: 'crypto',
      fullName: 'Tether',
      currencyFriendlyTitle: 'Tether USD',
      precisionDecimals: 6,
      requiresMemo: false,
    },
    {
      currencyTitle: 'USDC',
      networkTitle: 'ERC20',
      slug: 'usdc-erc20',
      instrumentType: 'crypto',
      fullName: 'USD Coin',
      currencyFriendlyTitle: 'USD Coin',
      precisionDecimals: 6,
      requiresMemo: false,
    },
    {
      currencyTitle: 'ETH',
      networkTitle: 'ERC20',
      slug: 'eth-erc20',
      instrumentType: 'crypto',
      fullName: 'Ethereum',
      currencyFriendlyTitle: 'Ethereum',
      precisionDecimals: 8,
      requiresMemo: false,
    },
  ],
  pairs: [
    { fromAsset: 'BTC', fromNetwork: 'TRC20', toAsset: 'ETH', toNetwork: 'ERC20' },
    { fromAsset: 'USDT', fromNetwork: 'TRC20', toAsset: 'ETH', toNetwork: 'ERC20' },
    { fromAsset: 'USDC', fromNetwork: 'ERC20', toAsset: 'ETH', toNetwork: 'ERC20' },
  ],
};

function makeSwapConfig() {
  const options = [
    {
      id: 'sepa-standard',
      assetId: 'eur',
      assetCode: 'EUR',
      routeNetwork: 'SEPA',
      kind: 'fiat-payment-method',
      title: 'SEPA',
      direction: 'send',
      family: 'bank-transfer',
      executionMode: 'manual',
      lifecycle: 'active',
      regions: [],
      countries: [],
      paymentMethodId: 'sepa',
    },
    {
      id: 'sepa-instant',
      assetId: 'eur',
      assetCode: 'EUR',
      routeNetwork: 'SEPA_INSTANT',
      kind: 'fiat-payment-method',
      title: 'SEPA Instant',
      direction: 'send',
      family: 'bank-transfer',
      executionMode: 'manual',
      lifecycle: 'active',
      regions: [],
      countries: [],
      paymentMethodId: 'sepa-instant',
    },
    {
      id: 'target-usdt',
      assetId: 'usdt',
      assetCode: 'USDT',
      routeNetwork: 'TRC20',
      kind: 'crypto-network',
      title: 'Tether TRC20',
      direction: 'receive',
      executionMode: 'manual',
      lifecycle: 'active',
      regions: [],
      countries: [],
    },
  ];
  return {
    assets: [],
    fiatCurrencies: ['EUR'],
    settlementOptions: options,
    manualSettlementOptions: options,
    manualRouteAvailability: {
      available: true,
      routes: [
        { sourceSettlementOptionId: 'sepa-standard', targetSettlementOptionId: 'target-usdt' },
        { sourceSettlementOptionId: 'sepa-instant', targetSettlementOptionId: 'target-usdt' },
      ],
      unavailableMessage: null,
    },
    providers: [],
    feePercent: 0,
  };
}

test('authenticated Convert and Swap selectors search normalized aliases and network codes', async ({ page }, testInfo) => {
  const authenticatedRequests = await mockAuthenticatedTelegram(page);
  const uploaded = 'https://cdn.example.test/admin-bank.svg';
  await page.route('https://cdn.example.test/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="70" viewBox="0 0 180 70"><circle cx="90" cy="35" r="30" fill="#1547b8"/></svg>',
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/quickex/config', async route => {
    authenticatedRequests.push({
      url: route.request().url(),
      authorization: route.request().headers().authorization,
    });
    await route.fulfill({ status: 200, json: quickexConfig });
  });
  await page.route('**/api/quickex/quote', async route => {
    authenticatedRequests.push({
      url: route.request().url(),
      authorization: route.request().headers().authorization,
    });
    await route.fulfill({ status: 200, json: {} });
  });
  await page.route('**/api/exchange/config', async route => {
    authenticatedRequests.push({
      url: route.request().url(),
      authorization: route.request().headers().authorization,
    });
    const config = makeSwapConfig();
    const withLogo = config.settlementOptions.map(option => option.id === 'sepa-standard'
      ? { ...option, logoUrl: uploaded }
      : option);
    await route.fulfill({
      status: 200,
      json: {
        ...config,
        settlementOptions: withLogo,
        manualSettlementOptions: withLogo,
      },
    });
  });
  await page.route('**/api/exchange/route-pricing**', async route => {
    await route.fulfill({ status: 200, json: { rate: 1, minAmount: 1, maxAmount: 10000 } });
  });

  await page.goto(`${base}/exchange?mode=convert`);
  await expect(page.getByTestId('source-selector-trigger')).toBeVisible();
  await page.getByTestId('source-selector-trigger').click();
  const search = page.getByPlaceholder('Search by name, symbol, or network...');

  await search.fill('  trc ');
  await expect(page.getByText('Bitcoin', { exact: true })).toBeVisible();
  await search.fill('usd');
  await expect(page.getByText('Tether', { exact: true })).toBeVisible();
  await search.fill('ERC');
  await expect(page.getByText('USD Coin', { exact: true })).toBeVisible();
  await expect.poll(() => authenticatedRequests.some(
    request => request.authorization === `Bearer ${sessionToken}`,
  )).toBe(true);

  await page.goto(`${base}/exchange?mode=swap`);
  await expect(page.getByTestId('source-selector-trigger')).toBeVisible();
  await page.getByTestId('source-selector-trigger').click();
  await page.getByPlaceholder('Search by name, symbol, or network...').fill('  sep  ');
  await expect(page.getByRole('button', { name: 'SEPA SEPA EUR · Payment Method', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'SEPA Instant SEPA Instant EUR · Payment Method', exact: true })).toBeVisible();
  const artwork = page.getByRole('button', { name: 'SEPA SEPA EUR · Payment Method' })
    .locator(`img[src="${uploaded}"]`);
  await expect(artwork).toBeVisible();
  await expect(artwork).toHaveJSProperty('naturalWidth', 180);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    for (const dark of [false, true]) {
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      const visual = await artwork.evaluate(image => {
        const circle = image.parentElement!;
        const bounds = circle.getBoundingClientRect();
        return {
          source: image.getAttribute('src'),
          background: getComputedStyle(circle).backgroundColor,
          imageBackground: getComputedStyle(image).backgroundColor,
          radius: getComputedStyle(circle).borderRadius,
          fit: getComputedStyle(image).objectFit,
          position: getComputedStyle(image).objectPosition,
          width: bounds.width,
          height: bounds.height,
        };
      });
      expect(visual.source).toBe(uploaded);
      expect(visual.background).toBe('rgba(0, 0, 0, 0)');
      expect(visual.imageBackground).toBe('rgba(0, 0, 0, 0)');
      expect(visual.radius === '50%' || parseFloat(visual.radius) >= visual.width / 2).toBe(true);
      expect(visual.fit).toBe('contain');
      expect(visual.position).toBe('50% 50%');
      expect(visual.width).toBe(visual.height);
      await artwork.locator('xpath=..').screenshot({
        path: testInfo.outputPath(`mini-payment-${width}-${dark ? 'dark' : 'light'}.png`),
      });
    }
  }
});

test('authenticated View Order renders the canonical uploaded logo in the shared circular renderer', async ({ page }) => {
  const authenticatedRequests = await mockAuthenticatedTelegram(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const orderId = 'mini-app-order-123';
  const canonicalLogo = 'https://cdn.example.test/admin-btc.svg';
  const networkLogo = 'https://cdn.example.test/tron.svg';

  await page.route('**/api/exchange/config', async route => {
    await route.fulfill({
      status: 200,
      json: {
        assets: [],
        fiatCurrencies: [],
        settlementOptions: [
          {
            id: 'btc-tron',
            assetId: 'btc',
            assetCode: 'BTC',
            routeNetwork: 'TRC20',
            kind: 'crypto-network',
            title: 'Bitcoin · Tron',
            direction: 'both',
            executionMode: 'manual',
            lifecycle: 'active',
            regions: [],
            countries: [],
            logoUrl: canonicalLogo,
            networkLogoUrl: networkLogo,
          },
          {
            id: 'eth-ethereum',
            assetId: 'eth',
            assetCode: 'ETH',
            routeNetwork: 'ERC20',
            kind: 'crypto-network',
            title: 'Ethereum',
            direction: 'both',
            executionMode: 'manual',
            lifecycle: 'active',
            regions: [],
            countries: [],
            logoUrl: 'https://cdn.example.test/admin-eth.svg',
            networkLogoUrl: 'https://cdn.example.test/ethereum.svg',
          },
        ],
        manualRouteAvailability: { available: false, routes: [], unavailableMessage: null },
        providers: [],
        feePercent: 0,
      },
    });
  });
  await page.route(`**/api/telegram/mini-app/orders/${orderId}`, async route => {
    authenticatedRequests.push({
      url: route.request().url(),
      authorization: route.request().headers().authorization,
    });
    await route.fulfill({
      status: 200,
      json: {
        id: orderId,
        orderKind: 'convert',
        type: 'instant',
        status: 'pending',
        fromAsset: 'BTC',
        fromNetwork: 'TRC20',
        sourceSettlementOptionId: 'btc-tron',
        toAsset: 'ETH',
        toNetwork: 'ERC20',
        targetSettlementOptionId: 'eth-ethereum',
        amount: '1',
        receiveAmount: '0.05',
        trackingToken: 'public-order-token',
        createdAt: '2025-05-01T12:00:00.000Z',
        logos: { from: 'https://cdn.example.test/order-btc.svg' },
      },
    });
  });
  await page.route(`**/api/orders/${orderId}/status**`, async route => {
    await route.fulfill({
      status: 200,
      json: {
        id: orderId,
        type: 'instant',
        status: 'pending',
        fromAsset: 'BTC',
        fromNetwork: 'TRC20',
        toAsset: 'ETH',
        toNetwork: 'ERC20',
        amount: '1',
        receiveAmount: '0.05',
        outcomeUnknown: false,
        refreshUnavailable: false,
        providerFreshness: { state: 'healthy', syncing: false },
        createdAt: '2025-05-01T12:00:00.000Z',
      },
    });
  });
  await page.route('https://cdn.example.test/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="white"/><text x="5" y="40">Logo</text></svg>',
    });
  });

  await page.goto(`${base}/orders/${orderId}`);
  await expect(page.getByText('Exchange Summary')).toBeVisible();
  await expect(page.getByText('You Send')).toBeVisible();
  await expect(page.locator(`img[src="${canonicalLogo}"]`).first()).toBeVisible();

  const summaryLogos = page.locator(`img[src="${canonicalLogo}"]`);
  await expect(summaryLogos).toHaveCount(2);
  for (const logo of await summaryLogos.all()) {
    await expect(logo).toHaveClass(/object-contain/);
    await expect(logo).toHaveClass(/object-center/);
    await expect(logo.locator('xpath=..')).toHaveClass(/rounded-full/);
  }
  const badge = page.locator(`img[src="${networkLogo}"]`).first();
  await expect(badge).toBeVisible();
  await expect(badge.locator('xpath=..')).toHaveClass(/qx-network-badge/);
  const badgeBounds = await badge.locator('xpath=..').boundingBox();
  // The order summary uses MiniAppLogo's medium host size (14px badge).
  expect(badgeBounds?.width).toBe(14);
  expect(badgeBounds?.height).toBe(14);
  expect(authenticatedRequests.some(request =>
    request.url.includes(`/api/telegram/mini-app/orders/${orderId}`) &&
    request.authorization === `Bearer ${sessionToken}`,
  )).toBe(true);
});