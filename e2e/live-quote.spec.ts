import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const exchangeConfig = {
  assets: [
    {
      id: 'usd-fiat',
      code: 'USD',
      name: 'US Dollar',
      kind: 'fiat',
      network: 'fiat',
      requiresMemo: false,
      precision: 2,
    },
    {
      id: 'eur-fiat',
      code: 'EUR',
      name: 'Euro',
      kind: 'fiat',
      network: 'fiat',
      requiresMemo: false,
      precision: 2,
    },
    {
      id: 'btc-bitcoin',
      code: 'BTC',
      name: 'Bitcoin',
      kind: 'crypto',
      network: 'Bitcoin',
      requiresMemo: false,
      precision: 8,
    },
    {
      id: 'usdt-trc20',
      code: 'USDT',
      name: 'Tether',
      kind: 'crypto',
      network: 'TRC20',
      requiresMemo: false,
      precision: 6,
    },
    {
      id: 'xrp-xrpl',
      code: 'XRP',
      name: 'XRP',
      kind: 'crypto',
      network: 'XRP Ledger',
      requiresMemo: true,
      precision: 6,
    },
  ],
  fiatCurrencies: ['USD', 'EUR'],
  settlementOptions: [
    { id: 'usd-fiat', assetId: 'usd-fiat', assetCode: 'USD', kind: 'fiat-payment-method', title: 'Bank transfer', paymentMethodId: 'bank-transfer', direction: 'both', routeNetwork: 'Bank transfer', fields: [{ key: 'account_number', type: 'text', label: 'Account number', required: true }] },
    { id: 'eur-fiat', assetId: 'eur-fiat', assetCode: 'EUR', kind: 'fiat-payment-method', title: 'SEPA transfer', paymentMethodId: 'sepa', direction: 'both', routeNetwork: 'SEPA transfer' },
    { id: 'btc-bitcoin', assetId: 'btc-bitcoin', assetCode: 'BTC', kind: 'crypto-network', title: 'Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'both' },
    { id: 'usdt-trc20', assetId: 'usdt-trc20', assetCode: 'USDT', kind: 'crypto-network', title: 'Tether', networkSlug: 'usdt-trc20', networkTitle: 'TRC20', routeNetwork: 'TRC20', direction: 'both' },
    { id: 'xrp-xrpl', assetId: 'xrp-xrpl', assetCode: 'XRP', kind: 'crypto-network', title: 'XRP', networkSlug: 'xrp-xrpl', networkTitle: 'XRP Ledger', routeNetwork: 'Ripple', direction: 'both', requiresMemo: true },
  ],
  manualSettlementOptions: [
    { id: 'usd-fiat', assetId: 'usd-fiat', assetCode: 'USD', kind: 'fiat-payment-method', title: 'Bank transfer', paymentMethodId: 'bank-transfer', direction: 'both', routeNetwork: 'Bank transfer', fields: [{ key: 'account_number', type: 'text', label: 'Account number', required: true }] },
    { id: 'eur-fiat', assetId: 'eur-fiat', assetCode: 'EUR', kind: 'fiat-payment-method', title: 'SEPA transfer', paymentMethodId: 'sepa', direction: 'both', routeNetwork: 'SEPA transfer' },
    { id: 'btc-bitcoin', assetId: 'btc-bitcoin', assetCode: 'BTC', kind: 'crypto-network', title: 'Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'both' },
    { id: 'usdt-trc20', assetId: 'usdt-trc20', assetCode: 'USDT', kind: 'crypto-network', title: 'Tether', networkSlug: 'usdt-trc20', networkTitle: 'TRC20', routeNetwork: 'TRC20', direction: 'both' },
    { id: 'xrp-xrpl', assetId: 'xrp-xrpl', assetCode: 'XRP', kind: 'crypto-network', title: 'XRP', networkSlug: 'xrp-xrpl', networkTitle: 'XRP Ledger', routeNetwork: 'Ripple', direction: 'both', requiresMemo: true },
  ],
  manualRouteAvailability: {
    available: true,
    routes: [
      { sourceSettlementOptionId: 'usd-fiat', targetSettlementOptionId: 'eur-fiat' },
      { sourceSettlementOptionId: 'usd-fiat', targetSettlementOptionId: 'btc-bitcoin' },
      { sourceSettlementOptionId: 'usd-fiat', targetSettlementOptionId: 'usdt-trc20' },
      { sourceSettlementOptionId: 'usd-fiat', targetSettlementOptionId: 'xrp-xrpl' },
      { sourceSettlementOptionId: 'eur-fiat', targetSettlementOptionId: 'usd-fiat' },
      { sourceSettlementOptionId: 'eur-fiat', targetSettlementOptionId: 'btc-bitcoin' },
      { sourceSettlementOptionId: 'eur-fiat', targetSettlementOptionId: 'usdt-trc20' },
      { sourceSettlementOptionId: 'eur-fiat', targetSettlementOptionId: 'xrp-xrpl' },
      { sourceSettlementOptionId: 'btc-bitcoin', targetSettlementOptionId: 'usd-fiat' },
      { sourceSettlementOptionId: 'btc-bitcoin', targetSettlementOptionId: 'eur-fiat' },
      { sourceSettlementOptionId: 'usdt-trc20', targetSettlementOptionId: 'usd-fiat' },
      { sourceSettlementOptionId: 'usdt-trc20', targetSettlementOptionId: 'eur-fiat' },
      { sourceSettlementOptionId: 'xrp-xrpl', targetSettlementOptionId: 'usd-fiat' },
      { sourceSettlementOptionId: 'xrp-xrpl', targetSettlementOptionId: 'eur-fiat' },
    ],
    unavailableMessage: null,
  },
  providers: ['Instant exchange', 'Manual desk'],
  feePercent: 0.6,
};
const instantExchangeConfig = {
  ...exchangeConfig,
  instantSettlementOptions: [
    { id: 'api:quickex:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', kind: 'crypto-network', title: 'BTC Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'both', executionMode: 'api', providerId: 'quickex' },
    { id: 'api:quickex:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', kind: 'crypto-network', title: 'USDT Tron', networkSlug: 'usdt-trc20', networkTitle: 'Tron', routeNetwork: 'TRC20', direction: 'both', executionMode: 'api', providerId: 'quickex' },
  ],
};

const standardFiatFields = [
  { key: 'name', type: 'account-name', label: 'Name', direction: 'both', required: true, min: 2, max: 140 },
  { key: 'bank_detail', type: 'account-number', label: 'Bank detail (IBAN or account number)', direction: 'both', required: true, min: 2, max: 64 },
  { key: 'bank_name', type: 'short-text', label: 'Bank name', direction: 'both', required: true, min: 2, max: 140 },
  { key: 'payment_description', type: 'long-text', label: 'Payment description', direction: 'both', required: false, max: 500 },
  { key: 'telegram_or_whatsapp', type: 'short-text', label: 'Your Telegram or WhatsApp', direction: 'both', required: false, max: 100 },
];

const paymentFieldExchangeConfig = {
  ...exchangeConfig,
  settlementOptions: exchangeConfig.settlementOptions.map(option => (
    option.kind === 'fiat-payment-method' ? { ...option, fields: standardFiatFields } : option
  )),
  manualSettlementOptions: exchangeConfig.manualSettlementOptions.map(option => (
    option.kind === 'fiat-payment-method' ? { ...option, fields: standardFiatFields } : option
  )),
};

async function chooseAsset(
  page: Page,
  selectTestId: 'select-from-asset' | 'select-to-asset',
  optionId: string,
  query: string,
) {
  await page.getByTestId(selectTestId).click();
  const searchTestId = selectTestId === 'select-from-asset'
    ? 'search-from-asset'
    : 'search-to-asset';
  await page.getByTestId(searchTestId).fill(query);
  await page.getByTestId(`option-${selectTestId.replace('select-', '')}-${optionId}`).click();
}

async function openLanguageSelector(page: Page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await page.locator('.qx-language-trigger:visible').first().click({ timeout: 1500 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      // The public shell can finish an i18n/config render between locator
      // resolution and the click. Reacquire the locator after that render.
      await page.waitForTimeout(100);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/quickex/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      provider: 'Quickex',
      signedOrders: false,
      instruments: [],
      pairs: [],
    }),
  }));
});

test('keeps the landing tickers seamless, opposed, and accessible with reduced motion', async ({
  page,
}) => {
  const tickerConfig = {
    ...exchangeConfig,
    manualSettlementOptions: [
      ...exchangeConfig.manualSettlementOptions,
      { id: 'sepa-featured', assetId: 'eur-fiat', assetCode: 'EUR', kind: 'fiat-payment-method', title: 'SEPA EUR', paymentMethodId: 'sepa-featured', direction: 'both', routeNetwork: 'SEPA', lifecycle: 'active' },
      { id: 'sepa-duplicate', assetId: 'eur-fiat', assetCode: 'EUR', kind: 'fiat-payment-method', title: 'SEPA EUR', paymentMethodId: 'sepa-duplicate', direction: 'both', routeNetwork: 'SEPA', lifecycle: 'active' },
      { id: 'wise-active', assetId: 'usd-fiat', assetCode: 'USD', kind: 'fiat-payment-method', title: 'Wise USD', paymentMethodId: 'wise-active', direction: 'both', routeNetwork: 'Wise', lifecycle: 'active' },
    ],
  };

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(tickerConfig),
  }));
  await page.route('https://api.exchange.coinbase.com/products', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));

  const assertAnimatedTickers = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    if (await page.locator('.ticker-viewport').count() === 0) {
      expect(await page.evaluate(() => (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      ))).toBe(0);
      return false;
    }
    await expect(page.locator('.ticker-viewport')).toBeVisible();
    await expect(page.locator('.payment-ticker-viewport')).toBeVisible();

    const tickerState = await page.evaluate(() => {
      const marketViewport = document.querySelector<HTMLElement>('.ticker-viewport')!;
      const paymentViewport = document.querySelector<HTMLElement>('.payment-ticker-viewport')!;
      const marketTrack = marketViewport.querySelector<HTMLElement>('.ticker-track')!;
      const paymentTrack = paymentViewport.querySelector<HTMLElement>('.payment-ticker-track')!;
      const marketSequences = marketTrack.querySelectorAll<HTMLElement>('.ticker-sequence');
      const paymentSequences = paymentTrack.querySelectorAll<HTMLElement>('.payment-ticker-sequence');
      const marketAnimation = marketTrack.getAnimations()[0]!;
      const paymentAnimation = paymentTrack.getAnimations()[0]!;
      const marketFrames = (marketAnimation.effect as KeyframeEffect).getKeyframes();
      const paymentFrames = (paymentAnimation.effect as KeyframeEffect).getKeyframes();
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        marketSequenceCount: marketSequences.length,
        paymentSequenceCount: paymentSequences.length,
        marketDuplicateHidden: marketSequences[1]?.getAttribute('aria-hidden'),
        paymentDuplicateHidden: paymentSequences[1]?.getAttribute('aria-hidden'),
        marketAnimation: {
          name: getComputedStyle(marketTrack).animationName,
          playState: marketAnimation.playState,
          iterations: marketAnimation.effect?.getTiming().iterations,
          from: String(marketFrames[0]?.transform),
          to: String(marketFrames.at(-1)?.transform),
        },
        paymentAnimation: {
          name: getComputedStyle(paymentTrack).animationName,
          playState: paymentAnimation.playState,
          iterations: paymentAnimation.effect?.getTiming().iterations,
          from: String(paymentFrames[0]?.transform),
          to: String(paymentFrames.at(-1)?.transform),
        },
      };
    });

    expect(tickerState.documentOverflow).toBe(0);
    expect(tickerState.marketSequenceCount).toBe(2);
    expect(tickerState.paymentSequenceCount).toBe(2);
    expect(tickerState.marketDuplicateHidden).toBe('true');
    expect(tickerState.paymentDuplicateHidden).toBe('true');
    expect(tickerState.marketAnimation).toMatchObject({
      name: 'market-ticker-chain',
      iterations: Infinity,
      from: 'translate3d(0px, 0px, 0px)',
      to: 'translate3d(-50%, 0px, 0px)',
    });
    expect(tickerState.paymentAnimation).toMatchObject({
      name: 'payment-ticker-chain',
      iterations: Infinity,
      from: 'translate3d(-50%, 0px, 0px)',
      to: 'translate3d(0px, 0px, 0px)',
    });
    return true;
  };

  if (!(await assertAnimatedTickers(1440, 900))) return;

  const primaryPaymentLabels = await page.locator(
    '.payment-ticker-sequence:not([aria-hidden="true"]) .payment-ticker-item',
  ).allTextContents();
  const normalizedPaymentLabels = primaryPaymentLabels.map(label => label.trim().toLocaleLowerCase());
  expect(normalizedPaymentLabels).toHaveLength(new Set(normalizedPaymentLabels).size);
  expect(normalizedPaymentLabels).not.toContain('+ more');
  expect(normalizedPaymentLabels.some(label => label.includes('+ more'))).toBe(false);

  await assertAnimatedTickers(390, 844);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const reducedMotionState = await page.evaluate(() => {
    const inspect = (viewportSelector: string, trackSelector: string, itemSelector: string) => {
      const viewport = document.querySelector<HTMLElement>(viewportSelector)!;
      const track = viewport.querySelector<HTMLElement>(trackSelector)!;
      const firstItem = track.querySelector<HTMLElement>(itemSelector)!;
      return {
        animationName: getComputedStyle(track).animationName,
        overflowX: getComputedStyle(viewport).overflowX,
        canScroll: viewport.scrollWidth > viewport.clientWidth,
        firstItemVisible: firstItem.getBoundingClientRect().width > 0
          && firstItem.getBoundingClientRect().height > 0,
      };
    };

    return {
      market: inspect('.ticker-viewport', '.ticker-track', '.ticker-item'),
      payment: inspect('.payment-ticker-viewport', '.payment-ticker-track', '.payment-ticker-item'),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(reducedMotionState.market).toEqual({
    animationName: 'none',
    overflowX: 'auto',
    canScroll: true,
    firstItemVisible: true,
  });
  expect(reducedMotionState.payment).toEqual({
    animationName: 'none',
    overflowX: 'auto',
    canScroll: true,
    firstItemVisible: true,
  });
  expect(reducedMotionState.documentOverflow).toBe(0);
});

test('shows configuration unavailable before quote submission when no manual route is covered', async ({
  page,
}) => {
  let quoteRequests = 0;
  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...exchangeConfig,
      manualRouteAvailability: {
        available: false,
        routes: [],
        unavailableMessage: 'Manual Swap is temporarily unavailable because no routes are configured.',
      },
    }),
  }));
  await page.route('**/api/exchange/quote', route => {
    quoteRequests += 1;
    return route.abort();
  });

  await page.goto('/');
  await expect(page.getByText('Manual Swap is temporarily unavailable because no routes are configured.')).toBeVisible();
  await expect(page.getByTestId('input-amount')).toBeDisabled();
  await expect(page.getByTestId('select-from-asset')).toHaveAttribute('data-value', '');
  await expect(page.getByTestId('select-to-asset')).toHaveAttribute('data-value', '');
  expect(quoteRequests).toBe(0);
});

test('Swap source choices require covered source IDs and keep receive-only crypto receive-only', async ({ page }) => {
  const bnb = {
    id: 'crypto:bnb-bep20',
    assetId: 'bnb',
    assetCode: 'BNB',
    kind: 'crypto-network',
    title: 'BNB BNB Smart Chain',
    networkSlug: 'bnb-bep20',
    networkTitle: 'BNB Smart Chain',
    routeNetwork: 'BEP20',
    direction: 'both',
    customerDepositsEnabled: true,
  };
  const usdc = {
    id: 'crypto:usdc-bep20',
    assetId: 'usdc',
    assetCode: 'USDC',
    kind: 'crypto-network',
    title: 'USDC BNB Smart Chain',
    networkSlug: 'usdc-bep20',
    networkTitle: 'BNB Smart Chain',
    routeNetwork: 'BEP20',
    direction: 'both',
    customerDepositsEnabled: true,
  };
  const monero = {
    id: 'crypto:xmr-monero',
    assetId: 'xmr',
    assetCode: 'XMR',
    kind: 'crypto-network',
    title: 'XMR Monero',
    networkSlug: 'xmr-monero',
    networkTitle: 'Monero',
    routeNetwork: 'Monero',
    direction: 'receive',
    customerDepositsEnabled: false,
  };
  const configuredButUncovered = {
    id: 'crypto:isolated-bep20',
    assetId: 'isolated',
    assetCode: 'ISOLATED',
    kind: 'crypto-network',
    title: 'Isolated BNB Smart Chain',
    networkSlug: 'isolated-bep20',
    networkTitle: 'BNB Smart Chain',
    routeNetwork: 'BEP20',
    direction: 'both',
    customerDepositsEnabled: true,
  };
  const options = [bnb, usdc, monero, configuredButUncovered];
  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...exchangeConfig,
      settlementOptions: options,
      manualSettlementOptions: options,
      manualRouteAvailability: {
        available: true,
        routes: [
          { sourceSettlementOptionId: bnb.id, targetSettlementOptionId: monero.id },
          { sourceSettlementOptionId: usdc.id, targetSettlementOptionId: monero.id },
        ],
        unavailableMessage: null,
      },
    }),
  }));
  await page.route('**/api/exchange/route-pricing**', route => route.abort());

  await page.goto('/');
  await expect(page.getByTestId('select-from-asset')).toHaveAttribute('data-value', bnb.id);

  await page.getByTestId('select-from-asset').click();
  await page.getByTestId('search-from-asset').fill('usdc');
  await expect(page.getByTestId(`option-from-asset-${usdc.id}`)).toBeVisible();
  await page.getByTestId('search-from-asset').fill('xmr');
  await expect(page.getByTestId(`option-from-asset-${monero.id}`)).toHaveCount(0);
  await page.getByTestId('search-from-asset').fill('isolated');
  await expect(page.getByTestId(`option-from-asset-${configuredButUncovered.id}`)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await chooseAsset(page, 'select-from-asset', usdc.id, 'usdc');
  await chooseAsset(page, 'select-to-asset', monero.id, 'xmr');
  await expect(page.getByTestId('select-from-asset')).toHaveAttribute('data-value', usdc.id);
  await expect(page.getByTestId('select-to-asset')).toHaveAttribute('data-value', monero.id);
});

test('keeps standardized fiat payment fields complete, reachable, and submitted once', async ({ page }) => {
  const orderId = 'O987654321';
  const createdAt = new Date().toISOString();
  let orderRequests = 0;
  let submittedOrder: Record<string, unknown> | undefined;
  const createdOrder = {
    id: orderId,
    type: 'manual',
    status: 'awaiting funds',
    manualSettlementState: 'awaiting_funds',
    fromAsset: 'USD',
    fromNetwork: 'Bank transfer',
    toAsset: 'BTC',
    toNetwork: 'Bitcoin',
    amount: 100,
    receiveAmount: 0.002,
    provider: 'Manual desk',
    outcomeUnknown: false,
    refreshUnavailable: false,
    trackingToken: 'tracking-token-payment-fields',
    createdAt,
  };

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(paymentFieldExchangeConfig),
  }));
  await page.route('**/api/exchange/quote', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const fiatOptionId = body.fromAsset === 'USD' || body.toAsset === 'USD'
      ? 'usd-fiat'
      : 'eur-fiat';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: `payment-fields-${body.fromAsset}-${body.toAsset}`,
        type: 'manual',
        provider: 'Manual desk',
        fromAsset: body.fromAsset,
        fromNetwork: body.fromNetwork,
        toAsset: body.toAsset,
        toNetwork: body.toNetwork,
        amount: body.amount,
        receiveAmount: body.fromAsset === 'BTC' ? 90 : 0.002,
        rate: body.fromAsset === 'BTC' ? 90 : 0.00002,
        fee: 0.6,
        sourceSettlementOptionId: body.fromAsset === 'BTC' ? 'btc-bitcoin' : fiatOptionId,
        targetSettlementOptionId: body.toAsset === 'BTC' ? 'btc-bitcoin' : fiatOptionId,
        requiredSettlementFields: standardFiatFields,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
  });
  await page.route(/\/api\/orders(?:\?|$)/, async route => {
    orderRequests += 1;
    submittedOrder = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(createdOrder),
    });
  });
  await page.route(`**/api/orders/${orderId}/status*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(createdOrder),
  }));

  const expectedFieldKeys = standardFiatFields.map(field => field.key);
  const assertPaymentFields = async () => {
    const cards = page.locator('[data-testid^="swap-detail-card-"]');
    await expect(cards).toHaveCount(expectedFieldKeys.length);
    await expect.poll(() => cards.evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-testid'))
    ))).toEqual(expectedFieldKeys.map(key => `swap-detail-card-${key}`));

    for (const field of standardFiatFields) {
      const input = page.getByTestId(`input-detail-${field.key}`);
      await expect(input).toBeVisible();
      if (field.required) {
        await expect(input).toHaveAttribute('required', '');
        await expect(page.getByTestId(`swap-detail-card-${field.key}`).locator('.required-field-mark')).toHaveCount(1);
      } else {
        await expect(input).not.toHaveAttribute('required', '');
        await expect(page.getByTestId(`swap-detail-card-${field.key}`)).toContainText('(Optional)');
      }
    }

    const email = page.getByTestId('input-customer-email');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('required', '');
    await page.getByTestId(`input-detail-${expectedFieldKeys[0]}`).focus();
    for (const key of expectedFieldKeys.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(page.getByTestId(`input-detail-${key}`)).toBeFocused();
    }
    await email.focus();
    await expect(email).toBeFocused();
    await page.locator('#swap-terms').scrollIntoViewIfNeeded();
    await expect(page.locator('#swap-terms')).toBeVisible();
    await expect(page.getByTestId('swap-button-submit')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  };

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/?__e2eGuest=1');
    await page.getByTestId('input-amount').fill('100');
    await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
    await page.getByTestId('button-swap-continue').click();
    await assertPaymentFields();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?__e2eGuest=1');
  await chooseAsset(page, 'select-from-asset', 'btc-bitcoin', 'bitcoin');
  await chooseAsset(page, 'select-to-asset', 'eur-fiat', 'eur');
  await page.getByTestId('input-amount').fill('1');
  await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
  await page.getByTestId('button-swap-continue').click();
  await assertPaymentFields();

  await page.getByTestId('swap-button-back').click();
  await chooseAsset(page, 'select-from-asset', 'usd-fiat', 'usd');
  await chooseAsset(page, 'select-to-asset', 'btc-bitcoin', 'bitcoin');
  await page.getByTestId('input-amount').fill('100');
  await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
  await page.getByTestId('button-swap-continue').click();
  await page.getByTestId('input-destination-address').fill('bc1qpaymentfieldstest');
  await page.getByTestId('input-detail-name').fill('Ada Lovelace');
  await page.getByTestId('input-detail-bank_detail').fill('GB29 NWBK 6016 1331 9268 19');
  await page.getByTestId('input-detail-bank_name').fill('Example Bank');
  await page.getByTestId('input-detail-payment_description').fill('Invoice 42');
  await page.getByTestId('input-detail-telegram_or_whatsapp').fill('@ada');
  await page.getByTestId('input-customer-email').fill('ada@example.test');
  await page.locator('#swap-terms').check();
  await page.getByTestId('swap-button-submit').click();

  await expect.poll(() => submittedOrder).toMatchObject({
    type: 'manual',
    destinationAddress: 'bc1qpaymentfieldstest',
    customerEmail: 'ada@example.test',
    settlementDetails: {
      name: 'Ada Lovelace',
      bank_detail: 'GB29 NWBK 6016 1331 9268 19',
      bank_name: 'Example Bank',
      payment_description: 'Invoice 42',
      telegram_or_whatsapp: '@ada',
    },
  });
  expect(orderRequests).toBe(1);
  await expect(page).toHaveURL(new RegExp(
    `/order/${orderId}\\?provider=manual&trackingToken=${createdOrder.trackingToken}$`,
  ));
  await expect(page.getByTestId('heading-order-created')).toBeVisible();
});

test('previews a manual quote and handles cleared and failed quotes without submitting', async ({
  page,
}) => {
  let quoteRequests = 0;
  let orderRequests = 0;
  const requestedTypes: string[] = [];

  await page.route('**/api/exchange/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(exchangeConfig),
    });
  });

  await page.route(/\/api\/orders(?:\?|$)/, async (route) => {
    orderRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'The test must not submit an order.' }),
    });
  });

  await page.route('**/api/exchange/quote', async (route) => {
    quoteRequests += 1;
    const requestBody = route.request().postDataJSON() as {
      amount: number;
      type: string;
      fromNetwork?: string;
      toNetwork?: string;
    };
    requestedTypes.push(requestBody.type);

    expect(exchangeConfig.manualRouteAvailability.routes).toContainEqual({
      sourceSettlementOptionId: requestBody.sourceSettlementOptionId,
      targetSettlementOptionId: requestBody.targetSettlementOptionId,
    });

    if (requestBody.amount === 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Desk requires at least 100 USD for this route.',
          code: 'AMOUNT_TOO_SMALL',
          retryable: false,
          outcomeUnknown: false,
        }),
      });
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, requestBody.amount === 2 ? 650 : 450),
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: `quote-${requestBody.amount}`,
        type: 'manual',
        provider: 'Manual desk',
        fromAsset: 'USD',
        fromNetwork: 'Bank transfer',
        toAsset: 'BTC',
        toNetwork: 'Bitcoin',
        amount: requestBody.amount,
        receiveAmount: requestBody.amount * 0.0001,
        rate: 0.0001,
        fee: 0.6,
        sourceSettlementOptionId: requestBody.type === 'manual' ? 'usd-fiat' : undefined,
        targetSettlementOptionId: requestBody.type === 'manual' ? 'btc-bitcoin' : undefined,
        requiredSettlementFields: requestBody.type === 'manual' ? [{ key: 'account_number', type: 'text', label: 'Account number', required: true }] : undefined,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
  });

  await page.goto('/');

  const amount = page.getByTestId('input-amount');
  const receive = page.getByTestId('input-receive-amount');

  await openLanguageSelector(page);
  const languageFlags = page.locator('.qx-language-option__flag');
  await expect(languageFlags).toHaveCount(7);
  const languageFlagGeometry = await languageFlags.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    const image = element.querySelector('img');
    return {
      width: box.width,
      height: box.height,
      borderRadius: getComputedStyle(element).borderRadius,
      backgroundColor: getComputedStyle(element).backgroundColor,
      objectFit: image ? getComputedStyle(image).objectFit : null,
      hasImage: Boolean(image),
    };
  }));
  expect(languageFlagGeometry.every(flag =>
    Math.abs(flag.width - flag.height) < 0.5
    && flag.width > 0
    && (!flag.hasImage || flag.objectFit === 'cover')
  )).toBe(true);
  await page.keyboard.press('Escape');

  await expect(amount).toBeVisible();
  await expect(page.getByTestId('button-mode-select-manual')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('button-mode-select-instant')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('rate-mode-selector')).toHaveCount(0);
  await expect(page.getByTestId('button-mode-instant')).toHaveCount(0);
  await expect(amount).toHaveAttribute('placeholder', '0');
  await expect(receive).toHaveValue('');
  await expect(receive).toHaveAttribute('placeholder', '0');
  await expect(page.getByTestId('button-swap-continue')).toBeDisabled();
  await expect(page.getByTestId('button-exchange')).toHaveCount(0);
  await expect(page.getByTestId('select-from-asset')).toContainText('USD');
  await expect(page.getByTestId('select-from-asset')).toContainText('Bank transfer');
  await expect(page.getByTestId('select-from-asset').locator(
    '.payment-method-logo-stack-badged > .fiat-currency-flag',
  )).toHaveCount(1);
  await expect(page.getByTestId('select-payment-method')).toHaveCount(0);
  await expect(page.getByTestId('select-payout-method')).toHaveCount(0);
  await page.getByTestId('select-to-asset').click();
  const receiveSelector = page.locator('.swap-contained-selector.convert-contained-selector:visible');
  await expect(receiveSelector).toBeVisible();
  await expect(receiveSelector.getByRole('heading', { name: 'You Receive' })).toBeVisible();
  await expect(receiveSelector.getByText('4 options available', { exact: true })).toBeVisible();
  await expect(receiveSelector.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  await expect(receiveSelector.getByRole('button', { name: 'Crypto', exact: true })).toBeVisible();
  await expect(receiveSelector.getByRole('button', { name: 'Payment Methods', exact: true })).toBeVisible();
  await expect(receiveSelector.getByRole('button', { name: 'Fiat', exact: true })).toHaveCount(0);
  await expect(receiveSelector.getByRole('button', { name: /Popular|Stablecoins|Blockchain|DeFi|Meme/ })).toHaveCount(0);
  await expect(page.getByTestId('search-to-asset')).not.toBeFocused();
  await expect(page.getByTestId('option-to-asset-usd-fiat')).toHaveCount(0);
  const eurPaymentMethodOption = page.getByTestId('option-to-asset-eur-fiat');
  await expect(eurPaymentMethodOption).toBeVisible();
  await expect(eurPaymentMethodOption.locator(
    '.payment-method-logo-stack-badged > .fiat-currency-flag',
  )).toHaveCount(1);
  await expect(eurPaymentMethodOption.locator('.payment-method-copy-name')).toHaveText('SEPA transfer');
  await expect(eurPaymentMethodOption.locator('.payment-method-copy-currency')).toHaveText('EUR');
  await expect(eurPaymentMethodOption.locator('.payment-method-copy-type')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await amount.fill('1');
  await expect(receive).toHaveValue('');
  await expect(receive).toHaveAttribute('placeholder', '0');
  await expect(receive).toHaveValue('0.0001');
  await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
  await expect(page.getByTestId('button-exchange')).toHaveCount(0);
  await expect(page.getByTestId('input-detail-account_number')).toHaveCount(0);
  await page.getByTestId('button-swap-continue').click();
  await expect(page.getByTestId('swap-button-submit')).toBeDisabled();
  await expect(page.getByTestId('input-detail-account_number')).toBeVisible();
  expect(requestedTypes).toEqual(['manual']);
  expect(orderRequests).toBe(0);

  await page.getByTestId('swap-button-back').click();
  await amount.fill('2');
  await expect(receive).toHaveAttribute('placeholder', '0');
  await expect.poll(() => quoteRequests).toBe(2);
  await amount.fill('');
  await expect(receive).toHaveValue('');
  await expect(receive).toHaveAttribute('placeholder', '0');
  await page.waitForTimeout(750);
  await expect(receive).toHaveValue('');
  await expect(receive).toHaveAttribute('placeholder', '0');

  await amount.fill('3');
  await expect(receive).toHaveAttribute('placeholder', '0');
  await expect(receive).toHaveValue('');
  await expect(receive).toHaveAttribute('placeholder', '0');
  await expect(page.getByText('Quote unavailable', { exact: true })).toBeVisible();
  await expect(page.getByTestId('button-swap-continue')).toBeDisabled();
  await expect(page.getByTestId('button-exchange')).toHaveCount(0);
  expect(quoteRequests).toBe(3);
  expect(requestedTypes).toEqual(['manual', 'manual', 'manual']);
  expect(orderRequests).toBe(0);

  // Keep the USD bank source and continue with a crypto-network target.
  await chooseAsset(page, 'select-to-asset', 'usdt-trc20', 'trc20');
  await expect(page.getByTestId('select-from-asset')).toHaveAttribute('data-value', 'usd-fiat');
  await expect(page.getByTestId('select-to-asset')).toHaveAttribute('data-value', 'usdt-trc20');

  await chooseAsset(page, 'select-from-asset', 'btc-bitcoin', 'bitcoin');
  await expect(page.getByTestId('select-from-asset')).toHaveAttribute('data-value', 'btc-bitcoin');
  await expect(page.getByTestId('select-to-asset')).toHaveAttribute('data-value', 'usd-fiat');
  await expect(page.getByTestId('select-payment-method')).toHaveCount(0);
  await expect(page.getByTestId('select-payout-method')).toHaveCount(0);

  const toSelect = page.getByTestId('select-to-asset');
  await toSelect.click();
  await expect(page.getByTestId('button-swap-assets')).toHaveCSS('visibility', 'hidden');
  await expect(page.getByTestId('option-to-asset-usd-fiat')).toBeVisible();
  await expect(page.getByTestId('option-to-asset-usdt-trc20')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('button-swap-assets')).toBeVisible();
  await expect(page.getByTestId('select-payment-method')).toHaveCount(0);
  await expect(page.getByTestId('select-payout-method')).toHaveCount(0);
});

test('requires crypto refund details for a crypto-to-fiat Swap and surfaces invalid source memos', async ({
  page,
}) => {
  const orderId = 'O123456789';
  let orderRequests = 0;
  let acceptedOrderRequest: Record<string, unknown> | undefined;
  const createdAt = new Date().toISOString();
  const createdOrder = {
    id: orderId,
    type: 'manual',
    status: 'awaiting funds',
    manualSettlementState: 'awaiting_funds',
    fromAsset: 'XRP',
    fromNetwork: 'Ripple',
    toAsset: 'EUR',
    toNetwork: 'SEPA transfer',
    amount: 10,
    receiveAmount: 9.94,
    provider: 'Manual desk',
    outcomeUnknown: false,
    refreshUnavailable: false,
    trackingToken: 'tracking-token-manual',
    createdAt,
  };

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(exchangeConfig),
  }));
  await page.route('**/api/exchange/quote', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'manual',
      fromAsset: 'XRP',
      fromNetwork: 'Ripple',
      toAsset: 'EUR',
      toNetwork: 'SEPA transfer',
      sourceSettlementOptionId: 'xrp-xrpl',
      targetSettlementOptionId: 'eur-fiat',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'manual-xrp-eur-quote',
        type: 'manual',
        provider: 'Manual desk',
        fromAsset: 'XRP',
        fromNetwork: 'Ripple',
        toAsset: 'EUR',
        toNetwork: 'SEPA transfer',
        amount: body.amount,
        receiveAmount: 9.94,
        rate: 0.994,
        fee: 0.06,
        sourceSettlementOptionId: 'xrp-xrpl',
        targetSettlementOptionId: 'eur-fiat',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
  });
  await page.route(/\/api\/orders(?:\?|$)/, async (route) => {
    orderRequests += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (body.refundMemo !== '12345') {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'The refund memo is not valid for the selected network.',
          code: 'MANUAL_REFUND_MEMO_INVALID',
          retryable: false,
          outcomeUnknown: false,
        }),
      });
      return;
    }
    acceptedOrderRequest = body;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(createdOrder),
    });
  });
  await page.route(`**/api/orders/${orderId}/status*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(createdOrder),
  }));

  await page.goto('/');
  await chooseAsset(page, 'select-from-asset', 'xrp-xrpl', 'xrp');
  await chooseAsset(page, 'select-to-asset', 'eur-fiat', 'eur');
  await page.getByTestId('input-amount').fill('10');
  await expect(page.getByTestId('input-receive-amount')).toHaveValue('9.94');
  await page.getByTestId('button-swap-continue').click();

  const refundAddress = page.getByTestId('input-refund-address');
  const refundMemo = page.getByTestId('input-refund-memo');
  await expect(refundAddress).toBeVisible();
  await expect(refundAddress).not.toHaveAttribute('required', '');
  await expect(refundMemo).not.toBeVisible();
  await expect(refundMemo).toBeDisabled();

  await refundAddress.fill('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh');
  await expect(refundMemo).toBeVisible();
  await expect(refundMemo).toHaveAttribute('required', '');

  await refundMemo.fill('not-a-tag');
  await page.locator('#swap-terms').check();
  await page.getByTestId('swap-button-submit').click();
  await expect(page.getByText('Check that the refund memo or tag matches the selected source network.')).toBeVisible();
  expect(orderRequests).toBe(1);

  await refundMemo.fill('12345');
  await page.getByTestId('swap-button-submit').click();
  await expect.poll(() => acceptedOrderRequest).toMatchObject({
    type: 'manual',
    fromAsset: 'XRP',
    fromNetwork: 'Ripple',
    toAsset: 'EUR',
    toNetwork: 'SEPA transfer',
    refundAddress: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    refundMemo: '12345',
  });
  await expect(page).toHaveURL(new RegExp(
    `/order/${orderId}\\?provider=manual&trackingToken=${createdOrder.trackingToken}$`,
  ));
  await expect(page.getByTestId('heading-order-created')).toBeVisible();
  await expect(page.getByTestId('status-order-confirmation')).toHaveText('Pending');
  await expect(page.getByTestId('form-exchange')).toHaveCount(0);
  await expect(page.getByTestId('text-order-id')).toHaveText(orderId);
});

test('submits a USDT TRC20 to EUR payment method Swap without refund details', async ({ page }) => {
  const orderId = 'O246813579';
  let submittedOrder: Record<string, unknown> | undefined;
  const createdOrder = {
    id: orderId,
    type: 'manual',
    status: 'awaiting funds',
    manualSettlementState: 'awaiting_funds',
    fromAsset: 'USDT',
    fromNetwork: 'TRC20',
    toAsset: 'EUR',
    toNetwork: 'SEPA transfer',
    amount: 10,
    receiveAmount: 9.94,
    provider: 'Manual desk',
    outcomeUnknown: false,
    refreshUnavailable: false,
    trackingToken: 'tracking-token-usdt-eur',
    createdAt: new Date().toISOString(),
  };

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(exchangeConfig),
  }));
  await page.route('**/api/exchange/quote', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      type: 'manual',
      fromAsset: 'USDT',
      fromNetwork: 'TRC20',
      toAsset: 'EUR',
      toNetwork: 'SEPA transfer',
      sourceSettlementOptionId: 'usdt-trc20',
      targetSettlementOptionId: 'eur-fiat',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'manual-usdt-eur-quote',
        type: 'manual',
        provider: 'Manual desk',
        fromAsset: 'USDT',
        fromNetwork: 'TRC20',
        toAsset: 'EUR',
        toNetwork: 'SEPA transfer',
        amount: body.amount,
        receiveAmount: 9.94,
        rate: 0.994,
        fee: 0.06,
        sourceSettlementOptionId: 'usdt-trc20',
        targetSettlementOptionId: 'eur-fiat',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
  });
  await page.route(/\/api\/orders(?:\?|$)/, async route => {
    submittedOrder = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(createdOrder),
    });
  });
  await page.route(`**/api/orders/${orderId}/status*`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(createdOrder),
  }));

  await page.goto('/');
  await chooseAsset(page, 'select-from-asset', 'usdt-trc20', 'usdt');
  await chooseAsset(page, 'select-to-asset', 'eur-fiat', 'eur');
  await page.getByTestId('input-amount').fill('10');
  await expect(page.getByTestId('input-receive-amount')).toHaveValue('9.94');
  await page.getByTestId('button-swap-continue').click();

  await expect(page.getByTestId('input-refund-address')).toBeVisible();
  await expect(page.getByText('Refund Address (Optional)', { exact: true })).toBeVisible();
  const customerEmail = page.getByTestId('input-customer-email');
  if (await customerEmail.isEnabled()) {
    await customerEmail.fill('usdt-eur@example.test');
  }
  await page.locator('#swap-terms').check();
  await page.getByTestId('swap-button-submit').click();

  await expect.poll(() => submittedOrder).toMatchObject({
    type: 'manual',
    fromAsset: 'USDT',
    fromNetwork: 'TRC20',
    toAsset: 'EUR',
    toNetwork: 'SEPA transfer',
  });
  expect(submittedOrder).not.toHaveProperty('refundAddress');
  expect(submittedOrder).not.toHaveProperty('refundMemo');
  await expect(page.getByText(/invalid.*refund|refund.*invalid/i)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(
    `/order/${orderId}\\?provider=manual&trackingToken=${createdOrder.trackingToken}$`,
  ));
  await expect(page.getByTestId('heading-order-created')).toBeVisible();
});

test('uses dedicated Quickex Convert routes and submits both wallet directions', async ({
  page,
}) => {
  const instantOrderId = 'QX-33333333-3333-4333-8333-333333333333';
  const quoteRequests: Array<Record<string, unknown>> = [];
  let validationRequests = 0;
  let orderRequest: Record<string, unknown> | undefined;
  const createdAt = new Date().toISOString();
  const instantOrder = {
    id: instantOrderId,
    type: 'instant',
    status: 'awaiting deposit',
    fromAsset: 'BTC',
    fromNetwork: 'Bitcoin',
    toAsset: 'USDT',
    toNetwork: 'TRC20',
    amount: 1,
    receiveAmount: 99.5,
    depositAddress: 'deposit-wallet',
    rateMode: 'FIXED',
    outcomeUnknown: false,
    refreshUnavailable: false,
    trackingToken: 'tracking-token-333',
    createdAt,
  };

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(instantExchangeConfig),
  }));
  await page.route('**/api/quickex/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'Quickex',
        signedOrders: true,
        instruments: [
          { currencyTitle: 'BTC', networkTitle: 'Bitcoin', slug: 'btc-bitcoin', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', currencyLogoLink: 'https://quickex.io/assets/coins/btc.svg', precisionDecimals: 8, requiresMemo: false },
          { currencyTitle: 'USDT', networkTitle: 'TRC20', slug: 'usdt-trc20', instrumentType: 'crypto', fullName: 'Tether', currencyFriendlyTitle: 'Tether', currencyLogoLink: 'https://quickex.io/assets/coins/usdt.svg', precisionDecimals: 6, requiresMemo: false },
          { currencyTitle: 'DOGE', networkTitle: 'Dogecoin', slug: 'doge-dogecoin', instrumentType: 'crypto', fullName: 'Dogecoin', currencyFriendlyTitle: 'Dogecoin', currencyLogoLink: 'https://icons.test/broken.svg', precisionDecimals: 8, requiresMemo: false },
        ],
        pairs: [
          { fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' },
          { fromAsset: 'DOGE', fromNetwork: 'Dogecoin', toAsset: 'USDT', toNetwork: 'TRC20' },
        ],
      }),
    });
  });
  await page.route('https://icons.test/broken.svg', route => route.abort());

  await page.route('**/api/quickex/quote', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body.fromNetwork).toBe('Bitcoin');
    expect(body.toNetwork).toBe('TRC20');
    quoteRequests.push(body);
    if (body.rateMode === 'FIXED') {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    const receiveAmount = body.rateMode === 'FIXED' ? 88.8 : 99.5;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: `instant-${body.rateMode}-${quoteRequests.length}`,
        type: 'instant',
        provider: 'Quickex',
        fromAsset: body.fromAsset,
        fromNetwork: body.fromNetwork,
        toAsset: body.toAsset,
        toNetwork: body.toNetwork,
        amount: body.amount,
        receiveAmount,
        rate: receiveAmount,
        fee: 0.1,
        minAmount: 0.01,
        maxAmount: 50,
        rateMode: body.rateMode,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
  });

  await page.route(/\/api\/quickex\/create-order(?:\?|$)/, async (route) => {
    orderRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(instantOrder),
    });
  });
  await page.route('**/api/quickex/validate-address', route => {
    validationRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true }),
    });
  });

  await page.route(`**/api/quickex/orders/${instantOrderId}/status*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(instantOrder),
    });
  });

  await page.goto('/');
  await page.getByTestId('button-mode-select-instant').click();
  await expect(page.getByTestId('button-mode-select-instant')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('convert-select-from-asset')).toHaveAttribute('data-value', 'btc-bitcoin');
  await expect(page.getByTestId('convert-select-to-asset')).toHaveAttribute('data-value', 'usdt-trc20');
  await expect(page.getByTestId('convert-select-from-asset')).toContainText('Bitcoin');
  await expect(page.getByTestId('convert-select-from-asset').locator('.crypto-logo img')).toHaveAttribute('src', 'https://quickex.io/assets/coins/btc.svg');
  await page.getByTestId('convert-select-from-asset').click();
  await expect(page.getByTestId('search-convert-from-asset')).toBeVisible();
  const sendRowBox = await page.locator('.exchange-amount-row').first().boundingBox();
  const assetMenuBox = await page.locator('.convert-contained-selector').boundingBox();
  expect(sendRowBox).not.toBeNull();
  expect(assetMenuBox).not.toBeNull();
  expect(assetMenuBox!.width).toBeGreaterThanOrEqual(sendRowBox!.width);
  expect(assetMenuBox!.width - sendRowBox!.width).toBeLessThanOrEqual(48);
  await expect(page.getByTestId('crypto-identity-btc-bitcoin')).toHaveAccessibleName('Bitcoin, BTC, on Bitcoin');
  const brokenLogoIdentity = page.getByTestId('crypto-identity-doge-dogecoin');
  await expect(brokenLogoIdentity).toHaveAccessibleName('Dogecoin, DOGE, on Dogecoin');
  await expect(brokenLogoIdentity.locator('.crypto-logo img')).toHaveAttribute(
    'src',
    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/doge.png',
  );
  await expect(brokenLogoIdentity.locator('.crypto-logo svg')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const sendBox = await page.locator('.exchange-amount-row').first().boundingBox();
  const receiveBox = await page.locator('.exchange-amount-row').nth(1).boundingBox();
  const swapBox = await page.getByTestId('convert-button-swap-assets').boundingBox();
  expect(sendBox).not.toBeNull();
  expect(receiveBox).not.toBeNull();
  expect(swapBox).not.toBeNull();
  const boundaryCenter = (sendBox!.y + sendBox!.height + receiveBox!.y) / 2;
  expect(Math.abs((swapBox!.y + swapBox!.height / 2) - boundaryCenter)).toBeLessThanOrEqual(3);
  await expect(page.getByTestId('select-payment-method')).toHaveCount(0);
  await expect(page.getByTestId('select-payout-method')).toHaveCount(0);
  await expect(page.getByTestId('input-order-note')).toHaveCount(0);
  await expect(page.getByTestId('convert-step-quote')).toBeVisible();
  await expect(page.getByTestId('convert-input-destination-address')).toHaveCount(0);
  await expect(page.getByTestId('convert-input-refund-address')).toHaveCount(0);
  await expect(page.getByTestId('convert-input-amount')).toHaveAttribute('placeholder', '0');
  await expect(page.getByTestId('convert-input-receive-amount')).toHaveAttribute('placeholder', '0');
  await page.getByTestId('convert-input-amount').fill('1');
  await expect(page.getByTestId('convert-input-receive-amount')).toHaveValue('99.5');
  await page.getByTestId('convert-rate-fixed').click();
  await expect.poll(() => quoteRequests.at(-1)?.rateMode).toBe('FIXED');
  await page.getByTestId('convert-rate-floating').click();
  await expect.poll(() => quoteRequests.at(-1)?.rateMode).toBe('FLOATING');
  await expect(page.getByTestId('convert-input-receive-amount')).toHaveValue('99.5');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('convert-input-receive-amount')).toHaveValue('99.5');
  await page.getByTestId('convert-rate-fixed').click();
  await expect(page.getByTestId('convert-input-receive-amount')).toHaveValue('88.8');
  await expect(page.getByTestId('convert-min-amount')).toHaveCount(0);
  await expect(page.getByTestId('convert-max-amount')).toHaveCount(0);
  await page.getByTestId('convert-input-amount').press('Enter');
  await expect.poll(() => validationRequests).toBe(0);
  expect(orderRequest).toBeUndefined();
  await page.getByTestId('convert-button-continue').click();
  await expect(page.getByTestId('convert-step-wallets')).toBeVisible();
  await expect(page.getByTestId('convert-input-destination-address')).toBeFocused();
  await expect(page.getByTestId('convert-wallet-quote-summary')).toContainText('1 BTC');
  await expect(page.getByTestId('convert-summary-from-logo').locator('.crypto-logo img')).toHaveAttribute('src', 'https://quickex.io/assets/coins/btc.svg');
  await expect(page.getByTestId('convert-summary-to-logo').locator('.crypto-logo img')).toHaveAttribute('src', 'https://quickex.io/assets/coins/usdt.svg');
  await expect(page.getByTestId('convert-input-destination-address')).toBeVisible();
  await expect(page.getByTestId('convert-input-refund-address')).toBeVisible();
  await expect(page.getByTestId('convert-input-refund-address')).not.toHaveAttribute('required', '');
  await expect(page.getByTestId('convert-input-refund-address')).toHaveValue('');
  await expect(page.getByTestId('convert-input-refund-memo')).toBeDisabled();
  await page.getByTestId('convert-input-email').fill('instant@example.test');
  await page.getByTestId('convert-input-destination-address').fill('destination-wallet');
  await page.getByTestId('convert-input-destination-memo').fill('destination-memo');
  await page.getByTestId('convert-button-back').click();
  await expect(page.getByTestId('convert-step-quote')).toBeVisible();
  await expect(page.getByTestId('convert-input-amount')).toBeFocused();
  await page.getByTestId('convert-button-continue').click();
  await expect(page.getByTestId('convert-input-destination-address')).toBeFocused();
  await expect(page.getByTestId('convert-input-destination-address')).toHaveValue('destination-wallet');
  await expect(page.getByTestId('convert-input-destination-memo')).toHaveValue('destination-memo');
  await expect(page.getByTestId('convert-input-refund-address')).toBeVisible();
  await expect(page.getByTestId('convert-input-email')).toHaveValue('instant@example.test');
  await page.locator('#convert-terms').check();
  await page.getByTestId('convert-button-submit').click();

  await expect.poll(() => orderRequest).toMatchObject({
    type: 'instant',
    fromAsset: 'BTC',
    fromNetwork: 'Bitcoin',
    toAsset: 'USDT',
    toNetwork: 'TRC20',
    amount: 1,
    destinationAddress: 'destination-wallet',
    destinationMemo: 'destination-memo',
    rateMode: 'FIXED',
    customerEmail: 'instant@example.test',
  });
  await expect(page).toHaveURL(new RegExp(
    `/order/${instantOrderId}\\?provider=quickex&trackingToken=${instantOrder.trackingToken}$`,
  ));
  await expect(page.getByTestId('heading-order-created')).toBeVisible();
  await expect(page.getByTestId('status-order-confirmation')).toHaveText('AWAITING FUNDS');
  await expect(page.getByTestId('convert-step-quote')).toHaveCount(0);
  await expect(page.getByTestId('text-order-id')).toHaveText(instantOrderId);
});

test('opens Convert and offers the working Swap calculator when provider configuration is empty', async ({
  page,
}) => {
  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(exchangeConfig),
  }));
  await page.route('**/api/quickex/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'Quickex',
        instruments: [],
        pairs: [],
        signedOrders: false,
      }),
    });
  });

  await page.goto('/');
  await page.getByTestId('button-mode-select-instant').click();
  await expect(page.getByTestId('convert-unavailable')).toContainText('No quote or order will be created');
  await expect(page.getByTestId('button-retry-convert')).toBeVisible();
  await page.getByTestId('button-use-swap').click();
  await expect(page.getByTestId('button-mode-select-manual')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('form-exchange')).toBeVisible();
});

test('keeps compact exchange widgets and asset menus usable across viewport sizes', async ({
  page,
}) => {
  const longSettlementOptions = exchangeConfig.settlementOptions.map((option) => (
    option.id === 'usdt-trc20'
      ? {
          ...option,
          title: 'Tether USD',
          networkTitle: 'Tron TRC20 Long Network Label',
          routeNetwork: 'Tron TRC20 Long Network Label',
        }
      : option
  ));

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...instantExchangeConfig,
      settlementOptions: longSettlementOptions,
      manualSettlementOptions: longSettlementOptions,
    }),
  }));
  await page.route('**/api/quickex/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      provider: 'Quickex',
      signedOrders: true,
      instruments: [
        { currencyTitle: 'BTC', networkTitle: 'Bitcoin Main Network', slug: 'btc-bitcoin', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', currencyLogoLink: 'https://quickex.io/assets/coins/btc.svg', precisionDecimals: 8, requiresMemo: false },
        { currencyTitle: 'USDT', networkTitle: 'Tron TRC20 Long Network Label', slug: 'usdt-trc20', instrumentType: 'crypto', fullName: 'Tether', currencyFriendlyTitle: 'Tether USD', precisionDecimals: 6, requiresMemo: false },
        { currencyTitle: 'DOGE', networkTitle: 'Dogecoin', slug: 'doge-dogecoin', instrumentType: 'crypto', fullName: 'Dogecoin', currencyFriendlyTitle: 'Dogecoin', currencyLogoLink: 'https://icons.test/broken.svg', precisionDecimals: 8, requiresMemo: false },
        { currencyTitle: 'BNB', networkTitle: 'BEP20', slug: 'bnbbep20', instrumentType: 'crypto', fullName: 'BNB', currencyFriendlyTitle: 'BNB', currencyLogoLink: 'https://quickex.io/assets/coins/bnb.svg', precisionDecimals: 4, requiresMemo: false },
      ],
      pairs: [
        { fromAsset: 'BTC', fromNetwork: 'Bitcoin Main Network', toAsset: 'USDT', toNetwork: 'Tron TRC20 Long Network Label' },
        { fromAsset: 'DOGE', fromNetwork: 'Dogecoin', toAsset: 'USDT', toNetwork: 'Tron TRC20 Long Network Label' },
        { fromAsset: 'BNB', fromNetwork: 'BEP20', toAsset: 'BTC', toNetwork: 'Bitcoin Main Network' },
        { fromAsset: 'BNB', fromNetwork: 'BEP20', toAsset: 'USDT', toNetwork: 'Tron TRC20 Long Network Label' },
        { fromAsset: 'BNB', fromNetwork: 'BEP20', toAsset: 'DOGE', toNetwork: 'Dogecoin' },
      ],
    }),
  }));
  await page.route('**/api/quickex/quote', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'responsive-convert-quote',
        type: 'instant',
        provider: 'Quickex',
        fromAsset: body.fromAsset,
        fromNetwork: body.fromNetwork,
        toAsset: body.toAsset,
        toNetwork: body.toNetwork,
        amount: body.amount,
        receiveAmount: 99.5,
        rate: 99.5,
        fee: 0.1,
        minAmount: 0.01,
        maxAmount: 50,
        rateMode: body.rateMode,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    });
  });

  await page.route('https://icons.test/broken.svg', route => route.abort());

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('form-exchange')).toBeVisible();
  const desktopGeometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    };
    return {
      layout: rect('.exchange-layout'),
      card: rect('.exchange-card'),
      trigger: rect('[data-testid="select-from-asset"]'),
      cardOverflow: getComputedStyle(document.querySelector('.exchange-card')!).overflow,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(desktopGeometry.layout.width).toBeGreaterThanOrEqual(520);
  expect(desktopGeometry.layout.width).toBeLessThanOrEqual(600);
  expect(desktopGeometry.card.width).toBeCloseTo(500, 0);
  expect(desktopGeometry.trigger.width).toBeGreaterThanOrEqual(220);
  expect(desktopGeometry.cardOverflow).toBe('visible');
  expect(desktopGeometry.documentOverflow).toBe(0);

  await page.getByTestId('select-from-asset').click();
  const desktopAssetSearch = page.getByTestId('search-from-asset');
  await expect(desktopAssetSearch).not.toBeFocused();
  await expect(page.getByTestId('option-from-asset-usdt-trc20')).toBeVisible();
  await expect.poll(() => page.locator('.swap-contained-selector').evaluate((element) => (
    element.getBoundingClientRect().right <= window.innerWidth
  ))).toBe(true);
  const desktopMenu = await page.locator('.swap-contained-selector').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      height: bounds.height,
      viewportWidth: window.innerWidth,
      zIndex: Number(getComputedStyle(element).zIndex),
    };
  });
  expect(desktopMenu.left).toBeGreaterThanOrEqual(0);
  expect(desktopMenu.right).toBeLessThanOrEqual(desktopMenu.viewportWidth);
  expect(desktopMenu.height).toBeGreaterThanOrEqual(220);
  expect(desktopMenu.height).toBeLessThanOrEqual(620);
  expect(desktopMenu.zIndex).toBeGreaterThanOrEqual(60);
  await desktopAssetSearch.click();
  await expect(desktopAssetSearch).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="option"]:focus')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.swap-contained-selector')).toHaveCount(0);
  await expect(page.getByTestId('select-from-asset')).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('form-exchange')).toBeVisible();
  const mobileWidgetGeometry = await page.locator('#exchange-widget').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      width: bounds.width,
      layoutWidth: document.documentElement.clientWidth,
    };
  });
  const mobileRightGutter = mobileWidgetGeometry.layoutWidth - mobileWidgetGeometry.right;
  expect(mobileWidgetGeometry.left).toBeGreaterThanOrEqual(7);
  expect(mobileRightGutter).toBeGreaterThanOrEqual(7);
  expect(Math.abs(mobileWidgetGeometry.left - mobileRightGutter)).toBeLessThanOrEqual(1);
  expect(mobileWidgetGeometry.width).toBeLessThanOrEqual(mobileWidgetGeometry.layoutWidth - 14);

  const mobilePageContainers = await page.evaluate(() => {
    const selectors = [
      '.public-header',
      '.exchange-wrapper',
      '#exchange-widget',
      '#market-rates',
      '.payment-methods-section',
      '#why-choose-us',
      '#how-it-works',
      '.our-trust',
      '.cta-section',
      '.qx-premium-footer',
    ];
    return {
      layoutWidth: document.documentElement.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      containers: selectors.flatMap((selector) => {
        const element = document.querySelector(selector);
        if (!element) return [];
        const bounds = element.getBoundingClientRect();
        return [{ selector, left: bounds.left, right: bounds.right, width: bounds.width }];
      }),
    };
  });
  expect(mobilePageContainers.containers.map(container => container.selector)).toEqual(
    expect.arrayContaining(['.public-header', '.exchange-wrapper', '#exchange-widget', '#how-it-works', '.qx-premium-footer']),
  );
  expect(mobilePageContainers.documentOverflow).toBe(0);

  const mobileFlowSeparation = await page.locator('[data-testid="form-exchange"] .exchange-flow-stack').evaluate((flow) => {
    const panels = Array.from(flow.querySelectorAll<HTMLElement>(':scope > .amount-stack'));
    const firstInput = panels[0]!.querySelector<HTMLInputElement>('[data-testid="input-amount"]')!;
    const firstSelector = panels[0]!.querySelector<HTMLElement>('[data-testid="select-from-asset"]')!;
    const panelBounds = panels.map(panel => panel.getBoundingClientRect());
    const inputBounds = firstInput.getBoundingClientRect();
    const selectorBounds = firstSelector.getBoundingClientRect();
    return {
      firstPanelBottom: panelBounds[0]!.bottom,
      secondPanelTop: panelBounds[1]!.top,
      inputCenterY: inputBounds.top + inputBounds.height / 2,
      inputLeft: inputBounds.left,
      selectorCenterY: selectorBounds.top + selectorBounds.height / 2,
      selectorLeft: selectorBounds.left,
    };
  });
  expect(mobileFlowSeparation.secondPanelTop).toBeGreaterThanOrEqual(mobileFlowSeparation.firstPanelBottom);
  expect(Math.abs(mobileFlowSeparation.selectorCenterY - mobileFlowSeparation.inputCenterY)).toBeLessThanOrEqual(1);
  expect(mobileFlowSeparation.selectorLeft).toBeGreaterThan(mobileFlowSeparation.inputLeft);
  await expect(page.getByTestId('button-swap-assets')).toBeVisible();

  const activeWidgetLayer = page.locator(
    '.exchange-mode-viewport .exchange-mode-layer:not(.exchange-menu-layer).active-layer',
  );
  const widgetMenuButton = activeWidgetLayer.getByTestId('widget-menu-button');
  await widgetMenuButton.scrollIntoViewIfNeeded();
  await widgetMenuButton.click();
  const widgetCardBeforeMenu = await activeWidgetLayer.locator('.exchange-card.redesigned-widget').boundingBox();
  const widgetMenu = page.getByTestId('widget-navigation-screen');
  const widgetMenuShell = page.getByTestId('exchange-menu-shell');
  await expect(widgetMenu.getByText('Menu', { exact: true })).toBeVisible();
  await expect(widgetMenu.locator('.qx-overlay-close')).toBeVisible();
  const widgetMenuGeometry = await widgetMenu.evaluate((card) => {
    const bounds = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const list = card.querySelector<HTMLElement>('.qx-overlay-list')!;
    const close = card.querySelector<HTMLElement>('.qx-overlay-close')!.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      borderRadius: style.borderRadius,
      borderWidth: style.borderWidth,
      backgroundColor: style.backgroundColor,
      listOverflowY: getComputedStyle(list).overflowY,
      closeWidth: close.width,
      closeHeight: close.height,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  const widgetMenuShellBox = await widgetMenuShell.boundingBox();
  expect(widgetMenuShellBox!.x).toBeCloseTo(widgetCardBeforeMenu!.x, 0);
  expect(widgetMenuShellBox!.y).toBeCloseTo(widgetCardBeforeMenu!.y, 0);
  expect(widgetMenuShellBox!.width).toBeCloseTo(widgetCardBeforeMenu!.width, 0);
  expect(widgetMenuShellBox!.height).toBeCloseTo(widgetCardBeforeMenu!.height, 0);
  expect(widgetMenuGeometry.left).toBeGreaterThan(widgetMenuShellBox!.x);
  expect(widgetMenuGeometry.top).toBeGreaterThan(widgetMenuShellBox!.y);
  expect(widgetMenuGeometry.bottom - widgetMenuGeometry.top).toBeLessThan(widgetCardBeforeMenu!.height);
  expect(widgetMenuGeometry.borderRadius).toBe('28px');
  expect(widgetMenuGeometry.borderWidth).toBe('1px');
  expect(widgetMenuGeometry.listOverflowY).toBe('visible');
  expect(widgetMenuGeometry.closeWidth).toBeGreaterThanOrEqual(36);
  expect(widgetMenuGeometry.closeHeight).toBeGreaterThanOrEqual(36);
  expect(widgetMenuGeometry.documentOverflow).toBe(0);
  await expect(page.locator('.qx-overlay-backdrop.qx-standalone')).toHaveCount(0);
  await expect(page.locator('#mobile-navigation')).toBeHidden();
  await widgetMenu.locator('.qx-overlay-close').click();
  await expect(page.locator('.exchange-menu-layer')).toHaveCSS('opacity', '0');
  await expect(page.locator('.exchange-menu-layer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.exchange-menu-layer')).toHaveAttribute('inert', '');
  await expect(activeWidgetLayer).toBeVisible();

  for (const testId of ['select-from-asset', 'select-to-asset'] as const) {
    await page.getByTestId(testId).click();
    await expect(page.getByTestId('button-swap-assets')).toHaveCSS('visibility', 'hidden');
    const search = page.getByTestId(`search-${testId.replace('select-', '')}`);
    await expect(search).toBeVisible();
    await search.fill('no-such-settlement-option');
    await expect(page.getByText('No options found')).toBeVisible();
    await search.fill('');
    const paymentMethodOption = page.getByTestId(
      `option-${testId.replace('select-', '')}-eur-fiat`,
    );
    await expect(paymentMethodOption).toBeVisible();
    await expect(paymentMethodOption.locator('.payment-method-copy-name')).toHaveText('SEPA transfer');
    await expect(paymentMethodOption.locator('.payment-method-copy-currency')).toHaveText('EUR');
    await expect(paymentMethodOption.locator('.payment-method-copy-type')).toHaveCount(0);
    const paymentMethodGeometry = await paymentMethodOption.evaluate((element) => {
      const logo = element.querySelector('.settlement-payment-avatar')!.getBoundingClientRect();
      const flag = element.querySelector('.fiat-currency-flag')!.getBoundingClientRect();
      const name = element.querySelector('.payment-method-copy-name')!.getBoundingClientRect();
      const metadata = element.querySelector('.payment-method-copy-meta')!.getBoundingClientRect();
      return {
        logoWidth: logo.width,
        logoHeight: logo.height,
        flagWidth: flag.width,
        flagRightOverlap: flag.right - logo.right,
        flagBottomOverlap: flag.bottom - logo.bottom,
        nameTop: name.top,
        nameBottom: name.bottom,
        metadataTop: metadata.top,
        metadataBottom: metadata.bottom,
        rowBottom: element.getBoundingClientRect().bottom,
      };
    });
    expect(paymentMethodGeometry.logoWidth).toBeCloseTo(paymentMethodGeometry.logoHeight, 1);
    expect(paymentMethodGeometry.logoWidth).toBeGreaterThanOrEqual(44);
    expect(paymentMethodGeometry.logoWidth).toBeLessThanOrEqual(48);
    expect(paymentMethodGeometry.flagWidth).toBeGreaterThanOrEqual(14);
    expect(paymentMethodGeometry.flagWidth).toBeLessThanOrEqual(16);
    expect(Math.abs(paymentMethodGeometry.flagRightOverlap)).toBeLessThanOrEqual(1);
    expect(Math.abs(paymentMethodGeometry.flagBottomOverlap)).toBeLessThanOrEqual(1);
    expect(paymentMethodGeometry.metadataTop).toBeGreaterThanOrEqual(paymentMethodGeometry.nameBottom);
    expect(paymentMethodGeometry.metadataBottom).toBeLessThanOrEqual(paymentMethodGeometry.rowBottom);
    await expect.poll(() => page.locator('.swap-contained-selector').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight + 1;
    })).toBe(true);
    const mobileMenu = await page.locator('.swap-contained-selector').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(mobileMenu.left).toBeGreaterThanOrEqual(0);
    expect(mobileMenu.right).toBeLessThanOrEqual(mobileMenu.viewportWidth);
    expect(mobileMenu.bottom).toBeLessThanOrEqual(mobileMenu.viewportHeight + 1);
    expect(mobileMenu.documentOverflow).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="option"]:focus')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.swap-contained-selector, .convert-contained-selector')).toHaveCount(0);
    await expect(page.getByTestId(testId)).toBeFocused();
    await expect(page.getByTestId('button-swap-assets')).toBeVisible();
  }

  await page.getByTestId('button-mode-select-instant').click();
  await expect(page.getByTestId('convert-select-from-asset')).toBeVisible();
  await expect(page.getByTestId('convert-button-swap-assets')).toBeVisible();

  // Test light/dark mode surfaces
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByTestId('convert-select-from-asset').click();
  await expect(page.locator('.convert-contained-selector')).toBeVisible();
  await expect(page.getByTestId('convert-button-swap-assets')).toHaveCSS('visibility', 'hidden');

  // Touch layouts keep the Convert menu at the same scale as its selector.
  const convertGeometry = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="convert-select-from-asset"]') as HTMLElement;
    const row = trigger.closest('.exchange-amount-row') as HTMLElement;
    const menu = document.querySelector('.convert-contained-selector') as HTMLElement;
    const triggerBounds = trigger.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();
    return {
      triggerWidth: triggerBounds.width,
      rowWidth: rowBounds.width,
      rowLeft: rowBounds.left,
      menuWidth: menuBounds.width,
      menuLeft: menuBounds.left,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(convertGeometry.menuWidth).toBeGreaterThanOrEqual(convertGeometry.rowWidth);
  expect(convertGeometry.menuWidth - convertGeometry.rowWidth).toBeLessThanOrEqual(64);
  expect(convertGeometry.menuLeft).toBeLessThanOrEqual(convertGeometry.rowLeft);
  expect(convertGeometry.documentOverflow).toBe(0);

  // The shared Swap/Convert selector exposes route categories, not legacy market segments.
  await expect(page.getByTestId('filter-convert-from-asset-all')).toBeVisible();
  await expect(page.getByTestId('filter-convert-from-asset-crypto')).toBeVisible();
  await expect(page.getByTestId('filter-convert-from-asset-meme')).toHaveCount(0);
  await expect(page.getByTestId('option-convert-from-asset-btc-bitcoin')).toBeVisible();
  await expect(page.getByTestId('option-convert-from-asset-doge-dogecoin')).toBeVisible();

  const btcOption = page.getByTestId('option-convert-from-asset-btc-bitcoin');
  const btcLogo = btcOption.locator('.crypto-logo');
  await expect(btcLogo).toHaveCSS('width', '32px');
  await expect(btcLogo).toHaveCSS('height', '32px');
  const btcLogoImage = btcLogo.locator('img');
  await expect(btcLogoImage).toHaveCSS('object-fit', 'cover');

  const btcNetworkBadge = btcOption.locator('.crypto-network-badge');
  await expect(btcNetworkBadge).toBeVisible();
  await expect(btcNetworkBadge).toContainText('Bitcoin');

  const dogeOption = page.getByTestId('option-convert-from-asset-doge-dogecoin');
  await expect(dogeOption).toBeVisible();
  await expect(dogeOption.locator('.crypto-logo img')).toHaveAttribute(
    'src',
    'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/doge.png',
  );

  await page.getByTestId('option-convert-from-asset-bnbbep20').click();
  await expect(page.getByTestId('convert-select-from-asset')).toHaveAttribute('data-value', 'bnbbep20');
  await page.getByTestId('convert-select-to-asset').click();
  await expect(page.locator('.convert-contained-selector [role="option"]')).toHaveCount(3);
  await expect(page.getByTestId('option-convert-to-asset-btc-bitcoin')).toBeVisible();
  await expect(page.getByTestId('option-convert-to-asset-usdt-trc20')).toBeVisible();
  await expect(page.getByTestId('option-convert-to-asset-doge-dogecoin')).toBeVisible();
  await expect(page.getByTestId('convert-receive-options-error')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  for (const testId of ['convert-select-from-asset', 'convert-select-to-asset'] as const) {
    await page.getByTestId(testId).click();
    const search = page.getByTestId(`search-${testId.replace('select-', '')}`);
    await expect(search).toBeVisible();
    await search.fill('no-such-convert-asset');
    await expect(page.getByText('No currencies match these filters.')).toBeVisible();
    await search.fill('');
    await expect.poll(() => page.locator('.asset-combobox-menu[data-state="open"], .convert-contained-selector[data-state="open"]').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight + 1;
    })).toBe(true);
    const convertMobileMenu = await page.locator('.asset-combobox-menu[data-state="open"], .convert-contained-selector[data-state="open"]').evaluate((element, tId) => {
      const triggerElement = document.querySelector(`[data-testid="${tId}"]`)!;
      const trigger = triggerElement.getBoundingClientRect();
      const row = triggerElement.closest('.exchange-amount-row')!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        triggerWidth: trigger.width,
        rowWidth: row.width,
        menuWidth: bounds.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, testId);
    expect(convertMobileMenu.menuWidth).toBeGreaterThanOrEqual(convertMobileMenu.rowWidth);
    expect(convertMobileMenu.menuWidth - convertMobileMenu.rowWidth).toBeLessThanOrEqual(64);
    expect(convertMobileMenu.left).toBeGreaterThanOrEqual(0);
    expect(convertMobileMenu.right).toBeLessThanOrEqual(convertMobileMenu.viewportWidth);
    expect(convertMobileMenu.bottom).toBeLessThanOrEqual(convertMobileMenu.viewportHeight + 1);
    expect(convertMobileMenu.documentOverflow).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="option"]:focus')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.asset-combobox-menu, .convert-contained-selector')).toHaveCount(0);
    await expect(page.getByTestId(testId)).toBeFocused();
  }

  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.getByTestId('form-exchange')).toBeVisible();
    await page.getByTestId('button-mode-select-instant').click();
    await page.getByTestId('convert-select-from-asset').click();
    await expect(page.getByTestId('search-convert-from-asset')).toBeVisible();

    const tabletMenuGeometry = await page.locator('.convert-contained-selector[data-state="open"]').evaluate((menu) => {
      const triggerElement = document.querySelector('[data-testid="convert-select-from-asset"]')!;
      const trigger = triggerElement.getBoundingClientRect();
      const row = triggerElement.closest('.reference-amount-panel')!.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const firstOption = menu.querySelector('[role="option"]')!.getBoundingClientRect();
      return {
        triggerWidth: trigger.width,
        triggerHeight: trigger.height,
        rowWidth: row.width,
        menuWidth: menuBounds.width,
        menuLeft: menuBounds.left,
        menuRight: menuBounds.right,
        optionHeight: firstOption.height,
        viewportWidth: window.innerWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(tabletMenuGeometry.menuWidth).toBeGreaterThanOrEqual(tabletMenuGeometry.rowWidth);
    expect(tabletMenuGeometry.menuWidth - tabletMenuGeometry.rowWidth).toBeLessThanOrEqual(48);
    expect(tabletMenuGeometry.triggerHeight).toBeGreaterThanOrEqual(44);
    expect(tabletMenuGeometry.optionHeight).toBeGreaterThanOrEqual(44);
    expect(tabletMenuGeometry.menuLeft).toBeGreaterThanOrEqual(0);
    expect(tabletMenuGeometry.menuRight).toBeLessThanOrEqual(tabletMenuGeometry.viewportWidth);
    expect(tabletMenuGeometry.documentOverflow).toBe(0);
    await page.keyboard.press('Escape');
  }

  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByTestId('convert-input-amount').fill('1');
  await expect(page.getByTestId('convert-button-continue')).toBeEnabled();
  await page.getByTestId('convert-button-continue').click();
  await expect(page.getByTestId('convert-input-destination-address')).toBeVisible();
  await expect(page.getByText('Destination address', { exact: false })).toBeVisible();
  await expect(page.getByText('Refund address', { exact: false })).toBeVisible();
  await expect(page.getByText('Email address', { exact: true })).toBeVisible();
  const convertFulfillmentGeometry = await page.evaluate(() => {
    const rect = (testId: string) => {
      const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        cssHeight: Number.parseFloat(getComputedStyle(element).height),
      };
    };
    return {
      destination: rect('convert-input-destination-address'),
      destinationMemo: rect('convert-input-destination-memo'),
      refund: rect('convert-input-refund-address'),
      email: rect('convert-input-email'),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(convertFulfillmentGeometry.destination.width).toBeGreaterThanOrEqual(240);
  expect(convertFulfillmentGeometry.destinationMemo.width).toBeGreaterThanOrEqual(104);
  expect(convertFulfillmentGeometry.refund.width).toBeGreaterThanOrEqual(240);
  expect(convertFulfillmentGeometry.email.width).toBeGreaterThanOrEqual(200);
  expect(convertFulfillmentGeometry.destination.cssHeight).toBeGreaterThanOrEqual(40);
  expect(convertFulfillmentGeometry.email.cssHeight).toBeGreaterThanOrEqual(40);
  expect(convertFulfillmentGeometry.destination.height).toBeGreaterThanOrEqual(40);
  expect(convertFulfillmentGeometry.email.height).toBeGreaterThanOrEqual(40);
  expect(convertFulfillmentGeometry.documentOverflow).toBe(0);
});

test('tracking clears stale results and keeps failures customer-safe', async ({ page }) => {
  const firstId = 'QX-11111111-1111-4111-8111-111111111111';
  const secondId = 'QX-22222222-2222-4222-8222-222222222222';
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route('**/api/quickex/orders/*/status*', async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.includes(secondId)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Quickex internal lookup code QUICKEX_SECRET_STATE',
          code: 'ORDER_NOT_FOUND',
          retryable: false,
          outcomeUnknown: false,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: firstId,
        type: 'manual',
        status: 'awaiting funds',
        manualSettlementState: 'awaiting_funds',
        fromAsset: 'BTC',
        fromNetwork: 'Bitcoin',
        toAsset: 'USDT',
        toNetwork: 'TRC20',
        amount: 1,
        receiveAmount: 99.5,
        depositAddress: 'saved-deposit-address',
        fundingDetails: {
          warning: 'Send only BTC on the Bitcoin network.',
          instructions: 'Copy the address exactly before sending.',
          requiredConfirmations: 3,
          confirmationGuidance: 'Confirmation usually takes about 30 minutes.',
        },
        rateMode: 'FLOATING',
        outcomeUnknown: false,
        refreshUnavailable: true,
        createdAt: new Date().toISOString(),
        provider: 'Quickex',
        providerState: 'secret provider state',
        errorCode: 'QUICKEX_SECRET_STATE',
        errorMessage: 'Quickex raw upstream text',
      }),
    });
  });

  await page.goto(`/status?order=${firstId}&token=tracking-token-first`);
  await expect(page.getByTestId(`card-order-status-${firstId}`)).toBeVisible();
  await expect(page.getByTestId('input-order-search')).toBeVisible();
  await expect(page.getByTestId('order-status-timeline')).toBeVisible();
  await expect(page.getByTestId('notice-refresh-unavailable')).toContainText('latest saved order status');
  await expect(page.getByText('Send only BTC on the Bitcoin network.')).toBeVisible();
  await expect(page.getByText('Copy the address exactly before sending.')).toBeVisible();
  await expect(page.getByText('Requires 3 network confirmation(s).')).toBeVisible();
  await expect(page.getByText('Confirmation usually takes about 30 minutes.')).toBeVisible();
  await expect(page.getByText(/Quickex|SECRET_STATE|secret provider state|raw upstream/i)).toHaveCount(0);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const exchangeLayout = await page.evaluate(() => {
      const rect = (testId: string) => {
        const box = document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, width: box.width };
      };
      return {
        display: getComputedStyle(document.querySelector('[data-testid="track-order-exchange-summary"]')!).display,
        columns: getComputedStyle(document.querySelector('[data-testid="track-order-exchange-summary"]')!).gridTemplateColumns,
        sent: rect('track-order-exchange-sent'),
        arrow: rect('track-order-exchange-arrow'),
        receive: rect('track-order-exchange-receive'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(exchangeLayout.display, `${width}px Track Order summary`).toBe('grid');
    expect(exchangeLayout.sent.width, `${width}px equal Track Order sides`).toBeCloseTo(exchangeLayout.receive.width, 0);
    expect(exchangeLayout.sent.right, `${width}px sent before arrow`).toBeLessThanOrEqual(exchangeLayout.arrow.left);
    expect(exchangeLayout.arrow.right, `${width}px arrow before receive`).toBeLessThanOrEqual(exchangeLayout.receive.left);
    expect(Math.abs(exchangeLayout.sent.top - exchangeLayout.receive.top), `${width}px horizontal Track Order row`).toBeLessThan(1);
    expect(exchangeLayout.overflow, `${width}px Track Order overflow`).toBeLessThanOrEqual(0);
    expect(exchangeLayout.columns.split(' ')).toHaveLength(3);
  }

  await page.getByTestId('input-order-search').fill(secondId);
  await page.getByTestId('button-search-order').click();
  await expect(page.getByTestId(`card-order-status-${firstId}`)).toHaveCount(0);

  await expect(page.getByTestId('empty-order-result')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('empty-order-result')).toContainText('Order not found');
  await expect(page.getByTestId('empty-order-result')).toContainText('Check your Order ID and try again.');
  await expect(page.getByTestId('input-order-search')).toHaveValue(secondId);
  await expect(page.getByText(/Quickex|SECRET_STATE|secret provider state|raw upstream/i)).toHaveCount(0);
});

test('quote expiry disables submission and refreshes safely', async ({ page }) => {
  let quoteRequests = 0;
  let orderRequests = 0;

  await page.route('**/api/exchange/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(exchangeConfig),
    });
  });

  await page.route(/\/api\/orders(?:\?|$)/, async (route) => {
    orderRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'The test must not submit an order.' }),
    });
  });

  await page.route('**/api/exchange/quote', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body.fromNetwork).toBe('Bank transfer');
    expect(body.toNetwork).toBe('Bitcoin');
    quoteRequests += 1;
    // Return a quote that expires in just 2 seconds so we can test the expiry logic quickly
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: `quote-expiring-${quoteRequests}`,
        type: 'manual',
        provider: 'Manual desk',
        fromAsset: 'USD',
        fromNetwork: 'Bank transfer',
        toAsset: 'BTC',
        toNetwork: 'Bitcoin',
        amount: 100,
        receiveAmount: 0.002,
        rate: 0.00002,
        fee: 0.6,
        expiresAt: new Date(Date.now() + 2000).toISOString(),
      }),
    });
  });

  await page.goto('/');

  const amount = page.getByTestId('input-amount');
  await amount.fill('100');

  // Verify quote is loaded and the wizard can continue.
  await expect.poll(() => quoteRequests).toBe(1);
  await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
  await page.getByTestId('button-swap-continue').click();
  await expect(page.getByTestId('swap-button-submit')).toBeVisible();

  // Wait for the quote to expire (2 seconds + margin)
  await page.waitForTimeout(2500);

  // Expiry returns to quote review and requests a fresh quote while visible.
  await expect.poll(() => quoteRequests).toBeGreaterThan(1);
  await expect(page.getByTestId('button-exchange')).toHaveCount(0);
  await expect(page.getByTestId('button-swap-continue')).toBeEnabled();
  expect(orderRequests).toBe(0); // Zero real order creation
});

test('keeps manual Swap and automatic Convert API namespaces isolated', async ({ page }) => {
  let quickexBusinessCalls = 0;
  let manualQuoteCalls = 0;
  let manualOrderWrites = 0;
  await page.route('**/api/exchange/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(instantExchangeConfig) }));
  await page.route('**/api/exchange/quote', route => {
    manualQuoteCalls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      quoteId: 'manual-quote-00000001', type: 'manual', provider: 'Manual desk',
      fromAsset: 'USD', fromNetwork: 'Bank transfer', toAsset: 'BTC', toNetwork: 'Bitcoin',
      amount: 1, receiveAmount: 0.0001, rate: 0.0001, fee: 0, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }) });
  });
  await page.route(/\/api\/orders(?:\?|$)/, route => {
    manualOrderWrites += 1;
    return route.fulfill({ status: 500 });
  });
  await page.route('**/api/quickex/**', route => {
    if (!route.request().url().endsWith('/api/quickex/config')) {
      quickexBusinessCalls += 1;
    }
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Quickex quote and order routes must not be called by Swap.' }),
    });
  });
  await page.goto('/');
  await page.getByTestId('input-amount').fill('1');
  await expect.poll(() => manualQuoteCalls).toBe(1);
  expect(quickexBusinessCalls).toBe(0);
  expect(manualOrderWrites).toBe(0);

  await page.unroute('**/api/quickex/**');
  await page.route('**/api/quickex/config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    provider: 'Quickex', signedOrders: true,
    instruments: [
      { currencyTitle: 'BTC', networkTitle: 'Bitcoin', slug: 'btc-bitcoin', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', precisionDecimals: 8, requiresMemo: false },
      { currencyTitle: 'USDT', networkTitle: 'TRC20', slug: 'usdt-trc20', instrumentType: 'crypto', fullName: 'Tether', currencyFriendlyTitle: 'Tether', precisionDecimals: 6, requiresMemo: false },
    ],
    pairs: [{ fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' }],
  }) }));
  await page.route('**/api/quickex/quote', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    quoteId: 'quickex-quote-00000001', type: 'instant', provider: 'Quickex', fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20',
    amount: 1, receiveAmount: 99, rate: 99, fee: 0, expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }) }));
  await page.getByTestId('button-mode-select-instant').click();
  await page.getByTestId('convert-input-amount').fill('1');
  await expect(page.getByTestId('convert-input-receive-amount')).toHaveValue('99');
  expect(manualQuoteCalls).toBe(1);
  expect(manualOrderWrites).toBe(0);
});