import { expect, test } from '@playwright/test';

const existingOrder = {
  id: 'QX-33333333-3333-4333-8333-333333333333',
  type: 'instant',
  status: 'sending payout',
  fromAsset: 'BTC',
  fromNetwork: 'Bitcoin',
  toAsset: 'USDT',
  toNetwork: 'TRC20',
  amount: '0.250000000000000001',
  receiveAmount: '9007199254740993.123456789012345678',
  rateMode: 'FIXED',
  outcomeUnknown: false,
  refreshUnavailable: false,
  statusNotificationsEnabled: false,
  createdAt: '2026-08-23T12:00:00.000Z',
  fundingDetails: {
    transactionHash: '0x82f1234567890123456789012345678900009ac2',
    depositAddress: 'bc1q4exampledepositaddress0000000000000000',
    paymentReference: '',
  },
  settlementDetails: {
    destinationAddress: 'TQxExampleDestinationAddress000000000000',
    providerReference: 'PX-2026-000004219',
  },
  provider: 'must-not-render-provider',
  destinationAddress: 'must-not-render-wallet',
  note: 'must-not-render-note',
  errorMessage: 'must-not-render-error',
};

const claimedOrder = {
  ...existingOrder,
  id: 'QX-44444444-4444-4444-8444-444444444444',
  type: 'manual',
  status: 'pending',
  fromAsset: 'EUR',
  fromNetwork: 'SEPA',
  amount: '500',
  receiveAmount: '0',
  rateMode: undefined,
  createdAt: '2026-08-24T12:00:00.000Z',
};

const settlementOptions = [
  {
    id: 'crypto:btc-bitcoin',
    assetId: 'btc',
    assetCode: 'BTC',
    routeNetwork: 'Bitcoin',
    kind: 'crypto-network',
    title: 'Bitcoin',
    networkTitle: 'Bitcoin',
    direction: 'both',
    executionMode: 'manual',
    lifecycle: 'active',
    regions: [],
    countries: [],
    requiresMemo: false,
  },
  {
    id: 'crypto:usdt-trc20',
    assetId: 'usdt',
    assetCode: 'USDT',
    routeNetwork: 'TRC20',
    kind: 'crypto-network',
    title: 'Tether',
    networkTitle: 'TRON',
    direction: 'both',
    executionMode: 'manual',
    lifecycle: 'active',
    regions: [],
    countries: [],
    requiresMemo: false,
  },
];

test('customers can review, reload, inspect, and claim their orders', async ({ page }) => {
  let items = [existingOrder];
  let claimRequest: unknown;
  let notificationRequest: unknown;

  await page.addInitScript(() => localStorage.setItem('qx-theme', 'light'));

  await page.route('**/api/exchange/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      assets: [
        { id: 'btc', code: 'BTC', name: 'Bitcoin', networks: ['Bitcoin'] },
        { id: 'usdt', code: 'USDT', name: 'Tether', networks: ['TRC20'] },
      ],
      fiatCurrencies: [],
      settlementOptions,
      manualSettlementOptions: settlementOptions,
      instantSettlementOptions: [],
      manualRouteAvailability: {
        available: true,
        routes: [{
          sourceSettlementOptionId: 'crypto:btc-bitcoin',
          targetSettlementOptionId: 'crypto:usdt-trc20',
        }],
        unavailableMessage: null,
      },
      providers: [],
      feePercent: 0.5,
      manualPricingMessage: 'Rates include the configured desk fee.',
    }),
  }));

  await page.route('**/api/quickex/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      provider: 'Quickex',
      signedOrders: true,
      instruments: [
        {
          currencyTitle: 'BTC',
          networkTitle: 'Bitcoin',
          slug: 'btc-bitcoin',
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
          currencyFriendlyTitle: 'Tether',
          precisionDecimals: 6,
          requiresMemo: false,
        },
      ],
      pairs: [{
        fromAsset: 'BTC',
        fromNetwork: 'Bitcoin',
        toAsset: 'USDT',
        toNetwork: 'TRC20',
      }],
    }),
  }));

  await page.route(/\/api\/account\/orders(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total: items.length,
        page: 1,
        pageSize: 10,
        refreshUnavailable: false,
      }),
    });
  });

  await page.route('**/api/account/orders/claim', async (route) => {
    claimRequest = route.request().postDataJSON();
    items = [claimedOrder, existingOrder];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(claimedOrder),
    });
  });

  await page.route(/\/api\/account\/orders\/QX-[^/?]+\/notifications$/, async (route) => {
    notificationRequest = route.request().postDataJSON();
    const id = route.request().url().split('/').at(-2);
    const enabled = Boolean((notificationRequest as { enabled?: boolean })?.enabled);
    items = items.map((item) =>
      item.id === id ? { ...item, statusNotificationsEnabled: enabled } : item
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        orderId: id,
        statusNotificationsEnabled: enabled,
      }),
    });
  });

  await page.route(/\/api\/account\/orders\/QX-[^/?]+$/, async (route) => {
    const id = route.request().url().split('/').pop();
    const order = items.find((item) => item.id === id);
    await route.fulfill({
      status: order ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(order ?? { error: 'Order not found.', code: 'CUSTOMER_ORDER_NOT_FOUND' }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/account');
  const exchangeRegion = page.locator('.customer-exchange-region');
  const activeWidget = exchangeRegion.locator('.exchange-mode-layer.active-layer > .exchange-card');
  const statsRegion = page.getByTestId('customer-dashboard-stats');
  const recentRegion = page.getByTestId('customer-dashboard-recent');
  await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
  await expect(exchangeRegion).toBeVisible();
  await expect(statsRegion).toBeVisible();
  await expect(recentRegion).toBeVisible();
  await expect(page.getByTestId('button-mode-select-manual')).toBeVisible();

  const desktopWidgetBox = await exchangeRegion.boundingBox();
  const desktopActiveWidgetBox = await activeWidget.boundingBox();
  const desktopStatsBox = await statsRegion.boundingBox();
  const desktopRecentBox = await recentRegion.boundingBox();
  expect(desktopWidgetBox).not.toBeNull();
  expect(desktopActiveWidgetBox).not.toBeNull();
  expect(desktopStatsBox).not.toBeNull();
  expect(desktopRecentBox).not.toBeNull();
  expect(desktopWidgetBox!.width).toBeGreaterThanOrEqual(550);
  expect(desktopWidgetBox!.width).toBeLessThanOrEqual(850);
  expect(desktopActiveWidgetBox!.width).toBeGreaterThanOrEqual(500);
  expect(desktopActiveWidgetBox!.width).toBeLessThan(desktopWidgetBox!.width);
  expect(desktopActiveWidgetBox!.height).toBeLessThanOrEqual(700);
  expect(desktopStatsBox!.x).toBeGreaterThan(desktopWidgetBox!.x + desktopWidgetBox!.width - 50);
  expect(desktopRecentBox!.y).toBeGreaterThan(Math.max(desktopWidgetBox!.y, desktopStatsBox!.y));

  await page.getByTestId('button-mode-select-instant').click();
  await expect(exchangeRegion.locator('.exchange-mode-layer.active-layer [data-mode-target="convert"]')).toBeVisible();
  await page.getByTestId('button-mode-select-manual').click();
  await expect(exchangeRegion.locator('.exchange-mode-layer.active-layer [data-mode-target="swap"]')).toBeVisible();

  for (const width of [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1366, 1440, 1600, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, `${width}px dashboard width`).toBeLessThanOrEqual(dimensions.viewport);
    const widgetBox = await exchangeRegion.boundingBox();
    expect(widgetBox, `${width}px exchange widget`).not.toBeNull();
    expect(widgetBox!.width).toBeLessThanOrEqual(Math.min(850, dimensions.viewport));
    const stackedStatsBox = await statsRegion.boundingBox();
    const stackedRecentBox = await recentRegion.boundingBox();
    expect(stackedStatsBox, `${width}px stats region`).not.toBeNull();
    expect(stackedRecentBox, `${width}px recent region`).not.toBeNull();
    if (width >= 1024) {
      expect(stackedStatsBox!.x).toBeGreaterThan(widgetBox!.x + widgetBox!.width - 50);
      expect(stackedRecentBox!.y).toBeGreaterThan(Math.max(widgetBox!.y, stackedStatsBox!.y));
      const primaryBox = await page.getByTestId('customer-dashboard-layout').boundingBox();
      const statCards = await statsRegion.locator(':scope > .dashboard-stat-card').all();
      const statCardBoxes = await Promise.all(statCards.map(card => card.boundingBox()));
      expect(primaryBox, `${width}px dashboard primary region`).not.toBeNull();
      const contentWidth = widgetBox!.width + stackedStatsBox!.width;
      expect(widgetBox!.width / contentWidth, `${width}px widget column ratio`).toBeGreaterThanOrEqual(0.6);
      expect(widgetBox!.width / contentWidth, `${width}px widget column ratio`).toBeLessThanOrEqual(0.65);
      expect(Math.abs(stackedRecentBox!.x - primaryBox!.x), `${width}px recent orders left alignment`).toBeLessThanOrEqual(1);
      expect(Math.abs(stackedRecentBox!.width - primaryBox!.width), `${width}px recent orders full width`).toBeLessThanOrEqual(1);
      expect(statCardBoxes.every(Boolean), `${width}px stat cards visible`).toBe(true);
      const statCardHeights = statCardBoxes.map(box => box!.height);
      expect(Math.max(...statCardHeights) - Math.min(...statCardHeights), `${width}px consistent stat card heights`).toBeLessThanOrEqual(2);
    } else {
      expect(stackedStatsBox!.y).toBeGreaterThan(widgetBox!.y);
      expect(stackedRecentBox!.y).toBeGreaterThan(stackedStatsBox!.y);
    }
    if (width < 768) {
      const recentTable = page.locator('.dashboard-swipeable-table table');
      await expect(recentTable).toBeVisible();
      const swipeMetrics = await recentTable.evaluate(async (table) => {
        const viewport = table.closest<HTMLElement>('.mobile-table-scroll')!;
        const hint = viewport.previousElementSibling as HTMLElement;
        const firstCell = table.querySelector<HTMLElement>('tbody tr:first-child > :first-child')!;
        const lastCell = table.querySelector<HTMLElement>('tbody tr:first-child > :last-child')!;
        viewport.scrollLeft = 0;
        const before = [firstCell.getBoundingClientRect().left, lastCell.getBoundingClientRect().left];
        viewport.scrollLeft = Math.min(120, viewport.scrollWidth - viewport.clientWidth);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const after = [firstCell.getBoundingClientRect().left, lastCell.getBoundingClientRect().left];
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
      expect(swipeMetrics.tableWidth, `${width}px recent table width`).toBeGreaterThan(swipeMetrics.viewportWidth);
      expect(swipeMetrics.scrollLeft, `${width}px recent table scroll`).toBeGreaterThan(0);
      expect(swipeMetrics.hintOpacity, `${width}px recent table hint`).toBe('0');
      expect(swipeMetrics.stickyParts, `${width}px recent table sticky parts`).toBe(0);
      for (const movement of swipeMetrics.movement) {
        expect(movement, `${width}px recent table whole-row movement`).toBeCloseTo(-swipeMetrics.scrollLeft, 0);
      }
    }
    if (width === 390) {
      const firstStatBox = await statsRegion.locator(':scope > div').nth(0).boundingBox();
      const secondStatBox = await statsRegion.locator(':scope > div').nth(1).boundingBox();
      expect(firstStatBox).not.toBeNull();
      expect(secondStatBox).not.toBeNull();
      expect(secondStatBox!.x).toBeGreaterThan(firstStatBox!.x);
      expect(Math.abs(secondStatBox!.y - firstStatBox!.y)).toBeLessThanOrEqual(2);

      await expect(page.locator('html')).not.toHaveClass(/dark/);
      await expect(page.locator('.customer-shell')).not.toHaveClass(/dark/);
      await page.getByTestId('button-mobile-menu').click();
      const drawer = page.locator('[data-customer-drawer]');
      await expect(drawer).toBeVisible();
      await expect(drawer.locator('[data-testid="link-customer-brand"] img')).toHaveAttribute('src', /quick-change-logo\.png$/);
      const drawerBackground = await drawer.locator('.bg-card').first().evaluate(
        element => getComputedStyle(element).backgroundColor,
      );
      expect(drawerBackground).toBe('rgb(255, 255, 255)');
      await drawer.getByTestId('button-customer-menu-close').click();
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(page.getByTestId('customer-order-history')).toBeVisible();
  const customerVisualContract = await page.locator('.customer-shell').evaluate((shell) => {
    const shellStyle = getComputedStyle(shell);
    const cards = Array.from(shell.querySelectorAll<HTMLElement>('.customer-card'));
    return {
      shellBackgroundImage: shellStyle.backgroundImage,
      bodyTextureContent: getComputedStyle(document.body, '::before').content,
      cards: cards.map(card => {
        const style = getComputedStyle(card);
        return {
          backgroundImage: style.backgroundImage,
          borderRadius: style.borderRadius,
          isDashboardStat: card.classList.contains('dashboard-stat-card'),
        };
      }),
    };
  });
  expect(customerVisualContract.shellBackgroundImage).not.toContain('url(');
  expect(customerVisualContract.shellBackgroundImage).not.toContain('repeating-');
  expect(customerVisualContract.bodyTextureContent).toBe('none');
  expect(customerVisualContract.cards.length).toBeGreaterThan(0);
  expect(customerVisualContract.cards.every(card => card.borderRadius === '16px')).toBe(true);
  expect(customerVisualContract.cards.filter(card => !card.isDashboardStat).every(card => card.backgroundImage === 'none')).toBe(true);
  expect(customerVisualContract.cards.filter(card => card.isDashboardStat).every(card => card.backgroundImage !== 'none')).toBe(true);
  await expect(page.getByTestId(`customer-order-${existingOrder.id}`)).toBeVisible();
  const visibleRouteIdentity = await page.getByTestId(`customer-order-${existingOrder.id}`).locator('.customer-order-route').evaluate((route) => ({
    routeScrollWidth: route.scrollWidth,
    routeClientWidth: route.clientWidth,
    labels: Array.from(route.querySelectorAll<HTMLElement>('.crypto-identity-primary strong, .crypto-network-badge, .crypto-identity-name')).map(label => ({
      text: label.textContent?.trim(),
      textOverflow: getComputedStyle(label).textOverflow,
      overflow: getComputedStyle(label).overflow,
      whiteSpace: getComputedStyle(label).whiteSpace,
    })),
  }));
  expect(visibleRouteIdentity.labels.map(label => label.text)).toEqual(expect.arrayContaining(['BTC', 'Bitcoin', 'USDT', 'TRC20', 'Tether']));
  expect(visibleRouteIdentity.labels.every(label => label.textOverflow === 'clip')).toBe(true);
  expect(visibleRouteIdentity.labels.every(label => label.overflow === 'visible')).toBe(true);
  expect(visibleRouteIdentity.labels.every(label => label.whiteSpace === 'nowrap')).toBe(true);
  expect(visibleRouteIdentity.routeScrollWidth).toBeLessThanOrEqual(visibleRouteIdentity.routeClientWidth);
  await expect(page.getByText('0.250000000000000001', { exact: true })).toBeVisible();
  await expect(page.getByText('operator@example.test')).toHaveCount(0);
  await page.getByTestId('button-profile-menu').click();
  await expect(page.getByText('operator@example.test')).toBeVisible();
  await page.getByTestId('button-profile-menu').click();
  await expect(page.getByText('must-not-render-provider')).toHaveCount(0);
  await expect(page.getByText('must-not-render-wallet')).toHaveCount(0);
  await expect(page.getByText('must-not-render-note')).toHaveCount(0);
  await expect(page.getByText('must-not-render-error')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId(`customer-order-${existingOrder.id}`)).toBeVisible();
  await page.getByRole('link', { name: /QX-3333/ }).click();
  await expect(page).toHaveURL(/\/account\/orders\/QX-33333333/);
  await expect(page.getByTestId('customer-order-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: '9,007,199,254,740,993.123456789012345678 USDT' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to account' })).toHaveCount(0);
  await expect(page.getByTestId('order-detail-actions')).toHaveCount(0);
  await expect(page.getByText(existingOrder.id, { exact: true })).toBeVisible();
  await expect(page.getByText('must-not-render-provider')).toHaveCount(0);
  await expect(page.getByTestId('order-status-timeline')).toBeVisible();
  await expect(page.getByTestId('order-exchange-details')).toBeVisible();
  await expect(page.getByTestId('order-exchange-details')).toHaveClass(/customer-card/);
  await expect(page.getByTestId('transaction-details')).toBeVisible();
  await expect(page.getByTitle(existingOrder.fundingDetails.transactionHash)).toBeVisible();
  await expect(page.getByText('Payment Reference', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('nav--account-orders')).toHaveClass(/customer-sidebar-link-active/);
  await expect(page.getByTestId('customer-order-notifications')).toBeVisible();
  await expect(page.getByTestId('switch-order-notifications')).not.toBeChecked();

  for (const width of [320, 360, 375, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      timelineDirection: getComputedStyle(document.querySelector('[data-testid="order-status-timeline"] > div:last-child')!).flexDirection,
      exchangeDisplay: getComputedStyle(document.querySelector('[data-testid="order-exchange-details"] > div')!).display,
      sent: document.querySelector('[data-testid="order-exchange-sent"]')!.getBoundingClientRect(),
      receive: document.querySelector('[data-testid="order-exchange-receive"]')!.getBoundingClientRect(),
      arrow: document.querySelector('[data-testid="order-exchange-arrow"]')!.getBoundingClientRect(),
      card: document.querySelector('[data-testid="order-exchange-details"]')!.getBoundingClientRect(),
    }));
    expect(layout.scrollWidth, `${width}px order detail width`).toBeLessThanOrEqual(layout.viewport);
    expect(layout.timelineDirection, `${width}px order timeline`).toBe('column');
    expect(layout.exchangeDisplay, `${width}px exchange flow`).toBe('grid');
    expect(layout.sent.width, `${width}px equal exchange sides`).toBeCloseTo(layout.receive.width, 0);
    expect(layout.sent.right, `${width}px sent before arrow`).toBeLessThanOrEqual(layout.arrow.left);
    expect(layout.arrow.right, `${width}px arrow before receive`).toBeLessThanOrEqual(layout.receive.left);
    expect(layout.sent.left, `${width}px sent contained`).toBeGreaterThanOrEqual(layout.card.left);
    expect(layout.receive.right, `${width}px receive contained`).toBeLessThanOrEqual(layout.card.right);
    await expect(page.getByTestId('button-mobile-menu')).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByTestId('control-order-notifications').click();
  await expect.poll(() => notificationRequest).toEqual({ enabled: true });
  await expect(page.getByTestId('switch-order-notifications')).toBeChecked();
  await expect(page.getByTestId('notice-success')).toContainText(
    'Status notifications are on for this order',
  );
  await page.reload();
  await expect(page.getByTestId('switch-order-notifications')).toBeChecked();

  await page.goto('/account');
  await page.getByTestId('input-claim-order').fill(claimedOrder.id);
  await page.getByTestId('button-claim-order').click();
  await expect(page.getByTestId('notice-success')).toContainText('Order added to your account');
  await expect.poll(() => claimRequest).toEqual({ orderId: claimedOrder.id });
  await expect(page.getByTestId(`customer-order-${claimedOrder.id}`)).toBeVisible();
});

test('customer order details translate provider states into clear public progress labels', async ({ page }) => {
  let status = 'awaiting deposit';
  const orderId = existingOrder.id;

  await page.route(`**/api/account/orders/${orderId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...existingOrder, status }),
    });
  });

  const states = [
    ['awaiting deposit', 'Pending'],
    ['deposit received', 'Processing'],
    ['on hold', 'Operator Reviewing'],
    ['verification required', 'Operator Reviewing'],
    ['refunded', 'Failed'],
    ['completed', 'Completed'],
  ] as const;

  for (const [providerStatus, publicLabel] of states) {
    status = providerStatus;
    await page.goto(`/account/orders/${orderId}`);
    await expect(page.getByTestId(`status-${providerStatus}`)).toHaveText(publicLabel);
  }
});