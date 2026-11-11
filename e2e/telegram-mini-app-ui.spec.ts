import { expect, test, type Page } from '@playwright/test';
import { loadDictionary, translate } from '../lib/i18n/src/runtime';
import type { Locale } from '../lib/i18n/src/types';
import { mockLanguageBootstrap } from './language-bootstrap';

test.beforeEach(async ({ page }) => mockLanguageBootstrap(page));

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

test('all seven Mini App languages persist and render translated Swap/Convert UI in light and dark', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const unexpectedApiRequests: string[] = [];
  const unexpectedWrites: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')
      && request.method() !== 'GET'
      && url.pathname !== '/api/telegram/mini-app/session') {
      unexpectedWrites.push(`${request.method()} ${url.pathname}`);
    }
  });

  // Isolate every API request. Language bootstrap falls back to the shared
  // mockLanguageBootstrap route; no production API or financial write is used.
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/languages' || path.startsWith('/api/languages/dictionaries/')) {
      return route.fallback();
    }
    if (path === '/api/exchange/config') return route.fulfill({ status: 200, json: makeSwapConfig() });
    if (path === '/api/quickex/config') return route.fulfill({ status: 200, json: quickexConfig });
    if (path === '/api/exchange/route-pricing') {
      return route.fulfill({ status: 200, json: { rate: 1, minAmount: 1, maxAmount: 10000 } });
    }
    if (path === '/api/exchange/manual-swap-addons') {
      return route.fulfill({ status: 200, json: { items: [] } });
    }
    unexpectedApiRequests.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 501, json: { error: 'Unexpected request blocked by Mini App language fixture' } });
  });
  await mockAuthenticatedTelegram(page);
  await page.setViewportSize({ width: 390, height: 844 });

  const locales = ['en', 'fr', 'de', 'ru', 'es', 'ko', 'uk'] as const;
  const assertModeText = async (locale: typeof locales[number], mode: 'swap' | 'convert') => {
    const dictionary = await loadDictionary(locale as Locale);
    const expectedSwap = translate(dictionary, 'customer.m6ec282d40a8a');
    const expectedConvert = translate(dictionary, 'customer.m5cd425f518c2');
    const expectedSendAmount = translate(dictionary, 'customer.m59ce39c2257b');
    const expectedReceiveAmount = translate(dictionary, 'customer.m5fc013f5c6f4');
    const expectedHeading = mode === 'swap' ? expectedSwap : expectedConvert;
    await expect(page.locator('.qx-exchange-heading')).toHaveText(expectedHeading);
    await expect(page.locator('.qx-exchange-tabs')).toContainText(expectedSwap);
    await expect(page.locator('.qx-exchange-tabs')).toContainText(expectedConvert);
    await expect(page.getByTestId('input-send-amount')).toHaveAttribute('aria-label', expectedSendAmount);
    await expect(page.getByTestId('input-receive-amount')).toHaveAttribute('aria-label', expectedReceiveAmount);
  };

  for (const dark of [false, true]) {
    await page.goto(`${base}/exchange?mode=swap`);
    await page.evaluate(isDark => document.documentElement.classList.toggle('dark', isDark), dark);
    await expect(page.getByTestId('mini-app-language-selector')).toBeVisible();
    for (const locale of locales) {
      const selector = page.getByTestId('mini-app-language-selector');
      await expect(selector).toBeEnabled();
      await selector.selectOption(locale);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('qx-locale'))).toBe(locale);
      await assertModeText(locale, 'swap');

      const dictionary = await loadDictionary(locale as Locale);
      const expectedSwap = translate(dictionary, 'customer.m6ec282d40a8a');
      const expectedConvert = translate(dictionary, 'customer.m5cd425f518c2');
      await page.getByRole('button', { name: expectedConvert, exact: true }).click();
      await expect(page).toHaveURL(/mode=convert/);
      await assertModeText(locale, 'convert');

      await page.reload();
      await expect(page.getByTestId('mini-app-language-selector')).toHaveValue(locale);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('qx-locale'))).toBe(locale);
      await page.evaluate(isDark => document.documentElement.classList.toggle('dark', isDark), dark);
      await assertModeText(locale, 'convert');
      await page.getByRole('button', { name: expectedSwap, exact: true }).click();
      await expect(page).toHaveURL(/mode=swap/);
      await assertModeText(locale, 'swap');
    }
    await page.screenshot({ path: testInfo.outputPath(`mini-language-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(dark);
  }
  expect(unexpectedApiRequests).toEqual([]);
  expect(unexpectedWrites).toEqual([]);
});

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
  await search.fill('BTC');
  await page.getByText('Bitcoin', { exact: true }).first().click();
  await page.getByRole('textbox', { name: 'You Send amount' }).fill('0.5');
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