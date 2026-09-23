import { expect, test, type Page } from '@playwright/test';
import { publishedSiteContentStub } from '../artifacts/crypto-exchange-widget/test/site-content-stub';

const viewports = [
  { name: 'phone-320', width: 320, height: 720 },
  { name: 'phone-360', width: 360, height: 760 },
  { name: 'phone-375', width: 375, height: 812 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-412', width: 412, height: 915 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

const routeAuditViewports = [
  ...viewports,
  { name: 'laptop-boundary', width: 1024, height: 768 },
  { name: 'large-desktop', width: 1440, height: 1000 },
] as const;

const adminWorkspaceViewports = [
  { name: 'ipad-768', width: 768, height: 1024 },
  { name: 'ipad-820', width: 820, height: 1180 },
  { name: 'ipad-834', width: 834, height: 1112 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'laptop-1440', width: 1440, height: 900 },
  { name: 'desktop-1600', width: 1600, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
] as const;

const routeAuditPaths = [
  '/',
  '/status',
  '/account',
  '/account/orders',
  '/account/orders/nonexistent',
  '/account/settings',
  '/sign-in',
  '/sign-up',
  '/account/affiliate',
  '/admin',
  '/admin/orders',
  '/admin/revenue',
  '/admin/customers',
  '/admin/affiliates',
  '/admin/affiliates/nonexistent',
  '/admin/payouts',
  '/admin/affiliate-settings',
  '/admin/providers',
  '/admin/integrations',
  '/admin/currencies',
  '/admin/pricing',
  '/admin/staff',
  '/missing-layout-check',
] as const;

const orderId = 'QX-11111111-1111-4111-8111-111111111111';
const now = '2026-08-29T12:00:00.000Z';
const settlementOptions = [
  {
    id: 'crypto:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', routeNetwork: 'Bitcoin',
    kind: 'crypto-network', title: 'Bitcoin', networkTitle: 'Bitcoin', direction: 'both',
    executionMode: 'manual', lifecycle: 'active', regions: [], countries: [], requiresMemo: false,
  },
  {
    id: 'crypto:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20',
    kind: 'crypto-network', title: 'Tether', networkTitle: 'TRON', direction: 'both',
    executionMode: 'manual', lifecycle: 'active', regions: [], countries: [], requiresMemo: false,
  },
];
const exchangeConfig = {
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
    routes: [{ sourceSettlementOptionId: 'crypto:btc-bitcoin', targetSettlementOptionId: 'crypto:usdt-trc20' }],
    unavailableMessage: null,
  },
  providers: [],
  feePercent: 0.5,
  manualPricingMessage: 'Rates include the configured desk fee.',
};
const quickexConfig = {
  provider: 'Quickex',
  signedOrders: true,
  instruments: [
    { currencyTitle: 'BTC', networkTitle: 'Bitcoin', slug: 'btc-bitcoin', instrumentType: 'crypto', fullName: 'Bitcoin', currencyFriendlyTitle: 'Bitcoin', precisionDecimals: 8, requiresMemo: false },
    { currencyTitle: 'USDT', networkTitle: 'TRC20', slug: 'usdt-trc20', instrumentType: 'crypto', fullName: 'Tether', currencyFriendlyTitle: 'Tether', precisionDecimals: 6, requiresMemo: false },
  ],
  pairs: [{ fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' }],
};
const pricingRules = {
  items: [{
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Any route',
    sourceAsset: null,
    targetAsset: null,
    sourceNetwork: null,
    targetNetwork: null,
    paymentMethod: null,
    payoutMethod: null,
    sourceSettlementOptionId: null,
    targetSettlementOptionId: null,
    markupBasisPoints: 50,
    fixedFee: null,
    priority: 0,
    enabled: true,
    version: 1,
    specificity: 0,
    missingSettlementOptionIds: [],
    createdAt: now,
    updatedAt: now,
  }],
  diagnostics: { hasEnabledAnyToAnyFallback: true, orphanRules: [], uncoveredRoutes: [] },
};
const order = {
  id: orderId,
  type: 'instant',
  status: 'sending payout',
  recordVersion: 1,
  fromAsset: 'BTC',
  fromNetwork: 'Bitcoin',
  toAsset: 'USDT',
  toNetwork: 'TRC20',
  amount: '1.25',
  receiveAmount: '82450',
  customerEmail: 'layout@example.test',
  customerName: 'Layout Test',
  customerRegistered: true,
  destinationAddress: 'TLayoutDestinationAddress',
  destinationMemo: '',
  refundAddress: 'bc1layoutrefundaddress',
  refundMemo: '',
  depositAddress: 'bc1layoutdepositaddress',
  depositMemo: '',
  paymentMethod: '',
  payoutMethod: '',
  provider: 'Quickex',
  note: '',
  providerReference: 'layout-provider-reference',
  providerOrderId: '12345',
  providerState: 'sending payout',
  rateMode: 'FIXED',
  quoteId: 'layout-quote',
  errorCode: '',
  errorMessage: '',
  outcomeUnknown: false,
  providerClaimedDepositAmount: '1.25',
  providerExpectedReceiveAmount: '82450',
  providerPaidAmount: null,
  providerCreatedAt: now,
  providerUpdatedAt: now,
  providerCompleted: false,
  assignedOperatorId: 'operator-1',
  archivedAt: null,
  archivedBy: null,
  createdAt: now,
};

function summary() {
  return {
    owner: true,
    effectivePermissions: [],
    product: 'swap',
    from: now,
    to: now,
    totalOrders: 1,
    pendingOrders: 1,
    completedOrders: 0,
    failedCancelledOrders: 0,
    totalCustomers: 1,
    totalUsers: 1,
    completionRate: 0,
    averageCompletionTimeMinutes: null,
    averageOrderValueUsd: 0,
    topPaymentMethods: [],
    topCurrencies: [],
    topTradingPairs: [],
    dailySeries: [],
    recentActivity: [],
    valuation: { observedAt: null, status: 'unavailable', valuedOrders: 0, totalOrders: 1, unavailableCurrencies: [] },
    operationalHealth: {
      providerFreshness: { state: 'healthy', syncing: false },
      catalog: { stale: false },
      unresolvedOrders: 0,
      notificationsPending: 0,
      notificationsFailed: 0,
      oldestPendingNotificationAt: null,
    },
  };
}

async function mockLayoutApis(page: Page) {
  // The landing-market card reads Coinbase's public catalogue directly. Keep
  // that optional browser request deterministic as well as the app API calls.
  await page.route('https://api.exchange.coinbase.com/products**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};

    if (path === '/api/exchange/config') body = exchangeConfig;
    else if (path === '/api/site-content') body = publishedSiteContentStub;
    else if (path === '/api/site-navigation') body = [];
    else if (path === '/api/admin/authorization') body = {
      member: { id: 'operator-1', email: 'operator@example.test', role: 'owner', status: 'active' },
      owner: true,
      effectivePermissions: [],
      catalog: [],
    };
    else if (path === '/api/quickex/config') body = quickexConfig;
    else if (path === '/api/admin/summary') body = summary();
    else if (path === '/api/orders') body = { items: [order], total: 1, page: 1, pageSize: 25 };
    else if (path === `/api/orders/${orderId}`) body = order;
    else if (path === `/api/orders/${orderId}/audit-log`) body = [];
    else if (path === `/api/orders/${orderId}/reconciliation-attempts`) body = { items: [], limit: 50 };
    else if (path === '/api/admin/operators') body = [{ id: 'operator-1', email: 'operator@example.test', role: 'owner', status: 'active', linkedToClerk: true, createdAt: now, updatedAt: now }];
    else if (path === '/api/admin/manual-desk-pricing-rules') body = pricingRules;
    else if (path === '/api/admin/manual-desk-revenue') body = {
      from: now,
      to: now,
      groupBy: 'pricingRule',
      reportingCurrency: 'USD',
      normalizationPolicy: { decimalScale: 30, rounding: 'truncateAfterAggregation' },
      generatedAt: now,
      totals: [{ status: 'completed', targetAsset: 'USD', orderCount: 1, grossCustomerVolume: '12500', expectedFeeRevenue: '125.50' }],
      normalizedTotals: [{ status: 'completed', orderCount: 1, historicalGrossCustomerVolume: '12500', historicalExpectedFeeRevenue: '125.50' }],
      groups: [{
        key: 'layout-rule', label: 'Layout pricing rule', status: 'completed', targetAsset: 'USD', orderCount: 1,
        grossCustomerVolume: '12500', expectedFeeRevenue: '125.50',
        normalizedGrossCustomerVolume: '12500', normalizedExpectedFeeRevenue: '125.50',
      }],
    };
    else if (path === '/api/admin/providers/oneforge') body = { provider: '1Forge', configured: true, state: 'healthy', fetchedAt: now, ageMs: 1000, rates: [] };
    else if (path === '/api/quickex/admin/credentials') body = {
      provider: 'Quickex', liveQuotes: true, signedOrders: true, configured: true,
      remotelyAuthenticated: true, verificationState: 'verified', providerReachability: 'reachable',
      blockedByProviderPolicy: false, apiKeyConfigured: true, publicKeyConfigured: true,
      secretKeyConfigured: true, credentialSource: 'stored', canManage: true, updatedAt: now,
      mode: 'live', reconciliation: {
        state: 'healthy', consecutiveFailures: 0, freshnessMs: 1000, lastStartedAt: now,
        lastSucceededAt: now, lastFailedAt: null, nextRetryAt: null,
      },
    };
    else if (path === '/api/admin/customers') body = {
      items: [{ id: 'customer-layout', name: 'Layout Customer', email: 'customer@example.test', ordersCount: 3, volume: 12500, lastActivity: now, status: 'active' }],
      total: 1, page: 1, pageSize: 25,
    };
    else if (path === '/api/admin/fiat-currencies' || path === '/api/admin/payment-methods'
      || path === '/api/admin/fiat-currency-payment-methods' || path === '/api/admin/crypto-assets'
      || path === '/api/admin/crypto-networks' || path === '/api/admin/operator-audit') body = [];
    else if (path === '/api/admin/affiliate/overview') body = {
      affiliateCount: 1, activeAffiliates: 1, ledgerEntries: 2, netCommissionUsd: '125.50',
      reservedPayoutUsd: '25.00', growth: [], topAffiliates: [],
    };
    else if (path === '/api/admin/affiliate/accounts') body = {
      items: [{ id: 'affiliate-layout', code: 'LAYOUT', createdAt: now, referrerBoundAt: now, status: 'bound', referredUsers: 4, commissionUsd: '125.50' }],
      total: 1, page: 1, pageSize: 25,
    };
    else if (path === '/api/admin/affiliate/payouts') body = [{
      id: 'payout-layout', affiliateAccountId: 'affiliate-layout', amountUsd: '25.00', status: 'requested',
      destination: { asset: 'USDT', networkCode: 'TRC20', networkName: 'TRON', walletAddress: 'TLayoutPayoutWallet' },
      requestedAt: now, decidedAt: null, decidedBy: null, paidAt: null, txid: null,
    }];
    else if (path === '/api/admin/affiliate/settings') body = {
      id: '00000000-0000-4000-8000-000000000201', version: 1, enabled: true,
      quickexEnabled: true, manualEnabled: true, commissionRate: '0.1',
      minimumEligibleUsd: '10', payoutMinimumUsd: '10', cookieDurationDays: 30, createdAt: now,
    };
    else if (path === '/api/admin/affiliate/valuation-reviews') body = [];
    else if (path === '/api/admin/landing-background') body = {
      mode: 'preset',
      presetId: 'neon-orbit',
      customObjectPath: null,
      focalX: 50,
      focalY: 50,
      desktopPlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
      mobilePlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
      version: 1,
      createdAt: now,
      createdBy: 'operator-1',
      placements: {},
    };
    else if (path === '/api/healthz') body = { status: 'ok' };
    else if (path === '/api/customer/orders') body = { items: [], total: 0, page: 1, pageSize: 10 };

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function expectNoDocumentOverflow(page: Page, label: string) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.position === 'fixed') return false;
        const bounds = element.getBoundingClientRect();
        return bounds.right > root.clientWidth + 1 || bounds.left < -1;
      })
      .slice(0, 8)
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}.${element.className} [${Math.round(bounds.left)}, ${Math.round(bounds.right)}]`;
      });
    return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, offenders };
  });
  expect(layout.scrollWidth, `${label} overflowed horizontally: ${layout.offenders.join(', ')}`).toBeLessThanOrEqual(layout.clientWidth);
}

async function expectTouchTarget(locator: ReturnType<Page['locator']>, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} must be visible`).not.toBeNull();
  expect(box!.width, `${label} must be at least 44px wide`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} must be at least 44px tall`).toBeGreaterThanOrEqual(44);
}

async function expectViewportContainedSelector(page: Page, selector: string, label: string) {
  const overlay = page.locator(`${selector}[data-state="open"]`);
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.evaluate(element =>
    element.getAnimations().every(animation => animation.playState === 'finished'),
  )).toBe(true);
  const geometry = await overlay.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      viewportLeft,
      viewportTop,
      viewportRight: viewportLeft + (viewport?.width ?? window.innerWidth),
      viewportBottom: viewportTop + (viewport?.height ?? window.innerHeight),
      hasScrollOwner: Array.from(element.querySelectorAll<HTMLElement>('*')).some((child) => {
        const style = getComputedStyle(child);
        return /(auto|scroll)/.test(style.overflowY);
      }),
    };
  });
  expect(geometry.left, `${label} escaped the viewport left edge`).toBeGreaterThanOrEqual(geometry.viewportLeft - 1);
  expect(geometry.right, `${label} escaped the viewport right edge`).toBeLessThanOrEqual(geometry.viewportRight + 1);
  expect(geometry.top, `${label} escaped the viewport top edge`).toBeGreaterThanOrEqual(geometry.viewportTop - 1);
  expect(geometry.bottom, `${label} escaped the viewport bottom edge`).toBeLessThanOrEqual(geometry.viewportBottom + 1);
  expect(geometry.hasScrollOwner, `${label} must keep long option lists scrollable`).toBe(true);
}

async function expectSwipeableAdminTable(page: Page, tableSelector: string, label: string) {
  const table = page.locator(tableSelector).first();
  await expect(table).toBeVisible();
  const metrics = await table.evaluate(async (element) => {
    let wrapper = element.parentElement;
    while (wrapper) {
      const style = getComputedStyle(wrapper);
      if (/(auto|scroll)/.test(style.overflowX) && wrapper.scrollWidth > wrapper.clientWidth) break;
      wrapper = wrapper.parentElement;
    }
    if (!wrapper) return null;
    wrapper.scrollLeft = 0;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const wrapperStyle = getComputedStyle(wrapper);
    const root = document.documentElement;
    const firstHeader = element.querySelector<HTMLElement>('thead th:first-child');
    const lastHeader = element.querySelector<HTMLElement>('thead th:last-child');
    const firstCell = element.querySelector<HTMLElement>('tbody tr:first-child > :first-child');
    const lastCell = element.querySelector<HTMLElement>('tbody tr:first-child > :last-child');
    const before = [firstHeader, lastHeader, firstCell, lastCell].map((cell) => cell?.getBoundingClientRect().left ?? null);
    const frozenCells = Array.from(element.querySelectorAll<HTMLElement>('th, td')).filter((cell) => {
      const style = getComputedStyle(cell);
      return style.position === 'sticky' && (style.left !== 'auto' || style.right !== 'auto');
    }).length;
    const stickyTableParts = Array.from(element.querySelectorAll<HTMLElement>('thead, th, td')).filter(
      (part) => getComputedStyle(part).position === 'sticky',
    ).length;
    const targetScroll = Math.min(140, wrapper.scrollWidth - wrapper.clientWidth);
    wrapper.scrollTo({ left: targetScroll, behavior: 'instant' });
    if (wrapper.scrollLeft === 0) wrapper.scrollTo({ left: -targetScroll, behavior: 'instant' });
    const appliedScrollLeft = wrapper.scrollLeft;
    wrapper.dispatchEvent(new Event('scroll', { bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const after = [firstHeader, lastHeader, firstCell, lastCell].map((cell) => cell?.getBoundingClientRect().left ?? null);
    const hint = wrapper.previousElementSibling as HTMLElement | null;
    return {
      overflowX: wrapperStyle.overflowX,
      overflowY: wrapperStyle.overflowY,
      wrapperWidth: wrapper.clientWidth,
      wrapperScrollWidth: wrapper.scrollWidth,
      direction: wrapperStyle.direction,
      tableWidth: element.getBoundingClientRect().width,
      pageWidth: root.clientWidth,
      pageScrollWidth: root.scrollWidth,
      scrollLeft: wrapper.scrollLeft,
      appliedScrollLeft,
      frozenCells,
      stickyTableParts,
      hintOpacity: hint?.classList.contains('swipeable-scroll-hint') ? hint.style.opacity : null,
      movement: before.map((left, index) => left === null || after[index] === null ? null : after[index]! - left),
    };
  });
  expect(metrics, `${label} must have a dedicated horizontal scroll viewport`).not.toBeNull();
  expect(metrics!.overflowX, `${label} viewport must own horizontal scrolling`).toMatch(/auto|scroll/);
  expect(metrics!.tableWidth, `${label} must retain readable desktop-like column widths`).toBeGreaterThan(metrics!.wrapperWidth);
  expect(metrics!.pageScrollWidth, `${label} must not make the page scroll horizontally`).toBeLessThanOrEqual(metrics!.pageWidth);
  expect(Math.abs(metrics!.appliedScrollLeft), `${label} must accept horizontal scrolling: ${JSON.stringify(metrics)}`).toBeGreaterThan(0);
  expect(metrics!.frozenCells, `${label} must not contain horizontally frozen columns`).toBe(0);
  expect(metrics!.stickyTableParts, `${label} must not retain any sticky table section or cell on mobile`).toBe(0);
  expect(metrics!.hintOpacity, `${label} scroll hint must disappear after scrolling`).toBe('0');
  for (const movement of metrics!.movement) {
    if (movement === null) continue;
    expect(movement, `${label} headers and cells must move with the whole table: ${JSON.stringify(metrics)}`).toBeCloseTo(-metrics!.scrollLeft, 0);
  }
}

async function expectFixedScrollableDrawer(page: Page, dialogTestId: string) {
  const dialog = page.getByTestId(dialogTestId);
  await expect(dialog).toBeVisible();

  const geometry = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflowY: style.overflowY,
      contentScrolls: Array.from(element.querySelectorAll<HTMLElement>('*')).some((child) => {
        const childStyle = getComputedStyle(child);
        return /(auto|scroll)/.test(childStyle.overflowY) && child.scrollHeight > child.clientHeight;
      }),
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.contentScrolls || /(auto|scroll|hidden)/.test(geometry.overflowY), 'drawer must contain its scrolling').toBe(true);
}

async function expectSharedFormLabelGaps(page: Page, rootSelector: string, context: string) {
  const gaps = await page.locator(rootSelector).evaluate((root) => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const sharedLabels = Array.from(root.querySelectorAll<HTMLElement>(
      '.field-label, .field-label-redesign, .pricing-preview-label, [data-slot="field-label"]',
    ));
    return sharedLabels.flatMap((label) => {
      if (!isVisible(label) || label.closest('.catalog-editor-toggle, .catalog-editor-toggles > label')) return [];
      const control = label.nextElementSibling;
      if (!control || !isVisible(control) || control.matches('input[type="checkbox"], input[type="radio"]')) return [];
      const labelBox = label.getBoundingClientRect();
      const controlBox = control.getBoundingClientRect();
      return [{
        text: label.textContent?.trim() || label.className,
        gap: controlBox.top - labelBox.bottom,
        marginBottom: getComputedStyle(label).marginBottom,
        labelDisplay: getComputedStyle(label).display,
        controlDisplay: getComputedStyle(control).display,
      }];
    });
  });

  expect(gaps.length, `${context} should expose shared label/control pairs`).toBeGreaterThan(0);
  for (const item of gaps) {
    expect(item.gap, `${context}: "${item.text}" label gap (${JSON.stringify(item)})`).toBeGreaterThanOrEqual(7.5);
  }
}

async function expectSharedAdminFormStructure(
  page: Page,
  rootSelector: string,
  context: string,
  mobile: boolean,
) {
  const structure = await page.locator(rootSelector).evaluate((root) => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const grids = Array.from(root.querySelectorAll<HTMLElement>('.admin-form-grid'))
      .filter(isVisible)
      .map((grid) => {
        const style = getComputedStyle(grid);
        const children = Array.from(grid.children).filter(isVisible);
        return {
          columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
          rowGap: parseFloat(style.rowGap),
          columnGap: parseFloat(style.columnGap),
          childCount: children.length,
        };
      });

    const cards = Array.from(root.querySelectorAll<HTMLElement>('.admin-form-card'))
      .filter(isVisible)
      .map((card) => {
        const style = getComputedStyle(card);
        return {
          paddingLeft: parseFloat(style.paddingLeft),
          paddingRight: parseFloat(style.paddingRight),
        };
      });

    const escapedControls = Array.from(root.querySelectorAll<HTMLElement>(
      '.admin-form input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]), .admin-form select, .admin-form textarea, .admin-form [role="combobox"]',
    )).filter(isVisible).flatMap((control) => {
      const card = control.closest<HTMLElement>('.admin-form-card');
      if (!card) return [];
      const controlBox = control.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      return controlBox.left < cardBox.left - 1 || controlBox.right > cardBox.right + 1
        ? [{ control: control.getAttribute('data-testid') || control.id || control.tagName, controlLeft: controlBox.left, controlRight: controlBox.right, cardLeft: cardBox.left, cardRight: cardBox.right }]
        : [];
    });

    return { grids, cards, escapedControls };
  });

  expect(structure.grids.length, `${context} should expose shared form grids`).toBeGreaterThan(0);
  for (const grid of structure.grids) {
    expect(grid.rowGap, `${context} grid row gap`).toBeGreaterThanOrEqual(15.5);
    expect(grid.columnGap, `${context} grid column gap`).toBeGreaterThanOrEqual(15.5);
    if (grid.childCount > 1) {
      expect(grid.columns, `${context} responsive grid columns`).toBe(mobile ? 1 : 2);
    }
  }
  for (const card of structure.cards) {
    const minimumPadding = mobile ? 17.5 : 23.5;
    expect(card.paddingLeft, `${context} card left padding`).toBeGreaterThanOrEqual(minimumPadding);
    expect(card.paddingRight, `${context} card right padding`).toBeGreaterThanOrEqual(minimumPadding);
  }
  expect(structure.escapedControls, `${context} controls escaped their form cards`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockLayoutApis(page);
});

test('public Swap and Convert widgets render from current API contracts', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((selectedTheme) => localStorage.setItem('qx-theme', selectedTheme), theme);
    await page.reload();
    await expect(page.getByTestId('button-mode-select-manual')).toBeVisible();
    await expect(page.getByTestId('button-mode-select-instant')).toBeVisible();
    await expect(page.getByTestId('landing-background-pattern')).toHaveCount(0);
    await expectNoDocumentOverflow(page, `${theme} public widget`);
  }

  expect(consoleErrors, `public widget logged browser errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('public asset selectors stay viewport-contained at every phone width', async ({ page }) => {
  test.setTimeout(120_000);
  for (const viewport of viewports.filter(({ width }) => width < 640)) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await page.getByTestId('button-mode-select-manual').click();
    await page.getByTestId('select-from-asset').click();
    await expectViewportContainedSelector(page, '.swap-contained-selector', `${viewport.name} Swap selector`);
    await expectTouchTarget(page.getByRole('button', { name: 'Close', exact: true }), `${viewport.name} Swap selector close`);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTestId('button-mode-select-instant').click();
    await page.getByTestId('convert-select-from-asset').click();
    await expectViewportContainedSelector(page, '.convert-contained-selector', `${viewport.name} Convert selector`);
    const closeConvertSelector = page.getByRole('button', { name: 'Close Send currency', exact: true });
    await expectTouchTarget(closeConvertSelector, `${viewport.name} Convert selector close`);
    await closeConvertSelector.click();
  }
});

test('Swap and Convert share one selector contract on phone, tablet, and desktop', async ({ page }) => {
  test.setTimeout(90_000);
  const selectorViewports = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 900 },
  ] as const;

  for (const viewport of selectorViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await page.getByTestId('button-mode-select-manual').click();
    await page.getByTestId('select-from-asset').click();
    const swapSelector = page.locator('.swap-contained-selector.convert-contained-selector[data-state="open"]');
    await expect(swapSelector, `${viewport.name} Swap selector`).toBeVisible();
    await expect.poll(() => swapSelector.evaluate(element =>
      element.getAnimations().every(animation => animation.playState === 'finished'),
    )).toBe(true);
    await expect(swapSelector.getByRole('heading', { name: 'You Send' })).toBeVisible();
    await expect(swapSelector.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(swapSelector.getByRole('button', { name: 'Crypto', exact: true })).toBeVisible();
    await expect(swapSelector.getByRole('button', { name: 'Fiat', exact: true })).toHaveCount(0);
    await expect(swapSelector.getByRole('button', { name: 'Payment Methods', exact: true })).toHaveCount(0);
    await expect(swapSelector.locator('.qx-overlay-header')).toBeVisible();
    expect(await swapSelector.locator('.qx-overlay-list .qx-asset-option').count()).toBeGreaterThan(0);
    await expect(swapSelector.getByRole('textbox')).not.toBeFocused();
    const swapContainment = await swapSelector.evaluate((selector) => {
      const widget = selector.closest<HTMLElement>('.exchange-card')!;
      const selectorRect = selector.getBoundingClientRect();
      const widgetRect = widget.getBoundingClientRect();
      const selectorStyle = getComputedStyle(selector);
      const listStyle = getComputedStyle(selector.querySelector<HTMLElement>('.qx-overlay-list')!);
      return {
        insideWidget:
          selectorRect.left >= widgetRect.left - 1
          && selectorRect.right <= widgetRect.right + 1
          && selectorRect.top >= widgetRect.top - 1
          && selectorRect.bottom <= widgetRect.bottom + 1,
        selectorRect: {
          left: selectorRect.left,
          right: selectorRect.right,
          top: selectorRect.top,
          bottom: selectorRect.bottom,
        },
        widgetRect: {
          left: widgetRect.left,
          right: widgetRect.right,
          top: widgetRect.top,
          bottom: widgetRect.bottom,
        },
        listOverflowY: listStyle.overflowY,
        surfaceStyle: {
          backgroundColor: selectorStyle.backgroundColor,
          backgroundImage: selectorStyle.backgroundImage,
          border: selectorStyle.border,
          borderRadius: selectorStyle.borderRadius,
          boxShadow: selectorStyle.boxShadow,
          padding: selectorStyle.padding,
        },
      };
    });
    expect(swapContainment.insideWidget, `${viewport.name} Swap containment: ${JSON.stringify(swapContainment)}`).toBe(true);
    expect(swapContainment.listOverflowY).toBe('auto');
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTestId('button-mode-select-instant').click();
    await page.getByTestId('convert-select-from-asset').click();
    const convertSelector = page.locator('.swap-contained-selector.convert-contained-selector[data-state="open"]');
    await expect(convertSelector, `${viewport.name} Convert selector`).toBeVisible();
    await expect.poll(() => convertSelector.evaluate(element =>
      element.getAnimations().every(animation => animation.playState === 'finished'),
    )).toBe(true);
    await expect(convertSelector.getByRole('heading', { name: 'You Send' })).toBeVisible();
    await expect(convertSelector.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(convertSelector.getByRole('button', { name: 'Crypto', exact: true })).toBeVisible();
    await expect(convertSelector.getByRole('button', { name: 'Fiat', exact: true })).toHaveCount(0);
    await expect(convertSelector.getByRole('button', { name: 'Payment Methods', exact: true })).toHaveCount(0);
    await expect(convertSelector.locator('.qx-overlay-header')).toBeVisible();
    await expect(convertSelector.locator('.qx-overlay-list .qx-asset-option')).toHaveCount(1);
    await expect(convertSelector.getByRole('textbox')).not.toBeFocused();
    const convertContainment = await convertSelector.evaluate((selector) => {
      const widget = selector.closest<HTMLElement>('.exchange-card')!;
      const selectorRect = selector.getBoundingClientRect();
      const widgetRect = widget.getBoundingClientRect();
      const selectorStyle = getComputedStyle(selector);
      const listStyle = getComputedStyle(selector.querySelector<HTMLElement>('.qx-overlay-list')!);
      return {
        insideWidget:
          selectorRect.left >= widgetRect.left - 1
          && selectorRect.right <= widgetRect.right + 1
          && selectorRect.top >= widgetRect.top - 1
          && selectorRect.bottom <= widgetRect.bottom + 1,
        selectorRect: {
          left: selectorRect.left,
          right: selectorRect.right,
          top: selectorRect.top,
          bottom: selectorRect.bottom,
        },
        widgetRect: {
          left: widgetRect.left,
          right: widgetRect.right,
          top: widgetRect.top,
          bottom: widgetRect.bottom,
        },
        listOverflowY: listStyle.overflowY,
        surfaceStyle: {
          backgroundColor: selectorStyle.backgroundColor,
          backgroundImage: selectorStyle.backgroundImage,
          border: selectorStyle.border,
          borderRadius: selectorStyle.borderRadius,
          boxShadow: selectorStyle.boxShadow,
          padding: selectorStyle.padding,
        },
      };
    });
    expect(convertContainment.insideWidget, `${viewport.name} Convert containment: ${JSON.stringify(convertContainment)}`).toBe(true);
    expect(convertContainment.listOverflowY).toBe('auto');
    expect(swapContainment.surfaceStyle.borderRadius).toBe(convertContainment.surfaceStyle.borderRadius);
    expect(swapContainment.surfaceStyle.padding).toBe(convertContainment.surfaceStyle.padding);
    await page.getByRole('button', { name: 'Close Send currency', exact: true }).click();
  }
});

test('admin data views remain usable on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const tables = [
    { path: '/admin/pricing', selector: '[data-testid="table-pricing-rules"]', label: 'Pricing rules' },
    { path: '/admin/currencies', selector: '.catalog-table', label: 'Catalog' },
    { path: '/admin', selector: '[data-testid="table-orders"]', label: 'Dashboard queue' },
    { path: '/admin', selector: '[data-testid="table-recent-orders"]', label: 'Recent orders' },
    { path: '/admin/affiliates', selector: '.affiliate-table', label: 'Affiliates' },
    { path: '/admin/payouts', selector: '.payout-queue-table', label: 'Payout queue' },
    { path: '/admin/revenue', selector: '[data-testid="table-revenue"]', label: 'Revenue' },
    { path: '/admin/customers', selector: '[data-testid="table-customers"]', label: 'Customers' },
  ] as const;

  for (const table of tables) {
    await page.goto(table.path);
    await expectSwipeableAdminTable(page, table.selector, table.label);
  }

  await page.goto('/admin/orders');
  await expectSwipeableAdminTable(page, '[data-testid="table-orders"]', 'Orders');

  for (const width of [320, 360, 375, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/admin/orders');
    await expectSwipeableAdminTable(page, '[data-testid="table-orders"]', `${width}px Orders`);
  }

  await page.goto('/admin/currencies');
  await expect(page.locator('.catalog-table thead')).toHaveCSS('display', 'table-header-group');
});

test('admin searches share one responsive visual and clear contract', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const searches = [
    { path: '/admin', testId: 'input-overview-queue-search' },
    { path: '/admin/orders', testId: 'input-filter-search' },
    { path: '/admin/customers', testId: 'input-customer-search' },
    { path: '/admin/currencies', testId: 'input-catalog-search' },
    { path: '/admin/pricing', testId: 'input-filter-pricing' },
    { path: '/admin/affiliates', testId: 'input-search-affiliates' },
  ] as const;
  for (const search of searches) {
    await page.goto(search.path);
    const input = page.getByTestId(search.testId);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('type', 'search');
    await expect(input.locator('xpath=..').locator('svg').first()).toBeVisible();
    await expect(input.locator('xpath=ancestor::*[contains(@class,\"mobile-table-scroll\") or contains(@class,\"table-wrap\")]')).toHaveCount(0);

    const idleMetrics = await input.evaluate((element) => {
      const inputElement = element as HTMLInputElement;
      const style = getComputedStyle(inputElement);
      const rect = inputElement.getBoundingClientRect();
      const icon = inputElement.parentElement?.querySelector('svg')?.getBoundingClientRect();
      return {
        height: rect.height,
        borderRadius: style.borderRadius,
        fontSize: style.fontSize,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        backgroundColor: style.backgroundColor,
        iconWidth: icon?.width,
        iconHeight: icon?.height,
        right: rect.right,
        viewportWidth: document.documentElement.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(idleMetrics.height, `${search.path} search height`).toBe(40);
    expect(idleMetrics.borderRadius, `${search.path} search radius`).toBe('12px');
    expect(idleMetrics.fontSize, `${search.path} search font size`).toBe('13px');
    expect(idleMetrics.paddingLeft, `${search.path} search left padding`).toBe('40px');
    expect(idleMetrics.paddingRight, `${search.path} search right padding`).toBe('36px');
    expect(idleMetrics.backgroundColor, `${search.path} search background`).toBe('rgb(255, 255, 255)');
    expect(idleMetrics.iconWidth, `${search.path} search icon width`).toBe(15);
    expect(idleMetrics.iconHeight, `${search.path} search icon height`).toBe(15);
    expect(idleMetrics.right).toBeLessThanOrEqual(idleMetrics.viewportWidth + 1);
    expect(idleMetrics.pageOverflow).toBeLessThanOrEqual(1);

    await input.focus();
    await expect(input).toBeFocused();
    await expect(input.locator('xpath=..')).toHaveAttribute('data-focused', 'true');
    await expect.poll(() => input.evaluate(element => getComputedStyle(element).borderColor))
      .toBe('rgb(8, 123, 255)');
    const focusedShadow = await input.evaluate((element) => getComputedStyle(element).boxShadow);
    expect(focusedShadow).not.toBe('none');

    await input.fill('  exact partial  ');
    const clear = page.getByTestId(`${search.testId}-clear`);
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(input).toHaveValue('');
    await expect(clear).toHaveCount(0);
  }
});

test('every route family stays contained in both themes across responsive widths', async ({ page }) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  for (const viewport of routeAuditViewports) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      // Theme is read while each route mounts. Set it once per viewport/theme,
      // rather than reloading every audited route.
      await page.goto('/');
      await page.evaluate((selectedTheme) => localStorage.setItem('qx-theme', selectedTheme), theme);
      for (const path of routeAuditPaths) {
        await page.goto(path);
        await expect(page.locator('body')).toBeVisible();
        await expectNoDocumentOverflow(page, `${theme} ${viewport.name} ${path}`);
      }
    }
  }
  expect(consoleErrors, `route audit logged browser errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});

test('admin workspace uses the full tablet laptop and desktop canvas without collisions', async ({ page }) => {
  test.setTimeout(240_000);
  const representativeRoutes = ['/admin', '/admin/orders', '/admin/pricing', '/admin/currencies', '/admin/affiliates'] as const;

  for (const viewport of adminWorkspaceViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/admin');
    await expect(page.locator('.admin-shell')).toBeVisible();
    await expect(page.locator('.admin-mobile-top')).toBeHidden();
    await expect(page.getByTestId('button-admin-profile')).toBeVisible();
    await expectNoDocumentOverflow(page, `${viewport.name} admin overview`);

    const beforeMenu = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      const shell = box('.admin-shell');
      const content = box('.admin-content');
      const header = box('.admin-header');
      const main = box('.admin-main');
      const menu = box('[data-testid="button-admin-mobile-menu"]');
      const brand = box('.admin-header-brand');
      const heading = box('.qx-header-content-group');
      const actions = box('.qx-header-controls');
      const firstMainChild = document.querySelector<HTMLElement>('.admin-main > *')?.getBoundingClientRect();
      return {
        shell: { left: shell.left, right: shell.right },
        content: { left: content.left, right: content.right, width: content.width },
        header: {
          left: header.left,
          right: header.right,
          bottom: header.bottom,
          position: getComputedStyle(document.querySelector('.admin-header')!).position,
          overflow: getComputedStyle(document.querySelector('.admin-header')!).overflow,
        },
        menu: { left: menu.left, right: menu.right },
        brand: { left: brand.left, right: brand.right, bottom: brand.bottom },
        heading: { left: heading.left, right: heading.right, top: heading.top, bottom: heading.bottom },
        actions: { right: actions.right, top: actions.top, bottom: actions.bottom },
        main: {
          left: main.left,
          right: main.right,
          top: main.top,
          width: main.width,
          contentLeft: firstMainChild?.left ?? main.left,
          contentRight: firstMainChild?.right ?? main.right,
        },
        viewportWidth: window.innerWidth,
      };
    });

    expect(beforeMenu.shell.left).toBeGreaterThanOrEqual(0);
    expect(beforeMenu.shell.right).toBeLessThanOrEqual(beforeMenu.viewportWidth);
    await expect(page.locator('.admin-sidebar')).toBeVisible();
    expect(beforeMenu.content.left).toBeGreaterThan(beforeMenu.shell.left);
    expect(beforeMenu.content.right).toBeLessThanOrEqual(beforeMenu.shell.right);
    expect(beforeMenu.header.position).toBe('static');
    expect(beforeMenu.header.overflow).toBe('visible');
    expect(beforeMenu.header.left).toBeGreaterThanOrEqual(beforeMenu.content.left);
    expect(beforeMenu.header.right).toBeLessThanOrEqual(beforeMenu.content.right);
    expect(beforeMenu.actions.right).toBeLessThanOrEqual(beforeMenu.content.right);
    expect(beforeMenu.actions.top).toBeGreaterThanOrEqual(0);
    expect(beforeMenu.actions.bottom).toBeLessThanOrEqual(beforeMenu.header.bottom + 1);
    expect(beforeMenu.main.top).toBeGreaterThanOrEqual(beforeMenu.header.bottom);
    expect(beforeMenu.main.left).toBeGreaterThanOrEqual(beforeMenu.content.left);
    expect(beforeMenu.main.right).toBeLessThanOrEqual(beforeMenu.content.right);
    expect(beforeMenu.main.width).toBeLessThanOrEqual(beforeMenu.content.width);

    await page.getByTestId('button-admin-profile').click();
    const profileMenu = page.locator('#admin-mobile-profile-menu');
    await expect(profileMenu).toBeVisible();
    const menuGeometry = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('#admin-mobile-profile-menu')!;
      const trigger = document.querySelector<HTMLElement>('[data-testid="button-admin-profile"]')!;
      const header = document.querySelector<HTMLElement>('.admin-header')!;
      const menuBox = menu.getBoundingClientRect();
      const triggerBox = trigger.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const style = getComputedStyle(menu);
      return {
        left: menuBox.left,
        right: menuBox.right,
        top: menuBox.top,
        bottom: menuBox.bottom,
        anchorBottom: Math.max(triggerBox.bottom, headerBox.bottom),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        position: style.position,
        zIndex: Number(style.zIndex),
        backgroundImage: style.backgroundImage,
        portaledToBody: menu.parentElement === document.body,
      };
    });
    expect(menuGeometry.position).toBe('fixed');
    expect(menuGeometry.zIndex).toBeGreaterThanOrEqual(1100);
    expect(menuGeometry.portaledToBody).toBe(true);
    expect(menuGeometry.left).toBeGreaterThanOrEqual(11);
    expect(menuGeometry.right).toBeLessThanOrEqual(menuGeometry.viewportWidth - 11);
    expect(menuGeometry.top).toBeGreaterThanOrEqual(menuGeometry.anchorBottom + 7);
    expect(menuGeometry.bottom).toBeLessThanOrEqual(menuGeometry.viewportHeight - 11);
    await page.mouse.click(4, viewport.height - 4);
    await expect(profileMenu).toHaveCount(0);

    const afterMenu = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.admin-header')!.getBoundingClientRect();
      const main = document.querySelector<HTMLElement>('.admin-main')!.getBoundingClientRect();
      return { headerBottom: header.bottom, mainTop: main.top, mainLeft: main.left, mainRight: main.right };
    });
    expect(afterMenu).toEqual({
      headerBottom: beforeMenu.header.bottom,
      mainTop: beforeMenu.main.top,
      mainLeft: beforeMenu.main.left,
      mainRight: beforeMenu.main.right,
    });

    for (const path of representativeRoutes.slice(1)) {
      await page.goto(path);
      await expect(page.locator('.admin-shell')).toBeVisible();
      await expectNoDocumentOverflow(page, `${viewport.name} ${path}`);
      const routeGeometry = await page.evaluate(() => {
        const header = document.querySelector<HTMLElement>('.admin-header')!.getBoundingClientRect();
        const main = document.querySelector<HTMLElement>('.admin-main')!.getBoundingClientRect();
        return {
          headerRight: header.right,
          mainLeft: main.left,
          mainRight: main.right,
          viewportWidth: window.innerWidth,
        };
      });
      expect(routeGeometry.headerRight).toBeLessThanOrEqual(routeGeometry.viewportWidth);
      expect(routeGeometry.mainLeft).toBeGreaterThanOrEqual(0);
      expect(routeGeometry.mainRight).toBeLessThanOrEqual(routeGeometry.viewportWidth);

      if (path === '/admin/affiliates' && viewport.width < 1200) {
        const affiliateHeaderGeometry = await page.evaluate(() => {
          const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
          const bounds = (selector: string) => element(selector).getBoundingClientRect();
          const content = bounds('.qx-header-content-group');
          const pageAction = bounds('.affiliate-page-actions');
          const header = bounds('.admin-header');
          const main = bounds('.admin-main');
          return {
            contentTop: content.top,
            actionTop: pageAction.top,
            actionBottom: pageAction.bottom,
            actionLeft: pageAction.left,
            actionRight: pageAction.right,
            headerBottom: header.bottom,
            mainLeft: main.left,
            mainRight: main.right,
          };
        });
        expect(affiliateHeaderGeometry.actionTop).toBeGreaterThanOrEqual(affiliateHeaderGeometry.headerBottom + 4);
        expect(affiliateHeaderGeometry.actionLeft).toBeGreaterThanOrEqual(affiliateHeaderGeometry.mainLeft);
        expect(affiliateHeaderGeometry.actionRight).toBeLessThanOrEqual(affiliateHeaderGeometry.mainRight);
        expect(affiliateHeaderGeometry.actionBottom).toBeGreaterThan(affiliateHeaderGeometry.actionTop);
      }
    }

    await page.goto('/admin/orders');
    const orderTableContract = await page.getByTestId('table-orders').evaluate((table) => {
      const wrapper = table.closest<HTMLElement>('.table-wrap, .modern-orders-table-wrapper, .overflow-x-auto')!;
      return {
        wrapperOverflowX: getComputedStyle(wrapper).overflowX,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        stickyParts: Array.from(table.querySelectorAll<HTMLElement>('thead, th, td'))
          .filter((part) => getComputedStyle(part).position === 'sticky').length,
      };
    });
    expect(orderTableContract.wrapperOverflowX).toMatch(/auto|scroll/);
    expect(orderTableContract.pageOverflow).toBeLessThanOrEqual(0);
    expect(orderTableContract.stickyParts).toBe(0);
  }
});

test('every top-level Admin route uses the shared logo section and title header', async ({ page }) => {
  test.setTimeout(120_000);
  const headers = [
    ['/admin', 'OPERATIONS / COMMAND CENTER', 'Overview'],
    ['/admin/orders', 'OPERATIONS / ORDERS', 'Orders'],
    ['/admin/revenue', 'FINANCE / REVENUE', 'Revenue'],
    ['/admin/customers', 'CUSTOMER MANAGEMENT', 'Customers'],
    ['/admin/affiliates', 'AFFILIATE PROGRAM', 'Affiliates'],
    ['/admin/payouts', 'FINANCE / PAYOUTS', 'Payouts'],
    ['/admin/affiliate-settings', 'SYSTEM / CONFIGURATION', 'Program Settings'],
    ['/admin/providers', 'SYSTEM / PROVIDERS', 'Providers'],
    ['/admin/landing-background', 'DESIGN / LANDING BACKGROUND', 'Background Studio'],
    ['/admin/integrations', 'INTEGRATIONS / API', 'API Integrations'],
    ['/admin/currencies', 'ASSETS / PAYMENT METHODS', 'Currencies & Payment Methods'],
    ['/admin/pricing', 'PRICING / ENGINE', 'Manual Pricing'],
  ] as const;

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [path, section, title] of headers) {
    await page.goto(path);
    await expect(page.getByTestId('admin-header-section-label')).toHaveText(section);
    await expect(page.getByTestId('admin-header-title')).toHaveText(title);
    await expect(page.getByTestId('button-admin-mobile-menu')).toBeHidden();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/currencies');
  await expect(page.getByTestId('admin-header-section-label')).toHaveCount(1);
  await expect(page.getByTestId('admin-header-title')).toHaveCount(1);
  await expect(page.getByTestId('button-admin-mobile-menu')).toBeVisible();

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/orders');
    const headerOrder = await page.locator('.admin-header').evaluate((header) => {
      const menuElement = header.querySelector<HTMLElement>('[data-testid="button-admin-mobile-menu"]')!;
      const brandElement = header.querySelector<HTMLElement>('[data-testid="admin-header-brand"]')!;
      const menu = menuElement.getBoundingClientRect();
      const brand = brandElement.getBoundingClientRect();
      return {
        menuLeft: menu.left,
        menuRight: menu.right,
        brandLeft: brand.left,
        menuBeforeBrand: Boolean(
          menuElement.compareDocumentPosition(brandElement)
          & Node.DOCUMENT_POSITION_FOLLOWING
        ),
      };
    });
    await expect(page.locator('header [data-testid="button-export"]')).toHaveCount(0);
    const orderActions = page.locator('.orders-archive-actions');
    await expect(orderActions.getByTestId('tab-orders-active')).toBeVisible();
    await expect(orderActions.getByTestId('tab-orders-archived')).toBeVisible();
    await expect(orderActions.getByTestId('button-export')).toBeVisible();
    const actionGeometry = await orderActions.evaluate((group) => {
      const active = group.querySelector<HTMLElement>('[data-testid="tab-orders-active"]')!.getBoundingClientRect();
      const archived = group.querySelector<HTMLElement>('[data-testid="tab-orders-archived"]')!.getBoundingClientRect();
      const exportButton = group.querySelector<HTMLElement>('[data-testid="button-export"]')!.getBoundingClientRect();
      return {
        activeHeight: active.height,
        archivedHeight: archived.height,
        exportHeight: exportButton.height,
        exportAfterArchived: exportButton.left >= archived.right,
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(actionGeometry.exportAfterArchived).toBe(true);
    expect(actionGeometry.exportHeight).toBeCloseTo(actionGeometry.activeHeight, 0);
    expect(actionGeometry.exportHeight).toBeCloseTo(actionGeometry.archivedHeight, 0);
    expect(actionGeometry.documentWidth).toBeLessThanOrEqual(actionGeometry.viewportWidth);
  }

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/revenue');
    await expect(page.locator('header [data-testid="button-export-revenue"]')).toHaveCount(0);
    await expect(page.locator('.revenue-filter-panel').getByTestId('button-export-revenue')).toBeVisible();
    await expectNoDocumentOverflow(page, `${width}px revenue export controls`);
  }

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/affiliate-settings');
    await expect(page.locator('header [data-testid="link-affiliate-documentation"]')).toHaveCount(0);
    const settingsActions = page.locator('.affiliate-settings-actions');
    await expect(settingsActions.getByTestId('link-affiliate-documentation')).toBeVisible();
    await expect(settingsActions.getByTestId('btn-reset-settings')).toBeVisible();
    await expect(settingsActions.getByTestId('btn-save-settings')).toBeVisible();
    const actionOrder = await settingsActions.evaluate((group) => {
      const documentation = group.querySelector<HTMLElement>('[data-testid="link-affiliate-documentation"]')!;
      const reset = group.querySelector<HTMLElement>('[data-testid="btn-reset-settings"]')!;
      const save = group.querySelector<HTMLElement>('[data-testid="btn-save-settings"]')!;
      return {
        documentationBeforeReset: Boolean(documentation.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING),
        resetBeforeSave: Boolean(reset.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
    expect(actionOrder.documentationBeforeReset).toBe(true);
    expect(actionOrder.resetBeforeSave).toBe(true);
    await expectNoDocumentOverflow(page, `${width}px Affiliate documentation actions`);
  }

  const relocatedPageActions = [
    ['/admin/affiliates', '.affiliate-page-actions', ['link-view-affiliate-payouts', 'button-add-affiliate']],
    ['/admin/integrations', '.api-integrations-actions', ['button-refresh-integrations', 'button-view-api-logs', 'button-add-integration']],
    ['/admin/customers', '.customers-page-actions', ['input-customer-search']],
    ['/admin/providers', '.providers-panel', ['button-test-provider']],
    ['/admin/currencies', '.catalog-page-actions', ['button-add-currency']],
  ] as const;

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, containerSelector, testIds] of relocatedPageActions) {
      await page.goto(path);
      await expect(page.locator('header .admin-header-page-action')).toHaveCount(0);
      const container = page.locator(containerSelector);
      for (const testId of testIds) {
        await expect(container.getByTestId(testId)).toBeVisible();
      }
      await expectNoDocumentOverflow(page, `${width}px ${path} page actions`);
    }
  }
});

test('track order lookup keeps its premium structure across supported phone widths and themes', async ({ page }) => {
  test.setTimeout(180_000);
  const phoneViewports = viewports.filter(({ width }) => width <= 430);

  for (const viewport of phoneViewports) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      await page.goto('/');
      await page.evaluate((selectedTheme) => localStorage.setItem('qx-theme', selectedTheme), theme);
      await page.goto('/status');

      await expect(page.getByText('ORDER LOOKUP', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Know where your money is.' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Track your order' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Where can I find my Order ID?' })).toBeVisible();

      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const bounds = document.querySelector(selector)!.getBoundingClientRect();
          return { x: bounds.x, width: bounds.width, height: bounds.height, right: bounds.right };
        };
        const main = document.querySelector('.track-order-page')!;
        return {
          lookup: rect('.track-order-lookup-card'),
          input: rect('[data-testid="input-order-search"]'),
          button: rect('[data-testid="button-search-order"]'),
          viewportWidth: window.innerWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          backgroundImage: getComputedStyle(main).backgroundImage,
          titleFontSize: Number.parseFloat(getComputedStyle(document.querySelector('.status-hero h1')!).fontSize),
        };
      });

      expect(geometry.lookup.x).toBeGreaterThanOrEqual(15);
      expect(geometry.lookup.right).toBeLessThanOrEqual(geometry.viewportWidth - 15);
      expect(geometry.input.height).toBeGreaterThanOrEqual(52);
      expect(geometry.button.height).toBeGreaterThanOrEqual(52);
      expect(Math.abs(geometry.input.width - geometry.button.width)).toBeLessThanOrEqual(2);
      expect(geometry.titleFontSize).toBeGreaterThanOrEqual(32);
      expect(geometry.backgroundImage).not.toBe('none');
      expect(geometry.overflow).toBeLessThanOrEqual(0);
    }
  }
});

test('phone site and Admin navigation controls provide 44px touch targets', async ({ page }) => {
  test.setTimeout(120_000);
  for (const viewport of viewports.filter(({ width }) => width < 640)) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const publicMenu = page.getByTestId('button-mobile-menu');
    await expectTouchTarget(publicMenu, `${viewport.name} public mobile menu`);
    await publicMenu.click();
    const publicNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
    await expect(publicNavigation).toBeVisible();
    await expectNoDocumentOverflow(page, `${viewport.name} open public mobile navigation`);
    for (const link of await publicNavigation.getByRole('link').all()) {
      await expectTouchTarget(link, `${viewport.name} public navigation link "${await link.textContent()}"`);
    }
    expect(await publicNavigation.getByRole('link').count()).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(publicNavigation).toBeHidden();
  }

  for (const viewport of viewports.filter(({ width }) => width <= 430)) {
    await page.setViewportSize(viewport);
    await page.goto('/admin');
    const header = page.locator('.admin-header');
    await expect(header).toBeVisible();
    const geometry = await header.evaluate((element) => {
      const headerRect = element.getBoundingClientRect();
      const controlsRect = element.querySelector('.qx-header-controls')!.getBoundingClientRect();
      return {
        headerHeight: headerRect.height,
        headerLeft: headerRect.left,
        headerRight: headerRect.right,
        controlsLeft: controlsRect.left,
        controlsRight: controlsRect.right,
        viewportWidth: window.innerWidth,
      };
    });
    expect(geometry.headerHeight, `${viewport.name} operator header must stay compact`).toBeGreaterThanOrEqual(64);
    expect(geometry.headerHeight, `${viewport.name} operator header must stay compact`).toBeLessThanOrEqual(84);
    expect(geometry.headerLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.headerRight).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.controlsLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.controlsRight).toBeLessThanOrEqual(geometry.viewportWidth);
    await expectTouchTarget(page.getByTestId('link-admin-mobile-notifications'), `${viewport.name} operator notifications`);
    await expectTouchTarget(page.getByTestId('button-admin-mobile-profile'), `${viewport.name} operator profile`);
    await expectTouchTarget(page.getByTestId('button-admin-mobile-menu'), `${viewport.name} operator menu`);
    await expectTouchTarget(page.getByTestId('button-admin-mobile-theme'), `${viewport.name} operator theme`);
    await expect(page.locator('.qx-header-controls')).toBeVisible();
    await expectNoDocumentOverflow(page, `${viewport.name} compact operator header`);
    const layoutBeforeMenu = await page.evaluate(() => {
      const headerBox = document.querySelector('.admin-header')!.getBoundingClientRect();
      const mainBox = document.querySelector('.admin-main')!.getBoundingClientRect();
      return {
        headerHeight: headerBox.height,
        mainTop: mainBox.top,
        mainLeft: mainBox.left,
        mainRight: mainBox.right,
      };
    });
    await page.getByTestId('button-admin-mobile-profile').click();
    const profileMenu = page.locator('#admin-mobile-profile-menu');
    await expect(profileMenu).toBeVisible();
    await expect(profileMenu.getByTestId('link-admin-mobile-account')).toBeVisible();
    await expect(profileMenu.getByTestId('button-mobile-theme-light')).toBeVisible();
    await expect(profileMenu.getByTestId('button-mobile-theme-dark')).toBeVisible();
    await expect(profileMenu.getByTestId('button-admin-mobile-signout')).toBeVisible();

    const menuContract = await page.evaluate(({ narrow }) => {
      const header = document.querySelector<HTMLElement>('.admin-header')!;
      const heading = document.querySelector<HTMLElement>('.qx-header-content-group')!;
      const trigger = document.querySelector<HTMLElement>('[data-testid="button-admin-mobile-profile"]')!;
      const menu = document.querySelector<HTMLElement>('#admin-mobile-profile-menu')!;
      const summary = menu.querySelector<HTMLElement>('.admin-mobile-profile-summary')!;
      const account = menu.querySelector<HTMLElement>('[data-testid="link-admin-mobile-account"]')!;
      const theme = menu.querySelector<HTMLElement>('.admin-mobile-profile-theme')!;
      const signout = menu.querySelector<HTMLElement>('[data-testid="button-admin-mobile-signout"]')!;
      const headerBox = header.getBoundingClientRect();
      const headingBox = heading.getBoundingClientRect();
      const triggerBox = trigger.getBoundingClientRect();
      const menuBox = menu.getBoundingClientRect();
      const style = getComputedStyle(menu);
      const itemBoxes = [summary, account, theme, signout].map(item => item.getBoundingClientRect());

      return {
        position: style.position,
        zIndex: Number(style.zIndex),
        backgroundImage: style.backgroundImage,
        opacity: style.opacity,
        menuLeft: menuBox.left,
        menuRight: menuBox.right,
        menuTop: menuBox.top,
        menuBottom: menuBox.bottom,
        menuWidth: menuBox.width,
        headerBottom: headerBox.bottom,
        headingBottom: headingBox.bottom,
        triggerRight: triggerBox.right,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        hasSafeMargins: menuBox.left >= 11 && menuBox.right <= window.innerWidth - 11,
        rightAlignedOnNarrowPhone: !narrow || Math.abs(menuBox.right - (window.innerWidth - 12)) <= 1,
        itemsFit: [summary, account, theme, signout].every(item =>
          item.scrollWidth <= item.clientWidth
        ),
        itemsStackCleanly: itemBoxes.every((box, index) =>
          index === 0 || box.top >= itemBoxes[index - 1].bottom
        ),
      };
    }, { narrow: viewport.width <= 360 });

    expect(menuContract.position).toBe('fixed');
    expect(menuContract.zIndex).toBeGreaterThanOrEqual(1100);
    expect(menuContract.opacity).toBe('1');
    expect(menuContract.menuTop).toBeGreaterThanOrEqual(menuContract.headerBottom + 7);
    expect(menuContract.menuBottom).toBeLessThanOrEqual(menuContract.viewportHeight - 11);
    expect(menuContract.menuWidth).toBeLessThanOrEqual(menuContract.viewportWidth - 24);
    expect(menuContract.hasSafeMargins).toBe(true);
    expect(menuContract.rightAlignedOnNarrowPhone).toBe(true);
    expect(menuContract.itemsFit).toBe(true);
    expect(menuContract.itemsStackCleanly).toBe(true);
    await expectNoDocumentOverflow(page, `${viewport.name} open operator profile menu`);
    await page.mouse.click(4, viewport.height - 4);
    await expect(profileMenu).toHaveCount(0);
    const layoutAfterMenu = await page.evaluate(() => {
      const headerBox = document.querySelector('.admin-header')!.getBoundingClientRect();
      const mainBox = document.querySelector('.admin-main')!.getBoundingClientRect();
      return {
        headerHeight: headerBox.height,
        mainTop: mainBox.top,
        mainLeft: mainBox.left,
        mainRight: mainBox.right,
      };
    });
    expect(layoutAfterMenu).toEqual(layoutBeforeMenu);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/admin/orders', '/admin/customers', '/admin/currencies', '/admin/pricing']) {
    await page.goto(route);
    await page.getByTestId('button-admin-mobile-profile').click();
    const routeProfileMenu = page.locator('#admin-mobile-profile-menu');
    await expect(routeProfileMenu).toBeVisible();
    const routeMenuContract = await page.evaluate(() => {
      const headerBox = document.querySelector('.admin-header')!.getBoundingClientRect();
      const menu = document.querySelector<HTMLElement>('#admin-mobile-profile-menu')!;
      const menuBox = menu.getBoundingClientRect();
      return {
        portaledToBody: menu.parentElement === document.body,
        belowHeader: menuBox.top >= headerBox.bottom + 7,
        insideViewport: menuBox.left >= 11
          && menuBox.right <= window.innerWidth - 11
          && menuBox.bottom <= window.innerHeight - 11,
      };
    });
    expect(routeMenuContract.portaledToBody, `${route} profile menu should use the shared portal`).toBe(true);
    expect(routeMenuContract.belowHeader, `${route} profile menu should clear the complete header`).toBe(true);
    expect(routeMenuContract.insideViewport, `${route} profile menu should stay inside the phone viewport`).toBe(true);
    await page.mouse.click(4, (page.viewportSize()?.height ?? 844) - 4);
    await expect(routeProfileMenu).toHaveCount(0);
  }

  await page.goto('/admin/affiliates');
  await expect(page.locator('header .admin-header-page-action')).toHaveCount(0);
  const viewPayouts = page.getByTestId('link-view-affiliate-payouts');
  const addAffiliate = page.getByTestId('button-add-affiliate');
  await expectTouchTarget(viewPayouts, 'phone View Payouts action');
  await expectTouchTarget(addAffiliate, 'phone Add Affiliate action');
  const pageActionsContract = await page.locator('.affiliate-page-actions').evaluate((actions) => {
    const actionsBox = actions.getBoundingClientRect();
    const headerBox = document.querySelector('.admin-header')!.getBoundingClientRect();
    return {
      left: actionsBox.left,
      right: actionsBox.right,
      top: actionsBox.top,
      headerBottom: headerBox.bottom,
      viewportWidth: window.innerWidth,
    };
  });
  expect(pageActionsContract.left).toBeGreaterThanOrEqual(8);
  expect(pageActionsContract.right).toBeLessThanOrEqual(pageActionsContract.viewportWidth - 8);
  expect(pageActionsContract.top).toBeGreaterThanOrEqual(pageActionsContract.headerBottom + 4);
  await expectNoDocumentOverflow(page, 'phone affiliate page actions');

  await page.goto('/admin');
  const profileButton = page.getByTestId('button-admin-mobile-profile');
  await profileButton.click();
  const profileMenu = page.locator('#admin-mobile-profile-menu');
  await expect(profileMenu).toBeVisible();
  await expect(profileMenu.getByTestId('link-admin-mobile-account')).toBeVisible();
  await expect(profileMenu.getByTestId('button-mobile-theme-light')).toBeVisible();
  await expect(profileMenu.getByTestId('button-mobile-theme-dark')).toBeVisible();
  await expect(profileMenu.getByTestId('button-admin-mobile-signout')).toBeVisible();
  await expectNoDocumentOverflow(page, 'open operator profile menu');
  await profileButton.click();
  await expect(profileMenu).toHaveCount(0);

  const operatorMenu = page.getByTestId('button-admin-mobile-menu');
  await expectTouchTarget(operatorMenu, 'operator mobile menu');
  await operatorMenu.click();
  const operatorNavigation = page.getByRole('navigation', { name: 'Operations' });
  const adminDrawerLayer = page.getByTestId('admin-menu-drawer-layer');
  const adminDrawer = page.getByTestId('admin-menu-drawer');
  await expect(operatorNavigation).toBeVisible();
  await expect(adminDrawerLayer).toHaveClass(/is-open/);
  await expect(adminDrawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(operatorNavigation.getByTestId('link-mobile-admin-affiliates')).toBeVisible();
  await expect(operatorNavigation.getByTestId('link-mobile-admin-payouts')).toBeVisible();
  await expect(operatorNavigation.getByTestId('link-mobile-admin-affiliate-settings')).toBeVisible();
  await expectNoDocumentOverflow(page, 'open operator mobile navigation');
  for (const link of await operatorNavigation.getByRole('link').all()) {
    await expectTouchTarget(link, `operator navigation link "${await link.textContent()}"`);
  }
  await adminDrawer.getByTestId('button-close-admin-menu').click();
  await expect(adminDrawerLayer).not.toHaveClass(/is-open/);
  await expect(adminDrawerLayer).toHaveCSS('visibility', 'hidden');
  await expect(operatorNavigation).toBeHidden();
  await expect(operatorMenu).toBeFocused();

  for (const viewport of [
    { width: 640, height: 800 },
    { width: 767, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin');
    const menuButton = page.getByTestId('button-admin-mobile-menu');
    await menuButton.click();
    const navigation = page.getByRole('navigation', { name: 'Operations' });
    const drawer = page.getByTestId('admin-menu-drawer');
    await expect(navigation).toBeVisible();
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const bounds = await drawer.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        bodyOverflow: getComputedStyle(document.body).overflow,
      };
    });
    expect(bounds.left).toBeCloseTo(0, 0);
    expect(bounds.right).toBeLessThanOrEqual(Math.min(420, bounds.viewportWidth * 0.86) + 1);
    expect(bounds.top).toBeCloseTo(0, 0);
    expect(bounds.bottom).toBeCloseTo(bounds.viewportHeight, 0);
    expect(bounds.horizontalOverflow).toBeLessThanOrEqual(0);
    expect(bounds.bodyOverflow).toBe('hidden');
    await expect(navigation.getByText('Currencies & Payment Methods', { exact: true })).toBeVisible();
    await expectTouchTarget(navigation.getByTestId('link-mobile-admin-currency and methods'), 'operator currencies navigation link');
    await navigation.getByTestId('link-mobile-admin-orders').click();
    await expect(page).toHaveURL(/\/admin\/orders$/);
  }
});

test('order and configuration drawers remain fixed, layered, scrollable, and closable', async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/orders');
    const visibleOrderRow = page.getByTestId(`row-order-${orderId}`);
    await expect(visibleOrderRow).toBeVisible();
    await visibleOrderRow.click();
    await expectFixedScrollableDrawer(page, 'order-details-drawer');
    await expectNoDocumentOverflow(page, `${viewport.name} order drawer`);
    await page.getByTestId('button-close-order-drawer').click();
    await expect(page.getByTestId('order-details-drawer')).toHaveCount(0);

    await page.goto('/admin/pricing');
    await page.getByTestId('button-add-pricing-rule').click();
    await expectFixedScrollableDrawer(page, 'pricing-rule-drawer');
    await expectNoDocumentOverflow(page, `${viewport.name} pricing drawer`);
    await page.getByTestId('button-close-pricing-drawer').click();
    await expect(page.getByRole('dialog', { name: 'Add pricing rule' })).toHaveCount(0);
  }
});

test('shared Admin forms keep safe spacing and containment at every breakpoint', async ({ page }) => {
  test.setTimeout(120_000);
  for (const viewport of [
    { name: 'phone', width: 390, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);

    await page.goto('/admin/currencies');
    await page.getByTestId('button-add-currency').click();
    await expectSharedFormLabelGaps(page, '.catalog-editor-drawer', `${viewport.name} currency drawer`);
    await expectSharedAdminFormStructure(page, '.catalog-editor-drawer', `${viewport.name} currency drawer`, viewport.width <= 680);
    await expectNoDocumentOverflow(page, `${viewport.name} currency drawer`);
    await page.getByTestId('button-close-drawer').click();

    await page.goto('/admin/pricing');
    await page.getByTestId('button-add-pricing-rule').click();
    await expectSharedFormLabelGaps(page, '[data-testid="pricing-rule-drawer"]', `${viewport.name} pricing drawer`);
    await expectSharedAdminFormStructure(page, '[data-testid="pricing-rule-drawer"]', `${viewport.name} pricing drawer`, viewport.width <= 680);
    await expectNoDocumentOverflow(page, `${viewport.name} pricing drawer`);
    await page.getByTestId('button-close-pricing-drawer').click();
  }
});

test('Swap and Convert primary forms fit without internal vertical scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  const exchangeViewports = [
    { name: 'narrow phone', width: 320, height: 900, expectedWidgetHeight: 660 },
    { name: 'phone', width: 390, height: 900, expectedWidgetHeight: 640 },
    { name: 'tablet', width: 768, height: 1000, expectedWidgetHeight: 670 },
    { name: 'tablet laptop', width: 1024, height: 1000, expectedWidgetHeight: 670 },
    { name: 'desktop', width: 1280, height: 1000, expectedWidgetHeight: 670 },
  ];

  for (const viewport of exchangeViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const modeViewport = page.locator('.exchange-mode-viewport').first();
    await modeViewport.scrollIntoViewIfNeeded();

    for (const mode of [
      {
        name: 'Swap',
        testId: 'button-mode-select-manual',
        amountTestId: 'input-amount',
        selectorTestId: 'select-from-asset',
      },
      {
        name: 'Convert',
        testId: 'button-mode-select-instant',
        amountTestId: 'convert-input-amount',
        selectorTestId: 'convert-select-from-asset',
      },
    ]) {
      await page.getByTestId(mode.testId).click();
      const activeLayer = modeViewport.locator('.exchange-mode-layer.active-layer:not(.exchange-menu-layer)');
      await expect(activeLayer).toBeVisible();
      await expect(activeLayer.getByTestId(mode.amountTestId)).toBeVisible();
      const fit = await activeLayer.evaluate((layer) => {
        const card = layer.querySelector<HTMLElement>('.exchange-card.redesigned-widget')!;
        const content = card.querySelector<HTMLElement>(
          '.convert-widget-form-viewport, .swap-step-panel, .swap-quote-step',
        ) ?? card;
        const required = [
          card.querySelector<HTMLElement>('.widget-tabs-pill'),
          card.querySelector<HTMLElement>('.reference-title-row'),
          ...card.querySelectorAll<HTMLElement>('.reference-amount-panel'),
          card.querySelector<HTMLElement>('.reference-rate-summary'),
          card.querySelector<HTMLElement>('.widget-primary-submit'),
          card.querySelector<HTMLElement>('.reference-trust-cues'),
        ].filter((element): element is HTMLElement => Boolean(element));
        const cardBox = card.getBoundingClientRect();
        const requiredBoxes = required.map(element => element.getBoundingClientRect());
        return {
          cardClientHeight: card.clientHeight,
          cardScrollHeight: card.scrollHeight,
          contentClientHeight: content.clientHeight,
          contentScrollHeight: content.scrollHeight,
          contentOverflowX: getComputedStyle(content).overflowX,
          contentOverflowY: getComputedStyle(content).overflowY,
          cardHeight: cardBox.height,
          requiredCount: requiredBoxes.length,
          requiredInsideCard: requiredBoxes.every(
            box => box.top >= cardBox.top - 1 && box.bottom <= cardBox.bottom + 1,
          ),
          trailingSpace: cardBox.bottom - Math.max(...requiredBoxes.map(box => box.bottom)),
        };
      });

      expect(
        fit.contentOverflowY,
        `${viewport.name} ${mode.name} should not create an internal vertical scrollport (${JSON.stringify(fit)})`,
      ).not.toMatch(/auto|scroll/);
      expect(fit.cardHeight, `${viewport.name} ${mode.name} shell height`)
        .toBeLessThanOrEqual(viewport.expectedWidgetHeight + 1);
      expect(fit.cardHeight, `${viewport.name} ${mode.name} shell must not collapse`)
        .toBeGreaterThanOrEqual(500);
      expect(
        fit.contentScrollHeight,
        `${viewport.name} ${mode.name} content should fit its available height`,
      ).toBeLessThanOrEqual(fit.contentClientHeight + 1);
      expect(
        fit.cardScrollHeight,
        `${viewport.name} ${mode.name} content should remain inside the card`,
      ).toBeLessThanOrEqual(fit.cardClientHeight + 1);
      expect(fit.requiredCount, `${viewport.name} ${mode.name} should render every primary section`).toBeGreaterThanOrEqual(5);
      expect(
        fit.requiredInsideCard,
        `${viewport.name} ${mode.name} primary sections should remain inside the card`,
      ).toBe(true);
      expect(
        fit.trailingSpace,
        `${viewport.name} ${mode.name} should not leave excessive empty space below its benefits`,
      ).toBeLessThanOrEqual(120);

      const activeCard = activeLayer.locator('.exchange-card.redesigned-widget');
      const cardBeforeMenu = await activeCard.boundingBox();
      const amountInput = activeLayer.getByTestId(mode.amountTestId);
      const assetSelector = activeLayer.getByTestId(mode.selectorTestId);
      if (viewport.width === 390) await amountInput.fill('1.25');
      const amountBeforeMenu = await amountInput.inputValue();
      const assetBeforeMenu = await assetSelector.textContent();

      await activeLayer.getByTestId('widget-menu-button').click();
      const widgetMenu = modeViewport.getByTestId('widget-navigation-screen');
      await expect(widgetMenu).toBeVisible();
      await expect(activeLayer).toHaveCSS('opacity', '0');
      await expect(activeLayer).toHaveAttribute('aria-hidden', 'true');
      await expect(activeLayer).toHaveAttribute('inert', '');
      await expect(widgetMenu.getByText('Menu', { exact: true })).toBeVisible();
      await expect(widgetMenu.getByRole('link', { name: 'Home' })).toBeVisible();
      await expect(widgetMenu.getByRole('link', { name: 'Track an order' })).toBeVisible();
      await expect(page.locator('.qx-overlay-backdrop.qx-standalone')).toHaveCount(0);

      const menuBox = await widgetMenu.boundingBox();
      const menuShell = modeViewport.getByTestId('exchange-menu-shell');
      const menuShellBox = await menuShell.boundingBox();
      expect(menuShellBox!.x).toBeCloseTo(cardBeforeMenu!.x, 0);
      expect(menuShellBox!.y).toBeCloseTo(cardBeforeMenu!.y, 0);
      expect(menuShellBox!.width).toBeCloseTo(cardBeforeMenu!.width, 0);
      expect(menuShellBox!.height).toBeCloseTo(cardBeforeMenu!.height, 0);
      expect(menuBox!.x).toBeGreaterThan(menuShellBox!.x);
      expect(menuBox!.y).toBeGreaterThan(menuShellBox!.y);
      expect(menuBox!.x + menuBox!.width).toBeLessThan(menuShellBox!.x + menuShellBox!.width);
      expect(menuBox!.height).toBeLessThan(cardBeforeMenu!.height);
      await widgetMenu.getByTestId('button-close-widget-menu').click();
      await expect(modeViewport.locator('.exchange-menu-layer')).toHaveCSS('opacity', '0');
      await expect(modeViewport.locator('.exchange-menu-layer')).toHaveAttribute('aria-hidden', 'true');
      await expect(modeViewport.locator('.exchange-menu-layer')).toHaveAttribute('inert', '');
      await expect(activeLayer).toBeVisible();
      await expect(amountInput).toHaveValue(amountBeforeMenu);
      expect(await assetSelector.textContent()).toBe(assetBeforeMenu);
    }
  }
});

test('phone Swap settlement selectors render at the requested equal height', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.getByTestId('button-mode-select-manual').click();

  const sourceBox = await page.getByTestId('select-from-asset').boundingBox();
  const targetBox = await page.getByTestId('select-to-asset').boundingBox();

  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  expect(sourceBox!.height).toBeCloseTo(75, 0);
  expect(targetBox!.height).toBeCloseTo(75, 0);
  expect(sourceBox!.height).toBeCloseTo(targetBox!.height, 0);
});

test('landing widget occupies the left column only at laptop widths', async ({ page }) => {
  for (const viewport of [
    { name: 'tablet', width: 768, height: 1000 },
    { name: 'laptop', width: 1280, height: 900 },
    { name: 'large desktop', width: 1536, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const heroLayout = page.locator('.exchange-main.public-hero-container');
    const widgetBox = await page.locator('.exchange-layout-wide').boundingBox();
    const headingBox = await heroLayout.locator('h1').boundingBox();
    const layoutDisplay = await heroLayout.evaluate(element => getComputedStyle(element).display);

    expect(widgetBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(layoutDisplay).toBe('grid');
    if (viewport.name !== 'large desktop') {
      expect(widgetBox!.x).toBeLessThan(headingBox!.x);
    }
  }
});

test('site header menu opens as a non-destructive left side drawer', async ({ page }) => {
  const drawerViewports = [
    { name: 'phone', width: 390, height: 900 },
    { name: 'tablet', width: 768, height: 1000 },
  ];

  for (const viewport of drawerViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const modeViewport = page.locator('.exchange-mode-viewport').first();
    await modeViewport.scrollIntoViewIfNeeded();
    const activeLayer = modeViewport.locator('.exchange-mode-layer.active-layer');
    const amountInput = activeLayer.getByTestId('input-amount');
    const assetSelector = activeLayer.getByTestId('select-from-asset');
    await amountInput.fill('1.25');
    const amountBeforeMenu = await amountInput.inputValue();
    const assetBeforeMenu = await assetSelector.textContent();
    const pageBefore = await page.evaluate(() => ({
      scrollX: window.scrollX,
      clientWidth: document.documentElement.clientWidth,
    }));

    const siteMenuButton = page.getByTestId('button-mobile-menu');
    await siteMenuButton.evaluate((button: HTMLButtonElement) => button.click());
    const drawerLayer = page.getByTestId('site-menu-drawer-layer');
    const drawer = page.getByTestId('site-menu-drawer');
    const backdrop = page.getByTestId('site-menu-drawer-backdrop');
    await expect(drawerLayer).toHaveClass(/is-open/);
    await expect(drawer).toBeVisible();
    await expect(backdrop).toBeVisible();
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect(activeLayer).toBeVisible();
    await expect(activeLayer).toHaveCSS('opacity', '1');
    expect(await drawer.getByRole('link').count()).toBeGreaterThan(0);

    const drawerGeometry = await drawer.evaluate((menu) => {
      const menuBox = menu.getBoundingClientRect();
      return {
        left: menuBox.left,
        top: menuBox.top,
        width: menuBox.width,
        height: menuBox.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(drawerGeometry.left).toBeCloseTo(0, 0);
    expect(drawerGeometry.top).toBeCloseTo(0, 0);
    expect(drawerGeometry.height).toBeCloseTo(drawerGeometry.viewportHeight, 0);
    if (viewport.width <= 520) {
      expect(drawerGeometry.width / drawerGeometry.viewportWidth).toBeGreaterThanOrEqual(0.74);
      expect(drawerGeometry.width / drawerGeometry.viewportWidth).toBeLessThanOrEqual(0.78);
    } else {
      expect(drawerGeometry.width).toBeLessThanOrEqual(340);
    }
    expect(drawerGeometry.bodyOverflow).toBe('hidden');
    expect(drawerGeometry.documentOverflow).toBe(0);
    expect(await page.evaluate(() => window.scrollX)).toBe(pageBefore.scrollX);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(pageBefore.clientWidth);

    if (viewport.width === 390) {
      await backdrop.click({ position: { x: viewport.width - 4, y: viewport.height / 2 } });
    } else {
      await drawer.getByTestId('button-close-site-menu').click();
    }
    await expect(drawerLayer).not.toHaveClass(/is-open/);
    await expect(drawerLayer).toHaveAttribute('aria-hidden', 'true');
    await expect(drawerLayer).toHaveCSS('visibility', 'hidden');
    await expect(activeLayer).toBeVisible();
    await expect(amountInput).toHaveValue(amountBeforeMenu);
    expect(await assetSelector.textContent()).toBe(assetBeforeMenu);
  }
});

test('Landing Page and Admin menus share the exact side drawer visual system', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });

  const drawerContract = async (drawerTestId: string, backdropTestId: string) => {
    const drawer = page.getByTestId(drawerTestId);
    const backdrop = page.getByTestId(backdropTestId);
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    return drawer.evaluate((element, backdropId) => {
      const style = (target: Element) => getComputedStyle(target);
      const bounds = element.getBoundingClientRect();
      const backdropElement = document.querySelector(`[data-testid="${backdropId}"]`)!;
      return {
        drawer: {
          left: Math.round(bounds.left),
          top: Math.round(bounds.top),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
          background: style(element).background,
          borderRight: style(element).borderRight,
          boxShadow: style(element).boxShadow,
          transitionDuration: style(element).transitionDuration,
          transitionTimingFunction: style(element).transitionTimingFunction,
        },
        backdrop: {
          background: style(backdropElement).background,
          opacity: style(backdropElement).opacity,
          backdropFilter: style(backdropElement).backdropFilter,
          transitionDuration: style(backdropElement).transitionDuration,
        },
      };
    }, await backdrop.getAttribute('data-testid'));
  };

  await page.goto('/');
  await page.getByTestId('button-mobile-menu').click();
  const landingContract = await drawerContract('site-menu-drawer', 'site-menu-drawer-backdrop');
  await page.getByTestId('button-close-site-menu').click();
  await expect(page.getByTestId('site-menu-drawer-layer')).toHaveCSS('visibility', 'hidden');

  await page.goto('/admin');
  await page.getByTestId('button-admin-mobile-menu').click();
  const adminContract = await drawerContract('admin-menu-drawer', 'admin-menu-drawer-backdrop');
  expect(adminContract).toEqual(landingContract);
  await expect(page.getByTestId('button-admin-drawer-signout')).toBeVisible();
});

test('homepage keeps the requested vertical order on phones and normal desktops', async ({ page }) => {
  const homepageViewports = [
    { name: 'narrow phone', width: 320, height: 900 },
    { name: 'phone', width: 390, height: 900 },
    { name: 'mobile boundary', width: 767, height: 1000 },
    { name: 'desktop', width: 1280, height: 1000 },
  ];

  for (const viewport of homepageViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const geometry = await page.locator('.exchange-main.public-hero-container').evaluate((hero) => {
      const bounds = (selector: string) => (
        hero.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
      );
      const eyebrow = bounds('.hero-eyebrow');
      const title = bounds('.exchange-hero-copy > h1');
      const description = bounds('.hero-supporting-line');
      const widget = bounds('#exchange-widget');
      const features = bounds('.hero-capability-grid');
      return {
        eyebrow: { top: eyebrow.top, bottom: eyebrow.bottom },
        title: { top: title.top, bottom: title.bottom },
        description: { top: description.top, bottom: description.bottom },
        widget: { top: widget.top, bottom: widget.bottom, left: widget.left, right: widget.right },
        features: { top: features.top, bottom: features.bottom },
        featuresVisible: features.width > 0 && features.height > 0,
        viewportWidth: window.innerWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(geometry.eyebrow.bottom, `${viewport.name} badge before title`).toBeLessThanOrEqual(geometry.title.top);
    expect(geometry.title.bottom, `${viewport.name} title before description`).toBeLessThanOrEqual(geometry.description.top);
    if (viewport.width < 768) {
      expect(geometry.widget.top - geometry.description.bottom, `${viewport.name} description-to-widget gap`)
        .toBeGreaterThanOrEqual(20);
      expect(geometry.widget.top - geometry.description.bottom, `${viewport.name} description-to-widget gap`)
        .toBeLessThanOrEqual(30);
    }
    if (viewport.width < 768 && geometry.featuresVisible) {
      expect(geometry.features.top, `${viewport.name} features after widget`).toBeGreaterThan(geometry.widget.bottom);
    }
    expect(geometry.widget.left).toBeGreaterThanOrEqual(7);
    expect(geometry.widget.right).toBeLessThanOrEqual(geometry.viewportWidth - 7);
    expect(geometry.documentOverflow).toBe(0);
  }
});

test('homepage uses a left-widget two-column hero on tablets and iPads', async ({ page }) => {
  const tabletViewports = [
    { name: 'iPad portrait', width: 768, height: 1024 },
    { name: 'tablet landscape', width: 1024, height: 900 },
    { name: 'tablet boundary', width: 1180, height: 900 },
  ];

  for (const viewport of tabletViewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const geometry = await page.locator('.exchange-main.public-hero-container').evaluate((hero) => {
      const bounds = (selector: string) => (
        hero.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
      );
      const heroBox = hero.getBoundingClientRect();
      const eyebrow = bounds('.hero-eyebrow');
      const title = bounds('.exchange-hero-copy > h1');
      const description = bounds('.hero-supporting-line');
      const widget = bounds('#exchange-widget');
      const features = bounds('.hero-capability-grid');
      const featureItems = [...hero.querySelectorAll<HTMLElement>('.hero-capability-grid > span')]
        .map(item => item.getBoundingClientRect());
      return {
        hero: { left: heroBox.left, right: heroBox.right },
        eyebrow: { top: eyebrow.top, bottom: eyebrow.bottom, left: eyebrow.left },
        title: { top: title.top, bottom: title.bottom, left: title.left },
        description: { top: description.top, bottom: description.bottom },
        widget: {
          top: widget.top,
          bottom: widget.bottom,
          left: widget.left,
          right: widget.right,
          width: widget.width,
        },
        features: { top: features.top, bottom: features.bottom },
        featureRows: featureItems.map(item => ({ top: item.top, bottom: item.bottom })),
        viewportWidth: window.innerWidth,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(geometry.widget.right, `${viewport.name} widget remains left of content`)
      .toBeLessThan(geometry.title.left);
    expect(Math.abs(geometry.widget.top - geometry.eyebrow.top), `${viewport.name} top alignment`)
      .toBeLessThanOrEqual(2);
    expect(geometry.widget.left - geometry.hero.left, `${viewport.name} left margin`)
      .toBeGreaterThanOrEqual(0);
    expect(geometry.hero.right - geometry.title.left, `${viewport.name} right content width`)
      .toBeGreaterThan(260);
    expect(geometry.widget.width, `${viewport.name} widget should not span the tablet`)
      .toBeLessThan(geometry.viewportWidth * 0.65);
    expect(geometry.eyebrow.bottom).toBeLessThanOrEqual(geometry.title.top);
    expect(geometry.title.bottom).toBeLessThanOrEqual(geometry.description.top);
    expect(geometry.features.top).toBeGreaterThanOrEqual(geometry.description.bottom);
    if (viewport.width <= 900) {
      expect(geometry.featureRows[1].top, `${viewport.name} feature cards stack cleanly`)
        .toBeGreaterThan(geometry.featureRows[0].bottom);
    }
    expect(geometry.documentOverflow).toBe(0);
  }
});

test('desktop-mode iPads keep the exchange widget in the left hero column', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    hasTouch: true,
  });
  const page = await context.newPage();

  try {
    await page.goto('/');
    const geometry = await page.locator('.exchange-main.public-hero-container').evaluate((hero) => {
      const widget = hero.querySelector<HTMLElement>('#exchange-widget')!.getBoundingClientRect();
      const title = hero.querySelector<HTMLElement>('.exchange-hero-copy > h1')!.getBoundingClientRect();
      return {
        widget: { top: widget.top, right: widget.right, width: widget.width },
        title: { top: title.top, left: title.left },
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(geometry.widget.right).toBeLessThan(geometry.title.left);
    expect(Math.abs(geometry.widget.top - geometry.title.top)).toBeLessThan(100);
    expect(geometry.widget.width).toBeLessThanOrEqual(500);
    expect(geometry.documentOverflow).toBe(0);
  } finally {
    await context.close();
  }
});