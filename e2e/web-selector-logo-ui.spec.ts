import { expect, test } from '@playwright/test';

const swapOptions = [
  {
    id: 'usd-fiat',
    assetId: 'usd-fiat',
    assetCode: 'USD',
    kind: 'fiat-payment-method',
    title: 'Bank transfer',
    paymentMethodId: 'bank-transfer',
    direction: 'both',
    routeNetwork: 'Bank transfer',
  },
  {
    id: 'eur-sepa',
    assetId: 'eur-fiat',
    assetCode: 'EUR',
    kind: 'fiat-payment-method',
    title: 'SEPA',
    paymentMethodId: 'sepa',
    direction: 'both',
    routeNetwork: 'SEPA',
  },
  {
    id: 'eur-sepa-instant',
    assetId: 'eur-fiat',
    assetCode: 'EUR',
    kind: 'fiat-payment-method',
    title: 'SEPA Instant',
    paymentMethodId: 'sepa-instant',
    direction: 'both',
    routeNetwork: 'SEPA Instant',
  },
  {
    id: 'usdt-trc20',
    assetId: 'usdt',
    assetCode: 'USDT',
    kind: 'crypto-network',
    title: 'Tether TRON',
    networkSlug: 'usdt-trc20',
    networkTitle: 'TRON',
    routeNetwork: 'TRC20',
    direction: 'both',
  },
  {
    id: 'usdc-erc20',
    assetId: 'usdc',
    assetCode: 'USDC',
    kind: 'crypto-network',
    title: 'USD Coin Ethereum',
    networkSlug: 'usdc-ethereum',
    networkTitle: 'Ethereum',
    routeNetwork: 'ERC20',
    direction: 'both',
  },
  {
    id: 'btc-bitcoin',
    assetId: 'btc',
    assetCode: 'BTC',
    kind: 'crypto-network',
    title: 'Bitcoin',
    networkSlug: 'btc-bitcoin',
    networkTitle: 'Bitcoin',
    routeNetwork: 'Bitcoin',
    direction: 'both',
  },
];

const exchangeConfig = {
  assets: [
    { id: 'usd-fiat', code: 'USD', name: 'US Dollar', kind: 'fiat', network: 'fiat', requiresMemo: false, precision: 2 },
    { id: 'eur-fiat', code: 'EUR', name: 'Euro', kind: 'fiat', network: 'fiat', requiresMemo: false, precision: 2 },
    { id: 'usdt', code: 'USDT', name: 'Tether', kind: 'crypto', network: 'TRC20', requiresMemo: false, precision: 6 },
    { id: 'usdc', code: 'USDC', name: 'USD Coin', kind: 'crypto', network: 'ERC20', requiresMemo: false, precision: 6 },
    { id: 'btc', code: 'BTC', name: 'Bitcoin', kind: 'crypto', network: 'Bitcoin', requiresMemo: false, precision: 8 },
  ],
  fiatCurrencies: ['USD', 'EUR'],
  settlementOptions: swapOptions,
  manualSettlementOptions: swapOptions,
  manualRouteAvailability: {
    available: true,
    routes: swapOptions.flatMap(source => swapOptions
      .filter(target => target.id !== source.id)
      .map(target => ({
        sourceSettlementOptionId: source.id,
        targetSettlementOptionId: target.id,
      }))),
    unavailableMessage: null,
  },
  instantSettlementOptions: [
    { id: 'api:quickex:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', kind: 'crypto-network', title: 'BTC Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'both', executionMode: 'api', providerId: 'quickex' },
    { id: 'api:quickex:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', kind: 'crypto-network', title: 'USDT TRON', networkSlug: 'usdt-trc20', networkTitle: 'TRON', routeNetwork: 'TRC20', direction: 'both', executionMode: 'api', providerId: 'quickex' },
    { id: 'api:quickex:usdc-ethereum', assetId: 'usdc', assetCode: 'USDC', kind: 'crypto-network', title: 'USDC Ethereum', networkSlug: 'usdc-ethereum', networkTitle: 'Ethereum', routeNetwork: 'ERC20', direction: 'both', executionMode: 'api', providerId: 'quickex' },
  ],
  providers: ['Instant exchange', 'Manual desk'],
  feePercent: 0.6,
};

const quickexConfig = {
  provider: 'Quickex',
  signedOrders: true,
  instruments: [
    { currencyTitle: 'BTC', networkTitle: 'Bitcoin', slug: 'btc-bitcoin', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', precisionDecimals: 8, requiresMemo: false },
    { currencyTitle: 'USDT', networkTitle: 'TRC20', slug: 'usdt-trc20', instrumentType: 'crypto', fullName: 'Tether', currencyFriendlyTitle: 'Tether USD', precisionDecimals: 6, requiresMemo: false },
    { currencyTitle: 'USDC', networkTitle: 'ERC20', slug: 'usdc-ethereum', instrumentType: 'crypto', fullName: 'USD Coin', currencyFriendlyTitle: 'USD Coin', precisionDecimals: 6, requiresMemo: false },
  ],
  pairs: [
    { fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' },
    { fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDC', toNetwork: 'ERC20' },
  ],
};

test('Swap and Convert selector searches match payment methods, networks, and tickers', async ({ page }) => {
  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(exchangeConfig),
  }));
  await page.route('**/api/quickex/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(quickexConfig),
  }));

  await page.goto('/');

  await page.getByTestId('select-to-asset').click();
  await page.getByTestId('search-to-asset').fill('sep');
  await expect(page.getByTestId('option-to-asset-eur-sepa')).toBeVisible();
  await expect(page.getByTestId('option-to-asset-eur-sepa-instant')).toBeVisible();

  await page.getByTestId('search-to-asset').fill('trc');
  await expect(page.getByTestId('option-to-asset-usdt-trc20')).toBeVisible();
  await expect(page.getByTestId('option-to-asset-usdc-erc20')).toHaveCount(0);

  await page.getByTestId('search-to-asset').fill('erc');
  await expect(page.getByTestId('option-to-asset-usdc-erc20')).toBeVisible();
  await expect(page.getByTestId('option-to-asset-usdt-trc20')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await page.getByTestId('button-mode-select-instant').click();
  await page.getByTestId('convert-select-to-asset').click();
  await page.getByTestId('search-convert-to-asset').fill('usd');
  await expect(page.getByTestId('option-convert-to-asset-usdt-trc20')).toBeVisible();
  await expect(page.getByTestId('option-convert-to-asset-usdc-ethereum')).toBeVisible();
});

test('shared Web payment artwork has no painted mat in both themes and viewport sizes', async ({ page }, testInfo) => {
  const uploaded = 'https://cdn.example.test/admin-bank.svg';
  await page.route('https://cdn.example.test/**', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="70" viewBox="0 0 180 70"><circle cx="90" cy="35" r="30" fill="#1547b8"/></svg>',
  }));
  const options = swapOptions.map(option => option.id === 'usd-fiat'
    ? { ...option, logoUrl: uploaded }
    : option);
  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    json: { ...exchangeConfig, settlementOptions: options, manualSettlementOptions: options },
  }));
  await page.route('**/api/quickex/config', route => route.fulfill({
    status: 200,
    json: quickexConfig,
  }));
  await page.goto('/');
  await page.getByTestId('select-from-asset').click();
  await page.getByTestId('option-from-asset-usd-fiat').click();
  const avatar = page.getByTestId('select-from-asset').locator('.payment-method-logo-stack .logo-avatar').first();
  await expect(avatar).toBeVisible();
  await expect(avatar.locator('img')).toHaveJSProperty('naturalWidth', 180);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    for (const dark of [false, true]) {
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      await expect(avatar).toBeVisible();
      const visual = await avatar.evaluate(element => {
        const image = element.querySelector('img')!;
        const outer = element.getBoundingClientRect();
        return {
          background: getComputedStyle(element).backgroundColor,
          radius: getComputedStyle(element).borderRadius,
          width: outer.width,
          height: outer.height,
          imageBackground: getComputedStyle(image).backgroundColor,
          fit: getComputedStyle(image).objectFit,
          position: getComputedStyle(image).objectPosition,
          source: image.getAttribute('src'),
        };
      });
      expect(visual.background).toBe('rgba(0, 0, 0, 0)');
      expect(visual.imageBackground).toBe('rgba(0, 0, 0, 0)');
      expect(visual.radius === '50%' || parseFloat(visual.radius) >= visual.width / 2).toBe(true);
      expect(visual.width).toBe(visual.height);
      expect(visual.fit).toBe('contain');
      expect(visual.position).toBe('50% 50%');
      expect(visual.source).toBe(uploaded);
      await avatar.screenshot({ path: testInfo.outputPath(`web-payment-${width}-${dark ? 'dark' : 'light'}.png`) });
    }
  }
});