import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const now = '2026-08-26T00:00:00.000Z';
const networks: any[] = [
  { id: 'bnb-bep20', assetId: 'bnb', networkCode: 'BEP20', networkName: 'BNB Smart Chain', enabled: true, customerDepositsEnabled: false, requiresMemo: false, depositProvider: 'manual' },
  { id: 'usdt-bep20', assetId: 'usdt', networkCode: 'BEP20', networkName: 'BNB Smart Chain', enabled: true, customerDepositsEnabled: false, requiresMemo: false, depositProvider: 'manual' },
  { id: 'usdc-bep20', assetId: 'usdc', networkCode: 'BEP20', networkName: 'BNB Smart Chain', enabled: true, customerDepositsEnabled: false, requiresMemo: false, depositProvider: 'manual' },
  { id: 'usdt-erc20', assetId: 'usdt', networkCode: 'ERC20', networkName: 'Ethereum', enabled: true, customerDepositsEnabled: false, requiresMemo: true, depositProvider: 'whitebit' },
].map(row => ({ ...row, decimals: 6, createdAt: now, updatedAt: now }));
const assets = [
  { id: 'bnb', code: 'BNB', name: 'BNB', decimals: 6, enabled: true, createdAt: now, updatedAt: now },
  { id: 'usdt', code: 'USDT', name: 'Tether', decimals: 6, enabled: true, createdAt: now, updatedAt: now },
  { id: 'usdc', code: 'USDC', name: 'USD Coin', decimals: 6, enabled: true, createdAt: now, updatedAt: now },
];
const address = `0x${'a'.repeat(120)}`;

async function fixture(page: Page, role: 'owner' | 'operator' = 'owner') {
  const saved: any[] = [];
  const previews: any[] = [];
  const saveBodies: any[] = [];
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/admin/authorization', r => r.fulfill(json({
    member: { id: `wallet-${role}`, email: `${role}@example.test`, role, status: 'active' },
    owner: role === 'owner', effectivePermissions: role === 'owner' ? [] : ['crypto_networks.view', 'crypto_networks.manage', 'crypto_assets.view'], catalog: [],
  })));
  await page.route('**/api/admin/operators', r => r.fulfill(json([])));
  await page.route('**/api/admin/crypto-assets', r => r.fulfill(json(assets)));
  await page.route('**/api/admin/crypto-networks', r => r.fulfill(json(networks.map(n => saved.find(s => s.id === n.id) ?? n))));
  await page.route('**/api/admin/deposit-providers', r => r.fulfill(json([{ id: 'manual', label: 'Manual Wallet', implemented: true }, { id: 'whitebit', label: 'WhiteBIT', implemented: true }])));
  await page.route('**/api/admin/providers/whitebit', r => r.fulfill(json({ provider: 'whitebit', configured: true, credentialsConfigured: true, credentialsVerified: true, state: 'healthy' })));
  await page.route('**/api/admin/providers/whitebit/verification-routes', r => r.fulfill(json([])));
  await page.route('**/api/admin/fiat-currencies', r => r.fulfill(json([])));
  await page.route('**/api/admin/payment-methods', r => r.fulfill(json([])));
  await page.route('**/api/admin/fiat-currency-payment-methods', r => r.fulfill(json([])));
  await page.route('**/api/admin/providers/oneforge', r => r.fulfill(json({ provider: '1Forge', configured: true, state: 'healthy', rates: [] })));
  await page.route('**/api/exchange/config', r => r.fulfill(json({ assets: [], fiatCurrencies: [], manualSettlementOptions: [], instantSettlementOptions: [] })));
  await page.route('**/api/admin/crypto-networks/receiving-wallet/preview', async r => {
    const body = r.request().postDataJSON(); previews.push(body);
    if (!body.walletAddress) return r.fulfill(json({ message: 'Receiving wallet address is required.' }, 400));
    if (body.networkIds.includes('usdt-erc20') && !body.memo) return r.fulfill(json({ message: 'Memo or tag is required for this route.' }, 400));
    return r.fulfill(json(body.networkIds.map((id: string) => {
      const n = networks.find(x => x.id === id)!;
      const status = id === 'usdt-erc20' ? 'STANDBY' : 'PLANNED';
      return { ...n, sharedDepositAddress: body.walletAddress, sharedDepositMemo: body.memo, customerDepositsEnabled: false,
        manualWalletRegistration: { status, ready: false, address: body.walletAddress, message: status === 'STANDBY' ? 'WhiteBIT route registered on standby.' : 'RPC registration will be checked on Save.', targetId: null, monitorNetworkId: null, monitorAssetId: null, sharedRouteCount: id.endsWith('bep20') ? 3 : 1 } };
    })));
  });
  await page.route('**/api/admin/crypto-networks/receiving-wallet', async r => {
    if (r.request().method() !== 'PUT') return r.fallback();
    const body = r.request().postDataJSON();
    saveBodies.push(body);
    const result = body.networkIds.map((id: string) => {
      const n = networks.find(x => x.id === id)!;
      const status = id === 'usdt-erc20' ? 'STANDBY' : id === 'usdc-bep20' ? 'BLOCKED' : 'READY';
      const row = { ...n, sharedDepositAddress: body.walletAddress, sharedDepositMemo: body.memo,
        customerDepositsEnabled: status === 'READY' && body.enabled,
        manualWalletRegistration: { status, ready: status === 'READY', address: body.walletAddress, message: status === 'BLOCKED' ? 'Exact RPC monitor configuration is missing.' : status === 'STANDBY' ? 'WhiteBIT registered; no additional polling.' : 'RPC registration verified.', targetId: status === 'READY' ? 'target-bep20' : null, monitorNetworkId: status === 'READY' ? 'bsc' : null, monitorAssetId: status === 'READY' ? 'token-contract' : null, sharedRouteCount: id.endsWith('bep20') ? 3 : 1 } };
      const i = saved.findIndex(x => x.id === id); if (i >= 0) saved[i] = row; else saved.push(row);
      return row;
    });
    return r.fulfill(json(result));
  });
  return { saved, previews, saveBodies };
}

async function openWallet(page: Page, ids: string[]) {
  await page.goto('/admin/currencies');
  await page.getByRole('button', { name: /Crypto Networks/ }).click();
  await expect(page.getByRole('heading', { name: 'Crypto Networks' })).toBeVisible();
  const labelIndexes: Record<string, number> = { 'bnb-bep20': 0, 'usdt-bep20': 1, 'usdc-bep20': 2, 'usdt-erc20': 0 };
  const labels: Record<string, string> = { 'bnb-bep20': 'Select BNB Smart Chain for catalog actions', 'usdt-bep20': 'Select BNB Smart Chain for catalog actions', 'usdc-bep20': 'Select BNB Smart Chain for catalog actions', 'usdt-erc20': 'Select Ethereum for catalog actions' };
  for (const id of ids) {
    await page.getByLabel(labels[id]).nth(labelIndexes[id]).check();
  }
  await page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Set Wallet Address' }).click();
  return page.getByTestId('bulk-network-wallet-dialog');
}

test.describe('Manual/RPC registration through bulk Set Wallet Address', () => {
  for (const viewport of [{ width: 1440, name: 'desktop' }, { width: 390, name: 'mobile' }]) {
    test(`${viewport.name}: review, invalidation, exact payload, outcomes, and persisted drawer metadata`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      const f = await fixture(page);
      const dialog = await openWallet(page, ['bnb-bep20', 'usdt-bep20', 'usdc-bep20', 'usdt-erc20']);
      await expect(dialog.getByTestId('bulk-network-wallet-address')).toBeVisible();
      await expect(page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: /Manage RPC/i })).toHaveCount(0);
      await dialog.getByTestId('bulk-network-wallet-address').fill(address);
      await dialog.getByTestId('bulk-network-wallet-memo').fill('TAG-731');
      await dialog.getByTestId('bulk-network-customer-deposits').check();
      await dialog.getByRole('button', { name: 'Review Changes' }).click();
      await expect(dialog.getByText(/PLANNED/).first()).toBeVisible();
      await expect(dialog.getByText(/only after live RPC verification/i)).toBeVisible();
      expect(f.previews[0]).toEqual({ networkIds: ['bnb-bep20', 'usdt-bep20', 'usdc-bep20', 'usdt-erc20'], walletAddress: address, memo: 'TAG-731', preserveDepositProviders: true, registerManualMonitoring: true, enabled: true });
      await dialog.getByTestId('bulk-network-wallet-memo').fill('TAG-732');
      await expect(dialog.getByText(/PLANNED/).first()).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Review Changes' }).click();
      await dialog.getByRole('button', { name: 'Confirm Apply' }).click();
      await expect(dialog.getByTestId('wallet-registration-bnb-bep20')).toContainText('READY');
      await expect(dialog.getByTestId('wallet-registration-usdt-bep20')).toContainText('3 asset routes');
      await expect(dialog.getByTestId('wallet-registration-usdc-bep20')).toContainText('BLOCKED');
      await expect(dialog.getByTestId('wallet-registration-usdc-bep20')).toContainText('Exact RPC monitor configuration is missing.');
      await expect(dialog.getByTestId('wallet-registration-usdt-erc20')).toContainText('STANDBY');
      await expect(dialog.getByTestId('wallet-registration-usdt-erc20')).not.toContainText('Shared by');
      expect(f.saved.length).toBe(4);
      expect(f.saveBodies[0]).toEqual({ networkIds: ['bnb-bep20', 'usdt-bep20', 'usdc-bep20', 'usdt-erc20'], walletAddress: address, memo: 'TAG-732', preserveDepositProviders: true, registerManualMonitoring: true, enabled: true });
      await page.screenshot({ path: path.resolve(process.cwd(), `test-results/manual-wallet-registration-${viewport.width}.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Done' }).click();
      await expect(dialog).toHaveCount(0);
      await page.getByLabel('Select BNB Smart Chain for catalog actions').nth(0).check();
      await page.getByLabel('Select BNB Smart Chain for catalog actions').nth(1).check();
      await page.getByLabel('Select BNB Smart Chain for catalog actions').nth(2).check();
      await page.getByLabel('Select Ethereum for catalog actions').check();
      await page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Set Wallet Address' }).click();
      const reopened = page.getByTestId('bulk-network-wallet-dialog');
      await expect(reopened).toBeVisible();
      await reopened.getByRole('button', { name: 'Close Set Wallet Address' }).click();
      await expect(reopened).toHaveCount(0);
      await page.reload();
      await page.getByRole('button', { name: /Crypto Networks/ }).click();
      await expect(page.getByTestId('network-wallet-registration-bnb-bep20')).toContainText(address);
      await expect(page.getByTestId('network-wallet-registration-bnb-bep20')).toContainText('READY');
      await expect(page.getByTestId('network-wallet-registration-usdt-erc20')).toContainText('STANDBY');
      await expect(page.getByTestId('network-wallet-registration-usdt-erc20')).not.toContainText('3 shared routes');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('WhiteBIT is standby, Owner-only toolbar, and memo validation is surfaced', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const f = await fixture(page);
    const dialog = await openWallet(page, ['usdt-erc20']);
    await dialog.getByTestId('bulk-network-wallet-address').fill('0x1234567890');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(page.getByTestId('admin-action-toast')).toContainText('Memo or tag is required for this route.');
    await dialog.getByTestId('bulk-network-wallet-memo').fill('tag');
    await dialog.getByRole('button', { name: 'Review Changes' }).click();
    await expect(dialog.getByText(/STANDBY/).first()).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm Apply' }).click();
    await expect(dialog.getByTestId('wallet-registration-usdt-erc20')).toContainText('STANDBY');
    await expect(dialog.getByTestId('wallet-registration-usdt-erc20')).toContainText('no additional polling');
    expect(f.previews.at(-1)).toMatchObject({ registerManualMonitoring: true, preserveDepositProviders: true, memo: 'tag' });
    expect(f.saveBodies[0]).toEqual({ networkIds: ['usdt-erc20'], walletAddress: '0x1234567890', memo: 'tag', preserveDepositProviders: true, registerManualMonitoring: true, enabled: false });
    await dialog.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    await page.getByRole('button', { name: /Crypto Networks/ }).click();
    await page.getByLabel('Select Ethereum for catalog actions').check();
    await expect(page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Set Wallet Address' })).toBeVisible();
  });

  test('non-Owner does not get the Set Wallet Address action', async ({ page }) => {
    await fixture(page, 'operator');
    await page.goto('/admin/currencies');
    await page.getByRole('button', { name: /Crypto Networks/ }).click();
    await page.getByLabel('Select Ethereum for catalog actions').check();
    await expect(page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Set Wallet Address' })).toHaveCount(0);
  });
});
