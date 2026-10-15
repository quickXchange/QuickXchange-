import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

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
type Choice = 'auto' | 'enable' | 'disable' | 'keep';
type Monitoring = { rpcMonitoring: Choice; networkMonitor: Choice; assetMonitoring: Choice };
type RouteState = {
  networkId: string; originalCustomerDepositsEnabled: boolean; status: 'queued' | 'running' | 'succeeded' | 'failed';
  step: 'pending' | 'disabling' | 'assigning' | 'verifying' | 'restoring' | 'checking' | 'monitoring' | 'completed' | 'failed';
  message: string; errorCode: string | null; attempts: number; customerDepositsEnabled: boolean; savedProvider: string;
  rpcStatus: 'ACTIVE' | 'OFF' | 'BLOCKED' | 'IDLE' | 'NOT_CONFIGURED' | 'PRESERVED_FOR_OBLIGATIONS';
  networkMonitorEnabled: boolean | null; assetMonitoringEnabled: boolean | null; rpcTrackingEnabled: boolean;
  monitoringMessage: string;
};
type Job = { id: string; depositProvider: Provider; createdAt: string; monitoring?: Monitoring; routes: RouteState[] };

async function installFixtures(page: Page, opts: {
  role?: 'owner' | 'operator'; failedPostOnce?: boolean; lostGetOnce?: boolean;
  blockedNetworkIds?: string[]; failedNetworkIds?: string[]; obligations?: string[]; sharedManualNetworkIds?: string[];
  skipWhitebitFailures?: boolean; unconfiguredNetworkIds?: string[]; idleNetworkIds?: string[];
} = {}) {
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
    const input = route.request().postDataJSON() as { operationId: string; networkIds: string[]; depositProvider: Provider; monitoring?: Monitoring };
    tracker.creates.push(input);
    if (tracker.failPost) { tracker.failPost = false; return route.fulfill(json({ message: 'Mock create response lost' }, 503)); }
    tracker.job = makeJob(input.operationId, input.depositProvider, input.networkIds, 'running', input.monitoring, opts);
    return route.fulfill(json(tracker.job, 202));
  });
  await page.route('**/api/admin/crypto-networks/deposit-provider/jobs/**', async route => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').at(-1)!;
    if (route.request().method() === 'GET') {
      tracker.gets.push(id);
      if (tracker.failGet) { tracker.failGet = false; return route.fulfill(json({ message: 'Mock connection lost' }, 503)); }
      if (tracker.job) {
        tracker.job = finishJob(tracker.job, opts);
        return route.fulfill(json(tracker.job));
      }
      return route.fulfill(json({ message: 'No fixture job' }, 404));
    }
    const body = route.request().postDataJSON() as { networkId: string; confirmRealAddressCreation: boolean };
    tracker.retries.push(body);
    if (tracker.job) {
      tracker.job = { ...tracker.job, routes: tracker.job.routes.map(item => item.networkId === body.networkId
        ? { ...item, status: 'running', step: 'monitoring', message: 'Retrying mocked monitoring/readiness.', errorCode: null, attempts: item.attempts + 1 }
        : item) };
    }
    return route.fulfill(json(tracker.job));
  });
  await page.route('**/api/exchange/config', route => route.fulfill(json({
    assets: [], fiatCurrencies: [], manualSettlementOptions: [], instantSettlementOptions: [],
  })));
  return tracker;
}

function monitoringResult(provider: Provider, networkId: string, monitoring: Monitoring | undefined, opts: { obligations?: string[]; sharedManualNetworkIds?: string[]; unconfiguredNetworkIds?: string[]; idleNetworkIds?: string[] }): Pick<RouteState, 'rpcStatus' | 'networkMonitorEnabled' | 'assetMonitoringEnabled' | 'rpcTrackingEnabled' | 'monitoringMessage'> {
  const tracking = monitoring?.rpcMonitoring === 'enable' || (monitoring?.rpcMonitoring !== 'disable' && provider === 'manual');
  if (opts.unconfiguredNetworkIds?.includes(networkId)) return {
    rpcStatus: 'NOT_CONFIGURED', networkMonitorEnabled: null, assetMonitoringEnabled: null,
    rpcTrackingEnabled: tracking, monitoringMessage: 'No RPC monitor is configured for this route.',
  };
  if (opts.idleNetworkIds?.includes(networkId)) return {
    rpcStatus: 'IDLE', networkMonitorEnabled: true, assetMonitoringEnabled: true,
    rpcTrackingEnabled: false, monitoringMessage: 'Monitors are enabled; no live tracking obligation is active.',
  };
  const choice = monitoring ?? { rpcMonitoring: 'auto', networkMonitor: 'auto', assetMonitoring: 'auto' } as Monitoring;
  const rpcTracking = choice.rpcMonitoring === 'disable' ? false : choice.rpcMonitoring === 'enable' ? true
    : choice.rpcMonitoring === 'keep' ? true : provider === 'manual';
  const hasObligation = opts.obligations?.includes(networkId) ?? false;
  const sharedManual = opts.sharedManualNetworkIds?.includes(networkId) ?? false;
  const netEnabled = choice.networkMonitor === 'enable' ? true : choice.networkMonitor === 'disable' ? false
    : choice.networkMonitor === 'keep' ? true : rpcTracking || hasObligation || sharedManual;
  const assetEnabled = choice.assetMonitoring === 'enable' ? true : choice.assetMonitoring === 'disable' ? false
    : choice.assetMonitoring === 'keep' ? true : rpcTracking || hasObligation || sharedManual;
  const rpcStatus = !netEnabled || !assetEnabled ? (hasObligation || sharedManual) ? 'BLOCKED' : 'OFF'
    : hasObligation || sharedManual ? 'PRESERVED_FOR_OBLIGATIONS' : rpcTracking ? 'ACTIVE' : 'IDLE';
  return {
    rpcStatus, networkMonitorEnabled: netEnabled, assetMonitoringEnabled: assetEnabled,
    rpcTrackingEnabled: rpcTracking,
    monitoringMessage: hasObligation ? 'RPC monitoring retained for independent obligations.'
      : sharedManual ? 'Shared Network Monitor retained for Manual readiness.'
        : provider === 'manual' && !tracking ? 'Manual monitoring intentionally disabled; Customer Deposits remain OFF (RPC not verified).'
          : provider === 'manual' ? 'Required RPC monitoring enabled; readiness verified.'
            : 'Unnecessary polling disabled; existing provider configuration preserved.',
  };
}
function makeJob(id: string, provider: Provider, ids: string[], state: 'running' | 'partial', monitoring?: Monitoring, opts: { blockedNetworkIds?: string[]; obligations?: string[]; sharedManualNetworkIds?: string[] } = {}): Job {
  return {
    id, depositProvider: provider, createdAt: now, monitoring: monitoring ?? { rpcMonitoring: 'auto', networkMonitor: 'auto', assetMonitoring: 'auto' },
    routes: ids.map((networkId, index) => {
      const network = networks.find(item => item.id === networkId)!;
      const failed = state === 'partial' && index === 1;
      const original = network.customerDepositsEnabled;
      return {
        networkId, originalCustomerDepositsEnabled: original,
        status: failed ? 'failed' : state === 'running' ? index === 0 ? 'running' : 'queued' : 'succeeded',
        step: failed ? 'failed' : state === 'running' ? index === 0 ? 'monitoring' : 'pending' : 'completed',
        message: failed ? 'Mock address permission was rejected; deposits remain OFF.' : state === 'running' ? 'Mock provider verification in progress.' : 'Mock provider verified; original deposit state restored.',
        errorCode: failed ? 'WHITEBIT_PERMISSION_REJECTED' : null, attempts: 1,
        customerDepositsEnabled: state === 'partial' && !failed ? original : false,
        savedProvider: failed ? 'manual' : provider,
        ...monitoringResult(provider, networkId, monitoring, opts),
      } as RouteState;
    }),
  };
}
function finishJob(job: Job, opts: { blockedNetworkIds?: string[]; failedNetworkIds?: string[]; obligations?: string[]; sharedManualNetworkIds?: string[]; skipWhitebitFailures?: boolean } = {}): Job {
  return { ...job, routes: job.routes.map(route => {
    const unsupported = !opts.skipWhitebitFailures && job.depositProvider === 'whitebit' && route.networkId === 'btc-bitcoin';
    const permissionFailure = !opts.skipWhitebitFailures && job.depositProvider === 'whitebit' && route.networkId === 'usdt-erc20' && route.attempts === 1;
    const blocked = opts.blockedNetworkIds?.includes(route.networkId) && route.attempts === 1;
    const injectedFailure = opts.failedNetworkIds?.includes(route.networkId) && route.attempts === 1;
    const failed = unsupported || permissionFailure || blocked || injectedFailure;
    return {
      ...route,
      status: failed ? 'failed' : 'succeeded',
      step: failed ? 'failed' : 'completed',
      message: blocked ? 'Mock monitor shutdown blocked by active obligations; deposits remain OFF.' : injectedFailure
        ? 'Mock isolated route failure; other rows continue.'
        : unsupported ? 'Mock readiness: route unsupported; other routes continue.' : permissionFailure
        ? 'Mock address permission was rejected; deposits remain OFF.'
        : 'Mock provider verified; original deposit state restored.',
      errorCode: blocked ? 'RPC_MONITORING_OBLIGATIONS_ACTIVE' : injectedFailure ? 'MOCK_ROUTE_FAILURE' : unsupported ? 'WHITEBIT_ROUTE_UNSUPPORTED' : permissionFailure ? 'WHITEBIT_PERMISSION_REJECTED' : null,
      customerDepositsEnabled: blocked || injectedFailure ? false
        : job.depositProvider === 'manual' && Boolean(job.monitoring?.rpcMonitoring === 'disable' || job.monitoring?.networkMonitor === 'disable' || job.monitoring?.assetMonitoring === 'disable')
          ? false : route.originalCustomerDepositsEnabled && !failed,
      savedProvider: failed ? 'manual' : job.depositProvider,
      ...(blocked ? { rpcStatus: 'BLOCKED' as const, monitoringMessage: 'Monitoring was not disabled; route requires retry.' } : {}),
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
      await page.screenshot({ path: path.resolve(process.cwd(), `test-results/bulk-provider-switch-${viewport.width}.png`), fullPage: true });
    });
  }

  test('monitoring selectors default to auto, invalidate review, and persist the exact monitoring intent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page);
    const dialog = await openBulkDialog(page, ['btc-bitcoin']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    const rpc = dialog.getByTestId('bulk-rpc-monitoring-control');
    const network = dialog.getByTestId('bulk-network-monitor-control');
    const asset = dialog.getByTestId('bulk-asset-monitor-control');
    await expect(rpc).toHaveValue('auto');
    await expect(network).toHaveValue('auto');
    await expect(asset).toHaveValue('auto');
    await expect(network.locator('option[value="auto"]')).toHaveText('Follow RPC Monitoring');
    await expect(asset.locator('option[value="auto"]')).toHaveText('Follow RPC Monitoring');
    for (const control of [rpc, network, asset]) {
      for (const value of ['auto', 'enable', 'disable', 'keep']) {
        await control.selectOption(value);
        await expect(control).toHaveValue(value);
      }
    }
    await rpc.selectOption('auto');
    await network.selectOption('auto');
    await asset.selectOption('auto');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-monitoring-review')).toContainText('Automatic (Manual Wallet)');
    await rpc.selectOption('keep');
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toBeVisible();
    await network.selectOption('enable');
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toBeVisible();
    await asset.selectOption('disable');
    await expect(dialog.getByTestId('bulk-deposit-provider-review')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-monitoring-review')).toContainText('Keep Current Settings');
    await expect(dialog.getByTestId('bulk-monitoring-review')).toContainText('Network Monitor: Enable');
    await expect(dialog.getByTestId('bulk-monitoring-review')).toContainText('Asset Monitoring: Disable');
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 0 failed');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bulk-deposit-switch:bulk-owner-e2e') || 'null'));
    const expected = { rpcMonitoring: 'keep', networkMonitor: 'enable', assetMonitoring: 'disable' };
    expect(fixture.creates[0].monitoring).toEqual(expected);
    expect(stored.request.monitoring).toEqual(expected);
  });

  test('Manual automatic monitoring enables RPC and both monitors and reports verified final state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page);
    const dialog = await openBulkDialog(page, ['btc-bitcoin']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByTestId('bulk-monitoring-review')).toContainText('Automatic (Manual Wallet)');
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 0 failed');
    expect(fixture.creates[0].monitoring).toEqual({ rpcMonitoring: 'auto', networkMonitor: 'auto', assetMonitoring: 'auto' });
    await expect(dialog.getByTestId('bulk-result-rpc-status-btc-bitcoin')).toContainText('ACTIVE');
    await expect(dialog.getByTestId('bulk-result-rpc-tracking-btc-bitcoin')).toContainText('Enabled');
    await expect(dialog.getByTestId('bulk-result-network-monitor-btc-bitcoin')).toContainText('Enabled');
    await expect(dialog.getByTestId('bulk-result-asset-monitoring-btc-bitcoin')).toContainText('Enabled');
    await expect(dialog.getByTestId('bulk-result-deposits-btc-bitcoin')).toContainText('Customer Deposits: ON');
  });

  test('WhiteBIT automatic monitoring turns off unnecessary polling and retains obligations/shared Manual requirements', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page, {
      obligations: ['usdt-trc20'], sharedManualNetworkIds: ['usdt-erc20'], skipWhitebitFailures: true,
    });
    const dialog = await openBulkDialog(page, ['btc-bitcoin', 'usdt-trc20', 'usdt-erc20']);
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await dialog.getByTestId('bulk-deposit-switch-consent').check();
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('3 succeeded, 0 failed');
    expect(fixture.creates[0].monitoring).toEqual({ rpcMonitoring: 'auto', networkMonitor: 'auto', assetMonitoring: 'auto' });
    await expect(dialog.getByTestId('bulk-result-rpc-status-btc-bitcoin')).toContainText('OFF');
    await expect(dialog.getByTestId('bulk-result-network-monitor-btc-bitcoin')).toContainText('Disabled');
    await expect(dialog.getByTestId('bulk-result-rpc-status-usdt-trc20')).toContainText('PRESERVED_FOR_OBLIGATIONS');
    await expect(dialog.getByTestId('bulk-result-monitoring-message-usdt-trc20')).toContainText('independent obligations');
    await expect(dialog.getByTestId('bulk-result-rpc-status-usdt-erc20')).toContainText('PRESERVED_FOR_OBLIGATIONS');
    await expect(dialog.getByTestId('bulk-result-monitoring-message-usdt-erc20')).toContainText('Shared Network Monitor retained');
  });

  test('explicit Manual monitoring disable is a successful safe configuration, not verified RPC', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page);
    const dialog = await openBulkDialog(page, ['btc-bitcoin']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    await dialog.getByTestId('bulk-rpc-monitoring-control').selectOption('disable');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 0 failed');
    expect(fixture.creates[0].monitoring).toEqual({ rpcMonitoring: 'disable', networkMonitor: 'auto', assetMonitoring: 'auto' });
    await expect(dialog.getByTestId('bulk-result-rpc-status-btc-bitcoin')).toContainText('OFF');
    await expect(dialog.getByTestId('bulk-result-rpc-tracking-btc-bitcoin')).toContainText('Disabled');
    await expect(dialog.getByTestId('bulk-result-deposits-btc-bitcoin')).toContainText('Customer Deposits: OFF');
    await expect(dialog.getByTestId('bulk-result-monitoring-message-btc-bitcoin')).toContainText('intentionally disabled');
    await expect(dialog.getByTestId('bulk-result-monitoring-message-btc-bitcoin')).toContainText('RPC not verified');
  });

  test('protected monitoring failure, independent route failure and success; retry changes only its row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page, {
      blockedNetworkIds: ['usdt-trc20'], obligations: ['usdt-trc20'], failedNetworkIds: ['btc-bitcoin'],
    });
    const dialog = await openBulkDialog(page, ['btc-bitcoin', 'usdt-trc20', 'usdt-erc20']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    await dialog.getByTestId('bulk-network-monitor-control').selectOption('disable');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('1 succeeded, 2 failed');
    const protectedRow = dialog.getByTestId('bulk-deposit-switch-route-usdt-trc20');
    await expect(protectedRow).toContainText('RPC_MONITORING_OBLIGATIONS_ACTIVE');
    await expect(protectedRow).toContainText('Customer Deposits: OFF');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-btc-bitcoin')).toContainText('MOCK_ROUTE_FAILURE');
    const successRow = dialog.getByTestId('bulk-deposit-switch-route-usdt-erc20');
    await expect(successRow).toContainText('succeeded');
    await expect(successRow).toContainText('Saved provider: Manual Wallet');
    await page.once('dialog', d => d.accept());
    await protectedRow.getByTestId('button-retry-route-usdt-trc20').click();
    await expect.poll(() => fixture.retries.length).toBe(1);
    expect(fixture.retries[0]).toEqual({ networkId: 'usdt-trc20', confirmRealAddressCreation: true });
    await expect(dialog.getByTestId('bulk-deposit-switch-summary')).toContainText('2 succeeded, 1 failed');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-usdt-trc20')).toContainText('succeeded');
    await expect(dialog.getByTestId('bulk-deposit-switch-route-btc-bitcoin')).toContainText('MOCK_ROUTE_FAILURE');
    await expect(successRow).toContainText('Saved provider: Manual Wallet');
  });

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
    const fixture = await installFixtures(page, { unconfiguredNetworkIds: ['usdt-erc20'] });
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
    expect(fixture.creates[1].monitoring).toEqual({ rpcMonitoring: 'auto', networkMonitor: 'auto', assetMonitoring: 'auto' });
    await expect(dialog.getByTestId('bulk-result-rpc-status-usdt-erc20')).toContainText('NOT_CONFIGURED');
    await expect(dialog.getByTestId('bulk-result-network-monitor-usdt-erc20')).toContainText('Unknown');
    await expect(dialog.getByTestId('bulk-result-asset-monitoring-usdt-erc20')).toContainText('Unknown');
  });

  test('failed POST retains operation ID and retries same request after reload without duplicate creation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const fixture = await installFixtures(page, { failedPostOnce: true, lostGetOnce: true });
    const dialog = await openBulkDialog(page, ['usdt-erc20']);
    await dialog.getByTestId('bulk-deposit-provider-target').selectOption('manual');
    await dialog.getByTestId('bulk-rpc-monitoring-control').selectOption('keep');
    await dialog.getByTestId('bulk-network-monitor-control').selectOption('enable');
    await dialog.getByTestId('bulk-asset-monitor-control').selectOption('disable');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await dialog.getByTestId('button-bulk-deposit-confirm').click();
    await expect(dialog.getByRole('alert')).toContainText('Mock create response lost');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bulk-deposit-switch:bulk-owner-e2e') || 'null'));
    expect(saved.operationId).toBeTruthy();
    expect(saved.request.monitoring).toEqual({ rpcMonitoring: 'keep', networkMonitor: 'enable', assetMonitoring: 'disable' });
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
    expect(fixture.creates[1].monitoring).toEqual(saved.request.monitoring);
    await expect(resumed.getByTestId('bulk-deposit-switch-summary')).toBeVisible();
    expect(fixture.gets).toContain(saved.operationId);
  });
});
