import { expect, test, type Page } from '@playwright/test';

const now = '2026-08-26T00:00:00.000Z';
const assets = [
  { id: 'btc', code: 'BTC', name: 'Bitcoin', decimals: 8, enabled: true, createdAt: now, updatedAt: now },
  { id: 'usdt', code: 'USDT', name: 'Tether', decimals: 6, enabled: true, createdAt: now, updatedAt: now },
];
const networks = [
  { id: 'btc-bitcoin', assetId: 'btc', networkCode: 'BTC', networkName: 'Bitcoin', decimals: 8, enabled: true, customerDepositsEnabled: true, requiresMemo: false, requiredConfirmations: 2, createdAt: now, updatedAt: now },
  { id: 'usdt-trc20', assetId: 'usdt', networkCode: 'TRC20', networkName: 'TRON', decimals: 6, enabled: true, customerDepositsEnabled: true, requiresMemo: false, requiredConfirmations: 20, createdAt: now, updatedAt: now },
  { id: 'usdt-erc20', assetId: 'usdt', networkCode: 'ERC20', networkName: 'Ethereum', decimals: 6, enabled: true, customerDepositsEnabled: false, requiresMemo: false, requiredConfirmations: 12, createdAt: now, updatedAt: now },
];
type Provider = 'whitebit' | 'manual' | 'none';
type RouteState = {
  networkId: string; originalCustomerDepositsEnabled: boolean; status: 'queued' | 'running' | 'succeeded' | 'failed';
  step: 'pending' | 'disabling' | 'assigning' | 'verifying' | 'restoring' | 'checking' | 'completed' | 'failed';
  message: string; errorCode: string | null; attempts: number; customerDepositsEnabled: boolean; savedProvider: string;
};
type Job = { id: string; depositProvider: Provider; createdAt: string; routes: RouteState[] };

async function installFixtures(page: Page, opts: { role?: 'owner' | 'operator'; failedPostOnce?: boolean; lostGetOnce?: boolean } = {}) {
  const role = opts.role ?? 'owner';
  const tracker = { creates: [] as any[], gets: [] as string[], retries: [] as any[], job: null as Job | null, failPost: !!opts.failedPostOnce, failGet: !!opts.lostGetOnce };
  const json = (data: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(data) });
  await page.route('**/api/admin/authorization', route => route.fulfill(json({
    member: { id: `bulk-${role}-e2e`, email: `${role}@example.test`, role, status: 'active' },
    owner: role === 'owner',
    effectivePermissions: role === 'owner' ? [] : ['crypto_networks.view', 'crypto_networks.manage', 'crypto_assets.view', 'currencies.view'],
    catalog: [],
  })));
  await page.route('**/api/admin/operators', route => route.fulfill(json([])));
  await page.route('**/api/admin/providers/oneforge', route => route.fulfill(json({
    provider: '1Forge', configured: true, state: 'healthy', fetchedAt: now, ageMs: 4000,
    rates: [{ currency: 'USD', unitsPerUsd: '1' }, { currency: 'EUR', unitsPerUsd: '0.85' }],
  })));
  await page.route('**/api/admin/fiat-currencies', route => route.fulfill(json([])));
  await page.route('**/api/admin/payment-methods', route => route.fulfill(json([])));
  await page.route('**/api/admin/fiat-currency-payment-methods', route => route.fulfill(json([])));
  await page.route('**/api/admin/crypto-assets', route => route.fulfill(json(assets)));
  await page.route('**/api/admin/crypto-networks', route => route.fulfill(json(networks)));
  await page.route('**/api/admin/deposit-providers', route => route.fulfill(json([
    { id: 'whitebit', label: 'WhiteBIT', implemented: true },
    { id: 'manual', label: 'Manual Wallet', implemented: true },
    { id: 'none', label: 'None', implemented: true },
  ])));
  await page.route('**/api/admin/providers/whitebit', route => route.fulfill(json({
    provider: 'whitebit', configured: true, credentialsConfigured: true, credentialsVerified: true,
    explicitDisabled: false, state: 'healthy', fetchedAt: now,
  })));
  await page.route('**/api/admin/providers/whitebit/verification-routes', route => route.fulfill(json([])));
  await page.route('**/api/admin/crypto-networks/deposit-provider/preview', route => {
    const input = route.request().postDataJSON() as { networkIds: string[]; depositProvider: Provider };
    return route.fulfill(json({ reviewToken: 'a'.repeat(64), routes: input.networkIds.map(id => {
      const network = networks.find(candidate => candidate.id === id)!;
      const asset = assets.find(candidate => candidate.id === network.assetId)!;
      const supported = input.depositProvider !== 'whitebit' || id !== 'btc-bitcoin';
      return {
        networkId: id, assetCode: asset.code, networkCode: network.networkCode,
        currentProvider: 'manual', status: supported ? id === 'usdt-trc20' && input.depositProvider === 'whitebit' ? 'requires_configuration' : 'supported' : 'unsupported',
        mappingStatus: supported ? 'supported' : 'unsupported',
        whitebitAssetCode: supported ? asset.code : null, whitebitNetworkCode: supported ? network.networkCode : null,
        whitebitNetworkOptions: supported ? [network.networkCode] : [],
        reason: supported ? 'Mock readiness: exact route is mapped and safe to review.' : 'Mock readiness: WhiteBIT does not support BTC.',
        customerDepositsAfter: false,
      };
    }) }));
  });
  await page.route('**/api/admin/crypto-networks/deposit-provider/jobs', async route => {
    if (route.request().method() === 'GET') {
      if (tracker.failGet) { tracker.failGet = false; return route.fulfill(json({ message: 'Mock connection lost' }, 503)); }
      return route.fulfill(json(tracker.job));
    }
    const input = route.request().postDataJSON() as { operationId: string; networkIds: string[]; depositProvider: Provider };
    tracker.creates.push(input);
    if (tracker.failPost) { tracker.failPost = false; return route.fulfill(json({ message: 'Mock create response lost' }, 503)); }
    tracker.job = makeJob(input.operationId, input.depositProvider, input.networkIds, 'running');
    return route.fulfill(json(tracker.job, 202));
  });
  await page.route('**/api/admin/crypto-networks/deposit-provider/jobs/**', async route => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').at(-1)!;
    if (route.request().method() === 'GET') {
      tracker.gets.push(id);
      if (tracker.failGet) { tracker.failGet = false; return route.fulfill(json({ message: 'Mock connection lost' }, 503)); }
      if (tracker.job) {
        tracker.job = finishJob(tracker.job);
        return route.fulfill(json(tracker.job));
      }
      return route.fulfill(json({ message: 'No fixture job' }, 404));
    }
    const body = route.request().postDataJSON() as { networkId: string; confirmRealAddressCreation: boolean };
    tracker.retries.push(body);
    if (tracker.job) {
      tracker.job = { ...tracker.job, routes: tracker.job.routes.map(item => item.networkId === body.networkId
        ? { ...item, status: 'running', step: 'checking', message: 'Retrying mocked verification.', errorCode: null, attempts: item.attempts + 1 }
        : item) };
    }
    return route.fulfill(json(tracker.job));
  });
  await page.route('**/api/exchange/config', route => route.fulfill(json({
    assets: [], fiatCurrencies: [], manualSettlementOptions: [], instantSettlementOptions: [],
  })));
  return tracker;
}

function makeJob(id: string, provider: Provider, ids: string[], state: 'running' | 'partial'): Job {
  return {
    id, depositProvider: provider, createdAt: now,
    routes: ids.map((networkId, index) => {
      const network = networks.find(item => item.id === networkId)!;
      const failed = state === 'partial' && index === 1;
      const original = network.customerDepositsEnabled;
      return {
        networkId, originalCustomerDepositsEnabled: original,
        status: failed ? 'failed' : state === 'running' ? index === 0 ? 'running' : 'queued' : 'succeeded',
        step: failed ? 'failed' : state === 'running' ? index === 0 ? 'verifying' : 'pending' : 'completed',
        message: failed ? 'Mock address permission was rejected; deposits remain OFF.' : state === 'running' ? 'Mock provider verification in progress.' : 'Mock provider verified; original deposit state restored.',
        errorCode: failed ? 'WHITEBIT_PERMISSION_REJECTED' : null, attempts: 1,
        customerDepositsEnabled: state === 'partial' && !failed ? original : false,
        savedProvider: failed ? 'manual' : provider,
      } as RouteState;
    }),
  };
}
function finishJob(job: Job): Job {
  return { ...job, routes: job.routes.map(route => {
    const unsupported = job.depositProvider === 'whitebit' && route.networkId === 'btc-bitcoin';
    const permissionFailure = job.depositProvider === 'whitebit' && route.networkId === 'usdt-erc20' && route.attempts === 1;
    const failed = unsupported || permissionFailure;
    return {
      ...route,
      status: failed ? 'failed' : 'succeeded',
      step: failed ? 'failed' : 'completed',
      message: unsupported ? 'Mock readiness: route unsupported; other routes continue.' : permissionFailure
        ? 'Mock address permission was rejected; deposits remain OFF.'
        : 'Mock provider verified; original deposit state restored.',
      errorCode: unsupported ? 'WHITEBIT_ROUTE_UNSUPPORTED' : permissionFailure ? 'WHITEBIT_PERMISSION_REJECTED' : null,
      customerDepositsEnabled: route.originalCustomerDepositsEnabled && !failed,
      savedProvider: failed ? 'manual' : job.depositProvider,
    };
  }) };
}

async function openBulkDialog(page: Page, selected: string[]) {
  await page.goto('/admin/currencies');
  await page.getByRole('button', { name: /Crypto Networks/ }).click();
  await expect(page.getByRole('heading', { name: 'Crypto Networks' })).toBeVisible();
  const labelById: Record<string, string> = {
    'btc-bitcoin': 'Select Bitcoin for catalog actions',
    'usdt-trc20': 'Select TRON for catalog actions',
    'usdt-erc20': 'Select Ethereum for catalog actions',
  };
  for (const id of selected) await page.getByLabel(labelById[id]).check();
  await page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Assign Deposit Provider' }).click();
  return page.getByTestId('bulk-deposit-provider-dialog');
}

test.describe('automated deposit-provider switch job', () => {
  for (const viewport of [{ name: 'desktop 1440px', width: 1440 }, { name: 'mobile 390px', width: 390 }]) {
    test(`${viewport.name}: active progress, partial failure, consent, and individual retry`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      const fixture = await installFixtures(page);
      const dialog = await openBulkDialog(page, ['usdt-trc20', 'usdt-erc20']);
      await expect(dialog.getByText('WhiteBIT route support:').first()).toBeVisible();
      await dialog.getByRole('button', { name: 'Select All Supported' }).click();
      await expect(dialog.getByLabel('Select BTC BTC')).not.toBeChecked();
      await expect(dialog.getByLabel('Select USDT TRC20')).toBeChecked();
      await expect(dialog.getByLabel('Select USDT ERC20')).toBeChecked();
      await dialog.getByLabel('Select BTC BTC').check();
      await dialog.getByRole('button', { name: 'Review Changes' }).click();
      await expect(dialog.getByTestId('bulk-deposit-provider-review')).toContainText('TRC20');
      await expect(dialog.getByTestId('bulk-deposit-switch-consent')).not.toBeChecked();
      await expect(dialog.getByTestId('button-bulk-deposit-confirm')).toBeDisabled();
      await dialog.getByTestId('bulk-deposit-switch-consent').check();
      await dialog.getByTestId('button-bulk-deposit-confirm').click();
      const progress = dialog.getByTestId('bulk-deposit-switch-progress');
      await expect(progress).toBeVisible();
      await expect(progress.getByTestId('bulk-deposit-switch-route-usdt-trc20')).toContainText(/running|failed/);
      await expect(progress.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toBeVisible();
      await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 2 failed');
      await expect(progress.getByTestId('bulk-deposit-switch-route-btc-bitcoin')).toContainText('WHITEBIT_ROUTE_UNSUPPORTED');
      await expect(progress.getByTestId('bulk-deposit-switch-route-btc-bitcoin')).toContainText('other routes continue');
      await expect(progress.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('WHITEBIT_PERMISSION_REJECTED');
      await expect(progress.getByTestId('bulk-deposit-switch-route-usdt-trc20')).toContainText('originally ON, now ON');
      await expect(progress.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('originally OFF, now OFF');
      await page.once('dialog', d => d.accept());
      await progress.getByTestId('button-retry-route-usdt-erc20').click();
      await expect.poll(() => fixture.retries.length).toBe(1);
      expect(fixture.retries[0]).toEqual({ networkId: 'usdt-erc20', confirmRealAddressCreation: true });
      await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toBeVisible();
      await expect(progress.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('Saved provider: WhiteBIT');
      await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('2 succeeded, 1 failed');
      await expect(progress.getByTestId('bulk-deposit-switch-route-btc-bitcoin')).toContainText('failed');
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('non-Owner cannot start a provider switch', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await installFixtures(page, { role: 'operator' });
    await page.goto('/admin/currencies');
    await page.getByRole('button', { name: /Crypto Networks/ }).click();
    await page.getByLabel('Select Ethereum for catalog actions').check();
    await expect(page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Assign Deposit Provider' })).toHaveCount(0);
  });

  test('Manual Wallet and None can be selected; None keeps originally OFF deposits OFF', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await installFixtures(page);
    const dialog = await openBulkDialog(page, ['usdt-erc20']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toContainText('Manual Wallet');
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 0 failed');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('Saved provider: Manual Wallet');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('originally OFF, now OFF');
    await dialog.getByTestId('button-bulk-deposit-new-assignment').click();
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('none');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toContainText('assign None');
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 0 failed');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('Saved provider: None');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-usdt-erc20')).toContainText('originally OFF, now OFF');
  });

  test('failed POST retains operation ID and retries same request after reload without duplicate creation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page, { failedPostOnce: true, lostGetOnce: true });
    const dialog = await openBulkDialog(page, ['usdt-erc20']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByRole('alert')).toContainText('Mock create response lost');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bulk-deposit-switch:bulk-owner-e2e') || 'null'));
    expect(saved.operationId).toBeTruthy();
    await dialog.getByRole('button', { name: 'Close provider assignment' }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Assign Deposit Provider' }).click();
    const reopened = page.getByTestId('bulk-deposit-provider-dialog');
    await expect(reopened.getByTestId('bulk-deposit-switch-reconnect')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Crypto Networks/ }).click();
    await page.getByLabel('Select Ethereum for catalog actions').check();
    await page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Assign Deposit Provider' }).click();
    const resumed = page.getByTestId('bulk-deposit-provider-dialog');
    await expect(resumed).toBeVisible();
    await expect.poll(() => fixture.creates.length).toBe(2);
    expect(fixture.creates[0].operationId).toBe(fixture.creates[1].operationId);
    await expect(resumed.getByTestId('bulk-deposit-switch-summary')).toBeVisible();
    expect(fixture.gets).toContain(saved.operationId);
  });
});
