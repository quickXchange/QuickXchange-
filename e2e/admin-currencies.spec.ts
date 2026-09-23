import { expect, test } from '@playwright/test';

const now = '2026-08-26T00:00:00.000Z';
const usd = { id: '00000000-0000-4000-8000-000000000001', code: 'USD', name: 'US Dollar', precision: 2, lifecycle: 'active', regions: ['North America'], countries: ['US'], enabled: true, createdAt: now, updatedAt: now };
const eur = { id: '00000000-0000-4000-8000-000000000004', code: 'EUR', name: 'Euro', precision: 2, lifecycle: 'active', regions: ['North America'], countries: [], enabled: true, createdAt: now, updatedAt: now };

test('operators manage fiat currencies, reusable methods, and their attachments', async ({ page }) => {
  let currencies = [usd, eur];
  let methods = [{
    id: 'bank-transfer', name: 'Bank transfer', description: null, instructions: null,
    enabled: true, canSend: true, canReceive: true, fieldDefinitions: [], createdAt: now, updatedAt: now,
  }];
  let attachments: Array<Record<string, unknown>> = [];
  let cryptoAssets = [{
    id: 'btc', code: 'BTC', name: 'Bitcoin', decimals: 8, enabled: true,
    createdAt: now, updatedAt: now,
  }, {
    id: 'usdt', code: 'USDT', name: 'Tether', decimals: 6, enabled: true,
    createdAt: now, updatedAt: now,
  }];
  let cryptoNetworks = [{
    id: 'btc-bitcoin', assetId: 'btc', networkCode: 'BTC', networkName: 'Bitcoin',
    decimals: 8, enabled: true, customerDepositsEnabled: false,
    requiresMemo: false, requiredConfirmations: 2, confirmationGuidance: null,
    explorerUrlTemplate: null, depositInstructions: null, depositWarning: null,
    sharedDepositAddress: '', sharedDepositMemo: null, createdAt: now, updatedAt: now,
  }, {
    id: 'usdt-trc20', assetId: 'usdt', networkCode: 'TRC20', networkName: 'TRON',
    decimals: 6, enabled: true, customerDepositsEnabled: false,
    requiresMemo: false, requiredConfirmations: 20, confirmationGuidance: null,
    explorerUrlTemplate: null, depositInstructions: null, depositWarning: null,
    sharedDepositAddress: '', sharedDepositMemo: null, createdAt: now, updatedAt: now,
  }, {
    id: 'usdt-erc20', assetId: 'usdt', networkCode: 'ERC20', networkName: 'Ethereum',
    decimals: 6, enabled: true, customerDepositsEnabled: false,
    requiresMemo: false, requiredConfirmations: 12, confirmationGuidance: null,
    explorerUrlTemplate: null, depositInstructions: null, depositWarning: null,
    sharedDepositAddress: '', sharedDepositMemo: null, createdAt: now, updatedAt: now,
  }];

  await page.route('**/api/admin/fiat-currencies', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      const created = { ...data, id: '00000000-0000-4000-8000-000000000002', createdAt: now, updatedAt: now };
      currencies = [...currencies, created];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(currencies) });
  });
  await page.route('**/api/admin/fiat-currencies/*', async route => {
    const id = route.request().url().split('/').at(-1);
    if (route.request().method() === 'DELETE') {
      currencies = currencies.filter(currency => currency.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    const data = route.request().postDataJSON();
    currencies = currencies.map(currency => currency.id === id ? { ...currency, ...data, updatedAt: now } : currency);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(currencies.find(currency => currency.id === id)) });
  });
  await page.route('**/api/admin/payment-methods', async route => {
    if (route.request().method() === 'POST') {
      const data = route.request().postDataJSON();
      const created = {
        ...data,
        logoUrl: data.logoObjectPath ? `/api/storage${data.logoObjectPath}` : undefined,
        createdAt: now,
        updatedAt: now,
      };
      methods = [...methods, created];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(methods) });
  });
  await page.route('**/api/admin/payment-methods/*', async route => {
    const id = route.request().url().split('/').at(-1);
    if (route.request().method() === 'DELETE') {
      methods = methods.filter(method => method.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    const data = route.request().postDataJSON();
    methods = methods.map(method => method.id === id ? {
      ...method,
      ...data,
      logoUrl: data.logoObjectPath ? `/api/storage${data.logoObjectPath}` : undefined,
      updatedAt: now,
    } : method);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(methods.find(method => method.id === id)) });
  });
  const uploadedLogoPath = '/objects/payment-method-logos/00000000-0000-4000-8000-000000000099';
  const uploadedLogoSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#2563eb"/></svg>';
  await page.route('**/api/admin/payment-methods/logo-upload', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      uploadURL: `${new URL(route.request().url()).origin}/test-payment-method-logo-upload`,
      objectPath: uploadedLogoPath,
    }),
  }));
  await page.route('**/test-payment-method-logo-upload', route => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/storage/objects/payment-method-logos/00000000-0000-4000-8000-000000000099', route =>
    route.fulfill({ contentType: 'image/svg+xml', body: uploadedLogoSvg }));
  await page.route('**/api/admin/fiat-currency-payment-methods', async route => {
    if (route.request().method() === 'POST') {
      const created = { ...route.request().postDataJSON(), id: '00000000-0000-4000-8000-000000000003', createdAt: now, updatedAt: now };
      attachments = [...attachments, created];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(attachments) });
  });
  await page.route('**/api/admin/fiat-currency-payment-methods/bulk/preview', async route => {
    const data = route.request().postDataJSON();
    const targets = data.region
      ? currencies.filter(currency => currency.regions?.includes(data.region))
      : currencies.filter(currency => data.currencyIds.includes(currency.id));
    const method = methods.find(candidate => candidate.id === data.paymentMethodId)!;
    const items = targets.map(currency => {
      const existing = attachments.find(attachment =>
        attachment.fiatCurrencyId === currency.id && attachment.paymentMethodId === data.paymentMethodId);
      const conflict = data.action === 'attach' ? Boolean(existing) : !existing;
      const send = data.overrides?.canSend ?? existing?.canSend ?? method.canSend;
      const receive = data.overrides?.canReceive ?? existing?.canReceive ?? method.canReceive;
      return {
        fiatCurrencyId: currency.id,
        currencyCode: currency.code,
        currencyName: currency.name,
        attachmentId: existing?.id ?? null,
        expectedUpdatedAt: existing?.updatedAt ?? null,
        effect: conflict ? 'conflict' : data.action === 'attach' ? 'attach' : 'update',
        direction: send && receive ? 'both' : send ? 'send' : receive ? 'receive' : 'none',
        minAmount: data.overrides?.minAmount ?? existing?.minAmount ?? null,
        maxAmount: data.overrides?.maxAmount ?? existing?.maxAmount ?? null,
        ...(conflict ? { conflictCode: 'PAYMENT_METHOD_ATTACHMENT_EXISTS', conflictMessage: 'This payment method is already attached.' } : {}),
      };
    });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      paymentMethodId: data.paymentMethodId,
      action: data.action,
      affectedCount: items.filter(item => item.effect !== 'conflict').length,
      conflictCount: items.filter(item => item.effect === 'conflict').length,
      items,
    }) });
  });
  await page.route('**/api/admin/fiat-currency-payment-methods/bulk/apply', async route => {
    const data = route.request().postDataJSON();
    const results = data.items.map((item: { fiatCurrencyId: string; expectedUpdatedAt: string | null }) => {
      const existing = attachments.find(attachment =>
        attachment.fiatCurrencyId === item.fiatCurrencyId && attachment.paymentMethodId === data.paymentMethodId);
      if (existing) return { fiatCurrencyId: item.fiatCurrencyId, success: false, code: 'PAYMENT_METHOD_ATTACHMENT_CONFLICT', message: 'Attachment changed after review.' };
      const attachment = {
        id: item.fiatCurrencyId === eur.id ? '00000000-0000-4000-8000-000000000005' : '00000000-0000-4000-8000-000000000006',
        fiatCurrencyId: item.fiatCurrencyId,
        paymentMethodId: data.paymentMethodId,
        enabled: true,
        ...data.overrides,
        createdAt: now,
        updatedAt: now,
      };
      attachments.push(attachment);
      return { fiatCurrencyId: item.fiatCurrencyId, success: true, attachment };
    });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results }) });
  });
  await page.route('**/api/admin/providers/oneforge', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ provider: '1Forge', configured: true, state: 'healthy', fetchedAt: now, ageMs: 4000, rates: [{ currency: 'USD', unitsPerUsd: '1' }, { currency: 'EUR', unitsPerUsd: '0.85' }] }) }));
  await page.route('**/api/exchange/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    assets: [
      { id: 'btc', code: 'BTC', name: 'Bitcoin', networks: ['BTC'] },
      { id: 'usdt', code: 'USDT', name: 'Tether', networks: ['TRC20', 'ERC20'] },
    ],
    manualSettlementOptions: [
      { id: 'crypto:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', routeNetwork: 'BTC', kind: 'crypto-network', title: 'Bitcoin', networkTitle: 'Bitcoin', direction: 'both', logoUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
      { id: 'crypto:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Tether', networkTitle: 'TRON', direction: 'both', logoUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
      { id: 'crypto:usdt-erc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'ERC20', kind: 'crypto-network', title: 'Tether', networkTitle: 'Ethereum', direction: 'both', logoUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' },
    ],
    instantSettlementOptions: [],
  }) }));
  await page.route('**/api/admin/crypto-assets', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(cryptoAssets) }));
  await page.route('**/api/admin/crypto-assets/*', async route => {
    const id = route.request().url().split('/').at(-1);
    if (route.request().method() === 'DELETE') {
      cryptoAssets = cryptoAssets.filter(asset => asset.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    const data = route.request().postDataJSON();
    cryptoAssets = cryptoAssets.map(asset => asset.id === id ? { ...asset, ...data, updatedAt: now } : asset);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(cryptoAssets.find(asset => asset.id === id)) });
  });
  await page.route('**/api/admin/crypto-networks', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(cryptoNetworks) }));
  await page.route('**/api/admin/crypto-networks/*', async route => {
    const id = route.request().url().split('/').at(-1);
    if (route.request().method() === 'DELETE') {
      cryptoNetworks = cryptoNetworks.filter(network => network.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    const data = route.request().postDataJSON();
    cryptoNetworks = cryptoNetworks.map(network => network.id === id ? { ...network, ...data, updatedAt: now } : network);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(cryptoNetworks.find(network => network.id === id)) });
  });

  await page.goto('/admin/currencies');
  await expect(page.getByRole('heading', { name: 'Currencies & Payment Methods' })).toBeVisible();
  await expect(page.getByText(/USD\s*→\s*EUR/)).toBeVisible();
  const adminFlag = page.locator('.fiat-currency-flag-admin:visible').first();
  await expect(adminFlag).toBeVisible();
  const adminFlagGeometry = await adminFlag.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const imageStyles = getComputedStyle(element.querySelector('img')!);
    return {
      width: box.width,
      height: box.height,
      minWidth: styles.minWidth,
      minHeight: styles.minHeight,
      aspectRatio: styles.aspectRatio,
      borderRadius: styles.borderRadius,
      overflow: styles.overflow,
      flexShrink: styles.flexShrink,
      backgroundColor: styles.backgroundColor,
      imageWidth: imageStyles.width,
      imageHeight: imageStyles.height,
      imageObjectFit: imageStyles.objectFit,
      imageObjectPosition: imageStyles.objectPosition,
      imageDisplay: imageStyles.display,
    };
  });
  expect(adminFlagGeometry).toMatchObject({
    width: 32,
    height: 32,
    minWidth: '32px',
    minHeight: '32px',
    aspectRatio: '1 / 1',
    borderRadius: '50%',
    overflow: 'hidden',
    flexShrink: '0',
    backgroundColor: 'rgba(241, 244, 248, 0.42)',
    imageWidth: '30px',
    imageHeight: '30px',
    imageObjectFit: 'cover',
    imageObjectPosition: '50% 50%',
    imageDisplay: 'block',
  });
  const catalogSearch = page.getByTestId('input-catalog-search');
  await catalogSearch.fill('  DOLL  ');
  await expect(page.getByTestId('button-edit-currency-USD')).toBeVisible();
  await expect(page.getByTestId('button-edit-currency-EUR')).toHaveCount(0);
  await page.getByTestId('input-catalog-search-clear').click();
  await expect(catalogSearch).toHaveValue('');
  await expect(page.getByTestId('input-currency-network')).toHaveCount(0);
  await expect(page.getByTestId('input-currency-precision')).toHaveCount(0);
  await page.getByTestId('button-add-currency').click();
  await page.getByTestId('input-currency-code').fill('cad');
  await page.getByTestId('input-currency-name').fill('Canadian Dollar');
  await page.getByTestId('button-save-currency').click();
  await expect(page.getByText('Canadian Dollar')).toBeVisible();

  await page.getByRole('button', { name: /Payment Methods/ }).click();
  await page.getByTestId('button-add-method').click();
  for (const testId of ['input-pm-enabled', 'input-pm-send', 'input-pm-recv']) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box?.width).toBeLessThanOrEqual(24);
    expect(box?.height).toBeLessThanOrEqual(24);
  }
  await expect(page.getByTestId('input-pm-logo')).toBeEnabled();
  await page.getByTestId('input-pm-id').fill('interac');
  await page.getByTestId('input-pm-name').fill('Interac e-Transfer');
  await page.getByTestId('input-pm-logo').setInputFiles(
    'artifacts/crypto-exchange-widget/public/brand/quickxchange-mark.png',
  );
  await expect(page.getByRole('button', { name: 'Upload Logo upload' })).toContainText('Replace');
  await page.getByTestId('button-add-field-receive').click();
  await page.getByTestId('menu-add-receive-email').click();
  await page.getByTestId('button-save-pm').click();
  await expect(page.getByText('Interac e-Transfer').first()).toBeVisible();
  expect((methods.find(method => method.id === 'interac') as any)?.logoObjectPath).toBe(uploadedLogoPath);
  const savedMethodRow = page.locator('tr', { hasText: 'Interac e-Transfer' });
  await expect(savedMethodRow.locator('img')).toHaveAttribute('src', `/api/storage${uploadedLogoPath}`);
  await catalogSearch.fill('  e-TrAn  ');
  await expect(page.getByTestId('button-edit-method-interac')).toBeVisible();
  await page.getByTestId('input-catalog-search-clear').click();
  await page.getByTestId('button-edit-method-interac').click();
  await page.getByTestId('button-save-pm').click();
  expect((methods.find(method => method.id === 'interac') as any)?.logoObjectPath).toBe(uploadedLogoPath);

  await page.getByRole('button', { name: /Currencies/ }).click();
  await page.getByTestId('button-edit-currency-USD').click();
  await page.locator('#attach-method-select').selectOption('interac');
  await page.getByRole('button', { name: 'Attach' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit currency' }).getByText('Interac e-Transfer', { exact: true })).toBeVisible();
  expect(attachments[0]).toMatchObject({ fiatCurrencyId: usd.id, paymentMethodId: 'interac', enabled: true });
  await page.getByTestId('button-close-drawer').click();

  await expect(page.getByRole('heading', { name: 'Managed Currencies' })).toBeVisible();
  await expect(page.getByTestId('bulk-payment-panel')).toHaveCount(0);
  await expect(page.getByTestId('catalog-bulk-actions-currencies')).toHaveCount(0);
  await expect(page.getByLabel('Select currency USD for catalog actions')).toBeVisible();
  await expect(page.getByTestId('button-add-currency')).toBeVisible();
  await expect(page.getByTestId('button-edit-currency-USD')).toBeVisible();

  await page.getByRole('button', { name: /Crypto Assets/ }).click();
  await expect(page.getByRole('heading', { name: 'Crypto Assets' })).toBeVisible();
  await expect(page.getByText('Bitcoin').first()).toBeVisible();
  await expect(page.getByLabel('Bitcoin, BTC', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Bitcoin, BTC, on BTC')).toBeVisible();
  await catalogSearch.fill('  TeTh  ');
  await expect(page.getByTestId('button-edit-crypto-asset-usdt')).toBeVisible();
  await expect(page.getByTestId('button-edit-crypto-asset-btc')).toHaveCount(0);
  await page.getByTestId('input-catalog-search-clear').click();
  const assetRow = page.getByTestId('button-edit-crypto-asset-btc').locator('xpath=ancestor::tr');
  await expect(assetRow.locator('.crypto-logo img')).toHaveCount(1);
  await expect(assetRow.locator('.crypto-logo img').first()).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(page.getByLabel('Tether, USDT, on TRC20')).toBeVisible();
  await expect(page.getByLabel('Tether, USDT, on ERC20')).toBeVisible();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: /Crypto Networks/ }).click();
  await expect(page.getByRole('heading', { name: 'Crypto Networks' })).toBeVisible();
  await catalogSearch.fill('  trON  ');
  await expect(page.getByTestId('button-edit-crypto-network-usdt-trc20')).toBeVisible();
  await expect(page.getByTestId('button-edit-crypto-network-btc-bitcoin')).toHaveCount(0);
  await page.getByTestId('input-catalog-search-clear').click();
  await expect(page.getByLabel('Bitcoin, BTC, on BTC')).toBeVisible();
  await expect(page.getByLabel('Tether, USDT, on TRC20')).toBeVisible();
  await expect(page.getByLabel('Tether, USDT, on ERC20')).toBeVisible();
  await expect(page.getByText('Not configured').first()).toBeVisible();

  await page.getByRole('button', { name: /Payment Methods/ }).click();
  await page.getByLabel('Select Bank transfer for catalog actions').check();
  await page.getByTestId('catalog-bulk-actions-methods').getByRole('button', { name: 'Disabled' }).click();

  await page.getByRole('button', { name: /Crypto Assets/ }).click();
  await page.getByLabel('Select BTC for catalog actions').check();
  await page.getByTestId('catalog-bulk-actions-assets').getByRole('button', { name: 'Disabled' }).click();

  await page.getByRole('button', { name: /Crypto Networks/ }).click();
  await page.getByLabel('Select Ethereum for catalog actions').check();
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('catalog-bulk-actions-networks').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('usdt-erc20')).toHaveCount(0);

  await page.getByRole('button', { name: /Crypto Assets/ }).click();
  await page.getByLabel('Select BTC for catalog actions').check();
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('catalog-bulk-actions-assets').getByRole('button', { name: 'Delete' }).click();

  await page.getByRole('button', { name: /Payment Methods/ }).click();
  await page.getByLabel('Select Bank transfer for catalog actions').check();
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('catalog-bulk-actions-methods').getByRole('button', { name: 'Delete' }).click();

  await page.getByRole('button', { name: /Currencies/ }).click();
  await expect(page.getByTestId('button-edit-currency-EUR')).toBeVisible();
});