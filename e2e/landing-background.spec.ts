import { expect, test, type Page, type Route } from '@playwright/test';
import { publishedSiteContentStub } from '../artifacts/crypto-exchange-widget/test/site-content-stub';

type Role = 'owner' | 'operator';
type Placement = { x: number; y: number; zoom: number; opacity: number; blur: number };
type Background = {
  mode: 'preset';
  presetId: 'neon-orbit' | 'quantum-grid' | 'aurora-chain';
  customObjectPath: null;
  focalX: number;
  focalY: number;
  desktopPlacement: Placement;
  mobilePlacement: Placement;
  placements: Record<string, { desktop: Placement; mobile: Placement }>;
  version: number;
  createdAt: string;
  createdBy: string;
};

const exchangeConfig = {
  assets: [
    { id: 'btc', code: 'BTC', name: 'Bitcoin', kind: 'crypto', network: 'Bitcoin', requiresMemo: false, precision: 8 },
    { id: 'usdt', code: 'USDT', name: 'Tether', kind: 'crypto', network: 'TRC20', requiresMemo: false, precision: 6 },
  ],
  fiatCurrencies: [],
  settlementOptions: [
    { id: 'crypto:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', routeNetwork: 'Bitcoin', kind: 'crypto-network', title: 'Bitcoin', networkTitle: 'Bitcoin', direction: 'both' },
    { id: 'crypto:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Tether', networkTitle: 'TRC20', direction: 'both' },
  ],
  manualSettlementOptions: [
    { id: 'crypto:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', routeNetwork: 'Bitcoin', kind: 'crypto-network', title: 'Bitcoin', networkTitle: 'Bitcoin', direction: 'both' },
    { id: 'crypto:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Tether', networkTitle: 'TRC20', direction: 'both' },
  ],
  instantSettlementOptions: [],
  manualRouteAvailability: {
    available: true,
    routes: [{ sourceSettlementOptionId: 'crypto:btc-bitcoin', targetSettlementOptionId: 'crypto:usdt-trc20' }],
    unavailableMessage: null,
  },
  providers: [],
  capabilities: { instantQuotes: true, instantOrders: true },
};

const quickexConfig = {
  provider: 'Quickex',
  signedOrders: true,
  instruments: [
    { slug: 'btc-bitcoin', currencyTitle: 'BTC', networkTitle: 'Bitcoin', instrumentType: 'crypto' },
    { slug: 'usdt-trc20', currencyTitle: 'USDT', networkTitle: 'TRC20', instrumentType: 'crypto' },
  ],
  pairs: [{ fromAsset: 'BTC', fromNetwork: 'Bitcoin', toAsset: 'USDT', toNetwork: 'TRC20' }],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function expectPlacementImage(
  image: ReturnType<Page['getByTestId']>,
  x: number,
  y: number,
  scale: number,
  opacity?: number,
) {
  await expect(image).toHaveCSS('background-position', new RegExp(`^${x}% ${y}%(, ${x}% ${y}%)?$`));
  await expect(image).toHaveCSS('background-size', /^cover(, cover)?$/);
  await expect(image).toHaveCSS('background-repeat', /^no-repeat(, no-repeat)?$/);
  await expect(image).toHaveCSS('transform', `matrix(${scale}, 0, 0, ${scale}, 0, 0)`);
  if (opacity !== undefined) await expect(image).toHaveCSS('opacity', String(opacity / 100));
}

async function expectBlurFilter(
  image: ReturnType<Page['getByTestId']>,
  blur: number,
  device: 'desktop' | 'mobile' = 'desktop',
) {
  if (blur === 0) {
    await expect(image).toHaveCSS('filter', 'none');
    return;
  }
  await expect(image).toHaveCSS('filter', /url\(/);
  const definition = await image.evaluate((element, selectedDevice) => {
    const filterId = element.getAttribute(`data-${selectedDevice}-filter-id`);
    const blurElement = filterId ? element.ownerDocument.getElementById(filterId)?.querySelector('feGaussianBlur') : null;
    return {
      filterId,
      stdDeviation: blurElement?.getAttribute('stdDeviation'),
      edgeMode: blurElement?.getAttribute('edgeMode'),
    };
  }, device);
  expect(definition.filterId).toBeTruthy();
  expect(definition.stdDeviation).toBe(String(blur));
  expect(definition.edgeMode).toBe('duplicate');
}

async function expectImageMatchesWrapper(image: ReturnType<Page['getByTestId']>) {
  const bounds = await image.evaluate((element) => {
    const imageBounds = element.getBoundingClientRect();
    const wrapperBounds = element.parentElement!.getBoundingClientRect();
    return {
      imageBounds: [imageBounds.top, imageBounds.right, imageBounds.bottom, imageBounds.left],
      wrapperBounds: [wrapperBounds.top, wrapperBounds.right, wrapperBounds.bottom, wrapperBounds.left],
    };
  });
  expect(bounds.imageBounds).toEqual(bounds.wrapperBounds);
}

test('landing artwork stays editable while the live exchange remains clean', async ({ page }) => {
  test.setTimeout(120_000);
  const prior: Background = {
    mode: 'preset',
    presetId: 'neon-orbit',
    customObjectPath: null,
    focalX: 50,
    focalY: 50,
    desktopPlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    mobilePlacement: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
    placements: {
      'neon-orbit': {
        desktop: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
        mobile: { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 },
      },
    },
    version: 7,
    createdAt: '2026-09-01T10:00:00.000Z',
    createdBy: 'existing-owner',
  };
  let live = { ...prior };
  let role: Role = 'owner';
  const syntheticOperators = new Set(['landing-owner-e2e', 'landing-operator-e2e']);

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/landing-background') {
      const {
        version: _version,
        createdAt: _createdAt,
        createdBy: _createdBy,
        placements: _placements,
        ...publicBackground
      } = live;
      return json(route, publicBackground);
    }
    if (path === '/api/admin/landing-background' && request.method() === 'GET') return json(route, live);
    if (path === '/api/admin/landing-background' && request.method() === 'POST') {
      if (role !== 'owner') {
        return json(route, {
          error: 'Only owners can publish landing background changes.',
          code: 'OWNER_ACCESS_REQUIRED',
          retryable: false,
          outcomeUnknown: false,
        }, 403);
      }
      const input = request.postDataJSON() as Pick<Background, 'mode' | 'presetId' | 'focalX' | 'focalY' | 'placements'>;
      live = {
        ...input,
        customObjectPath: null,
        desktopPlacement: input.placements[input.presetId!].desktop,
        mobilePlacement: input.placements[input.presetId!].mobile,
        version: live.version + 1,
        createdAt: '2026-09-01T11:00:00.000Z',
        createdBy: 'landing-owner-e2e',
      };
      return json(route, live, 201);
    }
    if (path === '/api/exchange/config') return json(route, exchangeConfig);
    if (path === '/api/site-content') return json(route, publishedSiteContentStub);
    if (path === '/api/site-navigation') return json(route, []);
    if (path === '/api/admin/authorization') return json(route, {
      member: { id: 'landing-owner-e2e', email: 'owner@example.test', role: 'owner', status: 'active' },
      owner: true,
      effectivePermissions: [],
      catalog: [],
    });
    if (path === '/api/quickex/config') return json(route, quickexConfig);
    if (path === '/api/admin/summary') return json(route, {
      operationalHealth: {},
      recentActivity: [],
      owner: true,
      effectivePermissions: [],
    });
    if (path === '/api/customer/orders') return json(route, { items: [], total: 0, page: 1, pageSize: 10 });
    return json(route, {});
  });

  try {
    await page.goto('/admin/landing-background');
    await expect(page.getByTestId('admin-landing-background-studio')).toBeVisible();
    await page.getByTestId('preset-quantum-grid').click();
    await page.getByTestId('focal-x-input').fill('28');
    await page.getByTestId('focal-y-input').fill('72');
    await page.getByTestId('focal-zoom-input').fill('120');
    await page.getByTestId('background-opacity-input').fill('0');
    await page.getByTestId('background-blur-input').fill('30');
    await expect(page.getByTestId('background-blur-value')).toHaveText('30px');
    await expectPlacementImage(page.getByTestId('focal-map').getByTestId('landing-background-image'), 28, 72, 1.2, 0);
    await expectPlacementImage(page.getByTestId('preview-frame').getByTestId('landing-background-image'), 28, 72, 1.2, 0);
    await expectBlurFilter(page.getByTestId('focal-map').getByTestId('landing-background-image'), 30);
    await expectBlurFilter(page.getByTestId('preview-frame').getByTestId('landing-background-image'), 30);
    await page.getByTestId('focal-zoom-input').fill('100');
    await expectImageMatchesWrapper(page.getByTestId('focal-map').getByTestId('landing-background-image'));
    await expectImageMatchesWrapper(page.getByTestId('preview-frame').getByTestId('landing-background-image'));
    await page.getByTestId('focal-zoom-input').fill('120');

    await page.getByTestId('placement-mobile-toggle').click();
    const mobileMapRatio = await page.getByTestId('focal-map').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width / bounds.height;
    });
    expect(mobileMapRatio).toBeCloseTo(390 / 844, 2);
    await page.getByTestId('focal-x-input').fill('64');
    await page.getByTestId('focal-y-input').fill('36');
    await page.getByTestId('focal-zoom-input').fill('135');
    await page.getByTestId('background-opacity-input').fill('100');
    await page.getByTestId('background-blur-input').fill('10');
    await expectPlacementImage(page.getByTestId('focal-map').getByTestId('landing-background-image'), 64, 36, 1.35, 100);
    await expectPlacementImage(page.getByTestId('preview-frame').getByTestId('landing-background-image'), 64, 36, 1.35, 100);
    await expectBlurFilter(page.getByTestId('focal-map').getByTestId('landing-background-image'), 10);
    await expectBlurFilter(page.getByTestId('preview-frame').getByTestId('landing-background-image'), 10);
    await page.getByTestId('button-reset-blur').click();
    await expect(page.getByTestId('background-blur-input')).toHaveValue('0');

    await page.getByTestId('preset-aurora-chain').click();
    await expect(page.getByTestId('focal-x-input')).toHaveValue('50');
    await expect(page.getByTestId('focal-y-input')).toHaveValue('50');
    await expect(page.getByTestId('focal-zoom-input')).toHaveValue('100');
    await expect(page.getByTestId('background-opacity-input')).toHaveValue('100');
    await expect(page.getByTestId('background-blur-input')).toHaveValue('0');
    await page.getByTestId('placement-desktop-toggle').click();
    await page.getByTestId('placement-x-right').click();
    await page.getByTestId('placement-y-top').click();
    await page.getByTestId('focal-zoom-input').fill('125');
    await page.getByTestId('background-opacity-input').fill('50');
    await page.getByTestId('background-blur-input').fill('5');
    await expectPlacementImage(page.getByTestId('focal-map').getByTestId('landing-background-image'), 100, 0, 1.25, 50);
    await expectBlurFilter(page.getByTestId('focal-map').getByTestId('landing-background-image'), 5);

    await page.getByTestId('preset-quantum-grid').click();
    await expect(page.getByTestId('focal-x-input')).toHaveValue('28');
    await expect(page.getByTestId('focal-y-input')).toHaveValue('72');
    await expect(page.getByTestId('focal-zoom-input')).toHaveValue('120');
    await expect(page.getByTestId('background-opacity-input')).toHaveValue('0');
    await expect(page.getByTestId('background-blur-input')).toHaveValue('30');
    await page.getByTestId('placement-mobile-toggle').click();
    await expect(page.getByTestId('focal-x-input')).toHaveValue('64');
    await expect(page.getByTestId('focal-y-input')).toHaveValue('36');
    await expect(page.getByTestId('focal-zoom-input')).toHaveValue('135');
    await expect(page.getByTestId('background-opacity-input')).toHaveValue('100');
    await expect(page.getByTestId('background-blur-input')).toHaveValue('0');
    await page.getByTestId('button-publish').click();
    await expect(page.getByTestId('publish-notice')).toContainText('published successfully');

    await page.reload();
    await expect(page.getByTestId('preset-quantum-grid')).toHaveClass(/border-primary/);
    await expect(page.getByTestId('focal-x-input')).toHaveValue('28');
    await expect(page.getByTestId('focal-y-input')).toHaveValue('72');
    await expect(page.getByTestId('focal-zoom-input')).toHaveValue('120');
    await expect(page.getByTestId('background-opacity-input')).toHaveValue('0');
    await expect(page.getByTestId('background-blur-input')).toHaveValue('30');
    await page.getByTestId('placement-mobile-toggle').click();
    await expect(page.getByTestId('focal-x-input')).toHaveValue('64');
    await expect(page.getByTestId('focal-y-input')).toHaveValue('36');
    await expect(page.getByTestId('focal-zoom-input')).toHaveValue('135');
    await expect(page.getByTestId('background-opacity-input')).toHaveValue('100');
    await expect(page.getByTestId('background-blur-input')).toHaveValue('0');

    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByTestId('live-landing-background-root')).toBeVisible();
      await expect(page.getByTestId('landing-background-image')).toHaveCount(0);
      await expect(page.getByTestId('landing-background-layer')).toHaveCount(0);
      await expect(page.getByTestId('landing-background-gradient')).toHaveCount(0);
      await expect(page.getByTestId('landing-background-pattern')).toHaveCount(0);
      const publicContent = page.getByTestId('live-landing-background-root').locator(':scope > .relative.z-10');
      await expect(publicContent).toHaveCSS('opacity', '1');
      await expect(publicContent).toHaveCSS('filter', 'none');
      await expect(page.locator('header.public-header')).toHaveCSS('opacity', '1');
      await expect(page.locator('header.public-header')).toHaveCSS('filter', 'none');
      await expect(page.locator('main h1').first()).toHaveCSS('opacity', '1');
      await expect(page.locator('main h1').first()).toHaveCSS('filter', 'none');
      await expect(page.getByTestId('button-mode-select-manual')).toHaveCSS('opacity', '1');
      await expect(page.getByTestId('button-mode-select-manual')).toHaveCSS('filter', 'none');
      await expect(page.getByTestId('form-exchange')).toHaveCSS('opacity', '1');
      await expect(page.getByTestId('form-exchange')).toHaveCSS('filter', 'none');
      await page.getByTestId('select-from-asset').click();
      const menu = page.locator('.swap-contained-selector');
      await expect(menu).toBeVisible();
      const menuLayer = Number(await menu.evaluate(element => getComputedStyle(element).zIndex));
      expect(menuLayer).toBeGreaterThan(0);
      await page.keyboard.press('Escape');

      await page.getByTestId('button-mode-select-instant').click();
      await expect(page.getByTestId('convert-select-from-asset')).toBeVisible();
      await expect(page.getByTestId('live-landing-background-root')).toBeVisible();
    }

    for (const path of ['/status', '/account', '/admin', '/admin/landing-background', '/sign-in', '/sign-up']) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      await expect(page.getByTestId('live-landing-background-root'), `${path} must not mount the live landing artwork`).toHaveCount(0);
    }

    role = 'operator';
    await page.goto('/admin/landing-background');
    await page.getByTestId('preset-aurora-chain').click();
    await page.getByTestId('button-publish').click();
    await expect(page.getByTestId('publish-notice')).toContainText('Only owners can publish');
    expect(live.presetId).toBe('quantum-grid');
  } finally {
    role = 'owner';
    live = { ...prior };
    syntheticOperators.clear();
  }

  expect(live).toEqual(prior);
  expect(syntheticOperators.size).toBe(0);
});