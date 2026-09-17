import { expect, test } from '@playwright/test';

const now = '2026-08-26T00:00:00.000Z';
const options = [
  { id: 'usd-bank', assetId: 'usd', assetCode: 'USD', kind: 'fiat-payment-method', title: 'Bank transfer', direction: 'send', paymentMethodId: 'bank-transfer', routeNetwork: 'Bank transfer' },
  { id: 'eur-bank', assetId: 'eur', assetCode: 'EUR', kind: 'fiat-payment-method', title: 'SEPA transfer', direction: 'receive', paymentMethodId: 'sepa-transfer', routeNetwork: 'SEPA transfer' },
  { id: 'eur-bunq', assetId: 'eur', assetCode: 'EUR', kind: 'fiat-payment-method', title: 'Bunq', direction: 'receive', paymentMethodId: 'bunq', routeNetwork: 'Bunq' },
  { id: 'btc-bitcoin', assetId: 'btc', assetCode: 'BTC', kind: 'crypto-network', title: 'Bitcoin', networkSlug: 'btc-bitcoin', networkTitle: 'Bitcoin', routeNetwork: 'Bitcoin', direction: 'receive' },
];
const config = {
  assets: [],
  fiatCurrencies: ['USD'],
  settlementOptions: options,
  manualSettlementOptions: options,
  manualRouteAvailability: {
    available: true,
    routes: [
      { sourceSettlementOptionId: 'usd-bank', targetSettlementOptionId: 'eur-bank' },
      { sourceSettlementOptionId: 'usd-bank', targetSettlementOptionId: 'btc-bitcoin' },
    ],
    unavailableMessage: null,
  },
  providers: ['Manual desk'],
  feePercent: 0.6,
};

test('operators use canonical settlement options for pricing, preview, and legacy read-only rules', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  let rules: any[] = [{
    id: '00000000-0000-4000-8000-000000000101', name: 'USD bank to BTC', sourceAsset: null, targetAsset: null, sourceNetwork: null, targetNetwork: null, paymentMethod: null, payoutMethod: null,
    sourceSettlementOptionId: 'USD-BANK', targetSettlementOptionId: 'BTC-BITCOIN', markupBasisPoints: 75, fixedFee: '0.00005', priority: 100, enabled: true, version: 1, specificity: 2, missingSettlementOptionIds: [], createdAt: now, updatedAt: now,
  }, {
    id: '00000000-0000-4000-8000-000000000102', name: 'Legacy route', sourceAsset: 'USD', targetAsset: 'BTC', sourceNetwork: 'Bank transfer', targetNetwork: 'Bitcoin', paymentMethod: 'Bank transfer', payoutMethod: null,
    sourceSettlementOptionId: null, targetSettlementOptionId: null, markupBasisPoints: 60, fixedFee: null, priority: 0, enabled: false, version: 2, specificity: 0, readOnly: true, legacyAmbiguous: true, missingSettlementOptionIds: [], createdAt: now, updatedAt: now,
  }, {
    id: '00000000-0000-4000-8000-000000000103', name: 'ANY to Bunq', sourceAsset: null, targetAsset: 'EUR', sourceNetwork: null, targetNetwork: null, paymentMethod: null, payoutMethod: 'Bunq',
    sourceSettlementOptionId: null, targetSettlementOptionId: 'EUR-BUNQ', markupBasisPoints: 85, fixedFee: '1.00', priority: 90, enabled: true, version: 1, specificity: 1, missingSettlementOptionIds: [], createdAt: now, updatedAt: now,
  }];
  await page.route('**/api/exchange/config', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) }));
  await page.route('**/api/admin/manual-desk-pricing-rules', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      if (input.name === 'Global fallback') {
        expect(input).toMatchObject({
          sourceSettlementOptionId: null,
          targetSettlementOptionId: null,
          sourceAsset: null,
          targetAsset: null,
          sourceNetwork: null,
          targetNetwork: null,
          paymentMethod: null,
          payoutMethod: null,
          markupBasisPoints: 50,
        });
      } else if (input.name === 'Any source to BTC') {
        expect(input).toMatchObject({
          sourceSettlementOptionId: null,
          targetSettlementOptionId: 'btc-bitcoin',
          sourceAsset: null,
          targetAsset: 'BTC',
          sourceNetwork: null,
          targetNetwork: 'Bitcoin',
          paymentMethod: null,
          payoutMethod: null,
          markupBasisPoints: 125,
          fixedFee: '0.0001',
        });
      } else {
        expect(input).toMatchObject({
          sourceSettlementOptionId: 'usd-bank',
          targetSettlementOptionId: 'eur-bank',
          sourceAsset: 'USD',
          targetAsset: 'EUR',
          sourceNetwork: 'Bank transfer',
          targetNetwork: 'SEPA transfer',
          paymentMethod: null,
          payoutMethod: null,
        });
        expect(input.markupBasisPoints).toBe(
          input.name === 'Exact USD to EUR route'
            ? 600
            : input.name === 'Fractional USD to EUR route'
              ? 60
              : -1,
        );
      }
      const created = { ...input, id: `00000000-0000-4000-8000-${String(rules.length + 101).padStart(12, '0')}`, version: 1, specificity: 2, missingSettlementOptionIds: [], createdAt: now, updatedAt: now };
      rules = [...rules, created];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: rules,
        diagnostics: {
          hasEnabledAnyToAnyFallback: rules.some(rule => rule.enabled && !rule.sourceSettlementOptionId && !rule.targetSettlementOptionId && !rule.sourceAsset && !rule.targetAsset && !rule.sourceNetwork && !rule.targetNetwork && !rule.paymentMethod && !rule.payoutMethod),
          orphanRules: [],
          uncoveredRoutes: [],
        },
      }),
    });
  });
  await page.route('**/api/admin/manual-desk-pricing-rules/*', async route => {
    if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').at(-1);
      rules = rules.filter(rule => rule.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    expect(route.request().method()).toBe('PATCH');
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({
      sourceSettlementOptionId: 'usd-bank',
      targetSettlementOptionId: 'btc-bitcoin',
      sourceAsset: 'USD',
      targetAsset: 'BTC',
      markupBasisPoints: 75,
      enabled: false,
      version: 1,
    });
    rules = rules.map(rule => rule.id === rules[0].id
      ? { ...rule, ...input, version: 2, updatedAt: now }
      : rule);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rules[0]) });
  });
  await page.route('**/api/admin/manual-desk-pricing-rules/preview', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(rules[0]) }));
  await page.route('**/api/admin/manual-desk-pricing-rules/quote-preview', async route => {
    const input = route.request().postDataJSON();
    expect(input).toMatchObject({ sourceSettlementOptionId: 'usd-bank', targetSettlementOptionId: 'btc-bitcoin', amount: 1000 });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ quoteId: 'preview', type: 'manual', provider: 'Manual desk', fromAsset: 'USD', fromNetwork: '', toAsset: 'BTC', toNetwork: 'Bitcoin', amount: 1000, grossMarketAmount: 0.02, percentageCommission: 0.00015, fixedCommission: 0.00005, totalFee: 0.0002, fee: 0.0002, receiveAmount: 0.0198, rate: 0.0000198, expiresAt: '2026-08-26T01:00:00.000Z' }) });
  });
  await page.route('**/api/exchange/quote', async route => {
    throw new Error(`Admin pricing preview must not call the customer quote route: ${route.request().url()}`);
  });
  await page.route('**/api/admin/providers/oneforge', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ provider: '1Forge', configured: true, state: 'healthy', fetchedAt: now, ageMs: 3000, rates: [{ currency: 'USD', unitsPerUsd: '1' }] }) }));

  await page.goto('/admin/pricing');
  await expect(page.getByText('USD bank to BTC')).toBeVisible();
  await expect(page.getByTestId('pricing-coverage-summary')).toHaveCount(0);
  await expect(page.locator('#pricing-rule-test-panel')).toHaveCount(1);
  const previewIsBeforeRules = await page.locator('body').evaluate(() => {
    const preview = document.querySelector('#pricing-rule-test-panel');
    const rulesPanel = document.querySelector('.pricing-rules-panel');
    return Boolean(preview && rulesPanel && (preview.compareDocumentPosition(rulesPanel) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(previewIsBeforeRules).toBe(true);
  const [previewBox, rulesPanelBox, sourceSelectorBox, targetSelectorBox, previewButtonBox, sourceLogoBox, routeArrowBox, previewInfoBox, filterBox, addRuleBox, firstRuleBox, editActionBox] = await Promise.all([
    page.locator('#pricing-rule-test-panel').boundingBox(),
    page.locator('.pricing-rules-panel').boundingBox(),
    page.getByTestId('preview-source').boundingBox(),
    page.getByTestId('preview-target').boundingBox(),
    page.getByTestId('button-preview-pricing').boundingBox(),
    page.getByTestId('preview-source').locator('.terminal-option-logo').boundingBox(),
    page.locator('.pricing-preview-arrow').boundingBox(),
    page.getByTestId('pricing-preview-info').boundingBox(),
    page.locator('.pricing-filters .admin-search-field').boundingBox(),
    page.getByTestId('button-add-pricing-rule').boundingBox(),
    page.getByTestId(`pricing-rule-${rules[0].id}`).boundingBox(),
    page.getByTestId(`button-edit-pricing-${rules[0].id}`).boundingBox(),
  ]);
  expect(previewBox?.height).toBeGreaterThanOrEqual(250);
  expect(previewBox?.height).toBeLessThanOrEqual(300);
  expect((rulesPanelBox?.y || 0) - ((previewBox?.y || 0) + (previewBox?.height || 0))).toBeGreaterThanOrEqual(24);
  expect((rulesPanelBox?.y || 0) - ((previewBox?.y || 0) + (previewBox?.height || 0))).toBeLessThanOrEqual(32);
  expect(sourceSelectorBox?.width).toBeGreaterThanOrEqual(300);
  expect(sourceSelectorBox?.height).toBeGreaterThanOrEqual(53);
  expect(sourceSelectorBox?.height).toBeLessThanOrEqual(55);
  expect(Math.abs((sourceSelectorBox?.width || 0) - (targetSelectorBox?.width || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((sourceSelectorBox?.height || 0) - (targetSelectorBox?.height || 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((sourceSelectorBox?.height || 0) - (previewButtonBox?.height || 0))).toBeLessThanOrEqual(1);
  expect((targetSelectorBox?.x || 0) - ((sourceSelectorBox?.x || 0) + (sourceSelectorBox?.width || 0))).toBeGreaterThanOrEqual(23);
  expect((targetSelectorBox?.x || 0) - ((sourceSelectorBox?.x || 0) + (sourceSelectorBox?.width || 0))).toBeLessThanOrEqual(25);
  expect(previewButtonBox?.y || 0).toBeGreaterThanOrEqual((sourceSelectorBox?.y || 0) + (sourceSelectorBox?.height || 0) + 11);
  expect(sourceLogoBox?.width).toBeGreaterThanOrEqual(47);
  expect(sourceLogoBox?.width).toBeLessThanOrEqual(49);
  expect(routeArrowBox?.width).toBeLessThanOrEqual(34);
  expect(previewInfoBox?.height).toBeLessThanOrEqual(40);
  expect(filterBox?.height).toBeGreaterThanOrEqual(37);
  expect(Math.abs((filterBox?.height || 0) - (addRuleBox?.height || 0))).toBeLessThanOrEqual(2);
  expect(firstRuleBox?.height).toBeGreaterThanOrEqual(36);
  expect(firstRuleBox?.height).toBeLessThanOrEqual(42);
  expect(editActionBox?.height).toBeGreaterThanOrEqual(23);
  expect(editActionBox?.height).toBeLessThanOrEqual(25);
  expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByPlaceholder('Search by rule, route, or payment method')).toBeVisible();
  await expect(page.getByTestId(`button-test-pricing-${rules[0].id}`)).toBeVisible();
  await expect(page.getByTestId(`pricing-rule-${rules[0].id}`)).toContainText('+ 0.00 BTC fixed');
  const bunqRuleId = rules[2].id;
  await page.getByTestId(`button-test-pricing-${bunqRuleId}`).click();
  await expect(page.getByTestId('preview-source')).toHaveAttribute('data-value', '');
  await expect(page.getByTestId('preview-source')).toContainText('Any option');
  await expect(page.getByTestId('preview-target')).toHaveAttribute('data-value', 'eur-bunq');
  await expect(page.getByTestId('preview-target')).toContainText(/Bunq/);
  await expect(page.getByTestId('preview-target')).toContainText(/EUR/);
  await expect(page.getByTestId('preview-target').locator('.payment-method-logo')).toBeVisible();
  await expect(page.getByTestId('input-preview-amount')).toHaveCount(0);
  await expect(page.locator('.pricing-preview-amount')).toHaveCount(0);
  await expect(page.locator('#pricing-rule-test-panel').getByText('Amount', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('button-preview-pricing')).toBeDisabled();
  await expect(page.getByTestId('pricing-preview-info')).toContainText('Choose a concrete option for each Any side');
  await expect(page.getByTestId('pricing-preview-info')).toContainText('Loaded · ANY to Bunq');
  await page.getByTestId(`button-test-pricing-${rules[0].id}`).click();
  await expect(page.getByTestId('preview-source')).toHaveAttribute('data-value', 'usd-bank');
  await expect(page.getByTestId('preview-target')).toHaveAttribute('data-value', 'btc-bitcoin');
  await expect(page.getByTestId('button-preview-pricing')).toBeEnabled();
  await expect(page.getByTestId('input-pricing-sourceAsset')).toHaveCount(0);
  await page.getByTestId(`button-edit-pricing-${rules[0].id}`).click();
  const pricingEnabledBox = await page.getByTestId('input-pricing-enabled').boundingBox();
  expect(pricingEnabledBox?.width).toBeLessThanOrEqual(24);
  expect(pricingEnabledBox?.height).toBeLessThanOrEqual(24);
  await page.getByTestId('input-pricing-enabled').uncheck();
  await expect(page.getByText(/Saving this rule would leave 3 active Swap routes without pricing/)).toBeVisible();
  await page.getByTestId('input-pricing-enabled').check();
  await page.getByTestId('button-close-pricing-drawer').click();
  await page.getByTestId('button-add-pricing-rule').click();
  await expect(page.getByTestId('input-pricing-time')).toHaveCount(0);
  await expect(page.getByTestId('input-pricing-priority')).toHaveCount(0);
  const pricingFieldGeometry = await page.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-testid="select-pricing-source"]')!.getBoundingClientRect();
    const target = document.querySelector<HTMLElement>('[data-testid="select-pricing-target"]')!.getBoundingClientRect();
    const markup = document.querySelector<HTMLElement>('[data-testid="input-pricing-markup"]')!.getBoundingClientRect();
    return {
      sourceWidth: source.width,
      targetWidth: target.width,
      markupWidth: markup.width,
      sourceHeight: source.height,
      targetHeight: target.height,
      sideBySide: Math.abs(source.top - target.top) <= 1,
    };
  });
  expect({
    source: Math.round(pricingFieldGeometry.sourceWidth),
    target: Math.round(pricingFieldGeometry.targetWidth),
  }).toEqual({
    source: Math.round(pricingFieldGeometry.markupWidth),
    target: Math.round(pricingFieldGeometry.markupWidth),
  });
  expect(Math.abs(pricingFieldGeometry.sourceHeight - pricingFieldGeometry.targetHeight)).toBeLessThanOrEqual(1);
  expect(pricingFieldGeometry.sideBySide).toBe(true);
  await page.getByTestId('input-pricing-name').fill('Exact USD to EUR route');
  await page.getByTestId('select-pricing-source').click();
  await page.getByTestId('option-pricing-source-usd-bank').click();
  await page.getByTestId('select-pricing-target').click();
  await page.getByTestId('option-pricing-target-eur-bank').click();
  await page.getByTestId('input-pricing-markup').fill('6');
  await page.getByTestId('button-save-pricing-rule').click();
  await expect.poll(() => rules.find(rule => rule.name === 'Exact USD to EUR route')?.id).toBeTruthy();
  const exactRuleId = rules.find(rule => rule.name === 'Exact USD to EUR route')!.id;
  await expect(page.getByTestId(`pricing-rule-${exactRuleId}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('button-add-pricing-rule').click();
  await page.getByTestId('input-pricing-name').fill('Fractional USD to EUR route');
  await page.getByTestId('select-pricing-source').click();
  await page.getByTestId('option-pricing-source-usd-bank').click();
  await page.getByTestId('select-pricing-target').click();
  await page.getByTestId('option-pricing-target-eur-bank').click();
  await page.getByTestId('input-pricing-markup').fill('0.6');
  await page.getByTestId('button-save-pricing-rule').click();
  await expect.poll(() => rules.find(rule => rule.name === 'Fractional USD to EUR route')?.id).toBeTruthy();
  const fractionalRuleId = rules.find(rule => rule.name === 'Fractional USD to EUR route')!.id;
  await expect(page.getByTestId(`pricing-rule-${fractionalRuleId}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('button-add-pricing-rule').click();
  await page.getByTestId('input-pricing-name').fill('Global fallback');
  await expect(page.getByTestId('button-save-pricing-rule')).toBeEnabled();
  await page.getByTestId('input-pricing-markup').fill('0.5');
  await page.getByTestId('button-save-pricing-rule').click();
  await expect.poll(() => rules.find(rule => rule.name === 'Global fallback')?.id).toBeTruthy();
  const globalFallbackRuleId = rules.at(-1).id;
  await expect(page.getByTestId(`pricing-rule-${globalFallbackRuleId}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`pricing-rule-${globalFallbackRuleId}`)).toContainText('Any source → Any target');

  await page.getByTestId('button-add-pricing-rule').click();
  await page.getByTestId('input-pricing-name').fill('Any source to BTC');
  await expect(page.getByTestId('button-save-pricing-rule')).toBeEnabled();
  await page.getByTestId('select-pricing-source').click();
  await expect(page.getByTestId('option-pricing-source-any')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('option-pricing-source-usd-bank').click();
  await page.getByTestId('select-pricing-source').click();
  await page.getByTestId('option-pricing-source-any').click();
  await page.getByTestId('select-pricing-target').click();
  await page.getByTestId('option-pricing-target-btc-bitcoin').click();
  await page.getByTestId('input-pricing-markup').fill('1.25');
  await page.getByTestId('input-pricing-fixed-fee').fill('0.0001');
  await page.getByTestId('button-save-pricing-rule').click();
  await expect.poll(() => rules.find(rule => rule.name === 'Any source to BTC')?.id).toBeTruthy();
  const anySourceRuleId = rules.at(-1).id;
  await expect(page.getByTestId(`pricing-rule-${anySourceRuleId}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`pricing-rule-${anySourceRuleId}`)).toContainText('Any source → BTC · Bitcoin');

  await page.getByTestId('preview-source').evaluate(element =>
    element.scrollIntoView({ behavior: 'instant', block: 'center' }),
  );
  const pageHeightBeforeMenu = await page.locator('html').evaluate(element => element.scrollHeight);
  await page.getByTestId('preview-source').click();
  const previewMenu = page.locator('.pricing-preview > .qx-overlay-card.qx-widget-anchored');
  const previewBackdrop = page.locator('.pricing-preview > .qx-overlay-backdrop.qx-widget-anchored');
  await expect(previewMenu).toBeVisible();
  await expect(previewBackdrop).toBeVisible();
  await expect(previewMenu).toHaveAttribute('data-state', 'open');
  await expect(previewMenu.getByPlaceholder('Search options...')).toBeVisible();

  const menuGeometry = await previewMenu.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
      width: bounds.width, height: bounds.height,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      position: style.position, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    };
  });

  expect(menuGeometry.position).toBe('absolute');
  expect(menuGeometry.left).toBeGreaterThanOrEqual(0);
  expect(menuGeometry.right).toBeLessThanOrEqual(menuGeometry.viewportWidth);
  expect(menuGeometry.width).toBeLessThanOrEqual(560);
  expect(menuGeometry.height).toBeLessThanOrEqual(640);
  expect(menuGeometry.scrollWidth).toBeLessThanOrEqual(menuGeometry.clientWidth);
  expect(await page.locator('html').evaluate(element => element.scrollHeight)).toBe(pageHeightBeforeMenu);

  await page.keyboard.press('Escape');
  await expect(previewMenu).toHaveCount(0);

  await page.getByTestId('preview-target').click();
  await expect(previewMenu).toBeVisible();
  const targetMenuGeometry = await previewMenu.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { left: bounds.left, top: bounds.top, width: bounds.width, position: style.position, bottom: bounds.bottom, viewportHeight: window.innerHeight };
  });
  expect(targetMenuGeometry.position).toBe('absolute');
  expect(targetMenuGeometry.width).toBeLessThanOrEqual(560);

  await previewMenu.locator('.qx-overlay-close').click();
  await expect(previewMenu).toHaveCount(0);
  await page.getByTestId('preview-source').click();
  await page.getByTestId('filter-preview-source-payment-methods').click();
  await expect(page.getByTestId('option-preview-source-usd-bank')).toBeVisible();
  await expect(page.getByTestId('option-preview-source-btc-bitcoin')).toHaveCount(0);
  await page.getByTestId('filter-preview-source-crypto').click();
  await expect(page.getByTestId('option-preview-source-usd-bank')).toHaveCount(0);
  await expect(page.getByText('No options found')).toBeVisible();
  await page.getByTestId('filter-preview-source-all').click();
  await page.getByTestId('option-preview-source-usd-bank').click();
  await page.getByTestId('preview-target').click();
  await page.getByTestId('option-preview-target-btc-bitcoin').click();
  await expect(page.getByTestId('preview-target')).toContainText(/BTC\s*Bitcoin/);
  await expect(page.getByTestId('preview-target')).not.toContainText('BTC BTC');
  await page.getByTestId('button-preview-pricing').click();
  await expect(page.getByTestId('pricing-preview-result')).toContainText('0.0198 BTC');
  await page.getByTestId('button-reset-pricing-preview').click();
  await expect(page.getByTestId('input-preview-amount')).toHaveCount(0);
  await expect(page.getByTestId('pricing-preview-result')).toHaveCount(0);

  for (const width of [320, 360, 375, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('preview-source').scrollIntoViewIfNeeded();

    const closedGeometry = await page.evaluate(() => ({
      submitTop: document.querySelector<HTMLElement>('[data-testid="button-preview-pricing"]')!.getBoundingClientRect().top + window.scrollY,
      pageHeight: document.documentElement.scrollHeight,
    }));

    for (const selector of ['source', 'target'] as const) {
      const trigger = page.getByTestId(`preview-${selector}`);
      await trigger.click();

      const sheet = page.locator('.pricing-preview > .qx-overlay-card.qx-widget-anchored');
      const backdrop = page.locator('.pricing-preview > .qx-overlay-backdrop.qx-widget-anchored');
      await expect(sheet).toBeVisible();
      await expect(backdrop).toBeVisible();
      await expect(sheet.getByPlaceholder('Search options...')).toBeVisible();
      await expect(sheet.locator('.qx-overlay-chips > button')).toHaveCount(4);

      const sheetContract = await sheet.evaluate((element, viewportWidth) => {
        const bounds = element.getBoundingClientRect();
        const list = element.querySelector<HTMLElement>('.qx-overlay-list')!;
        const style = getComputedStyle(element);
        const listStyle = getComputedStyle(list);
        return {
          isBodyPortal: element.parentElement === document.body,
          position: style.position,
          left: bounds.left,
          right: bounds.right,
          bottomGap: window.innerHeight - bounds.bottom,
          width: bounds.width,
          listOverflowY: listStyle.overflowY,
          listFits: list.scrollWidth <= list.clientWidth,
          pageHeight: document.documentElement.scrollHeight,
          pageFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          viewportWidth,
        };
      }, width);

      expect(sheetContract.isBodyPortal).toBe(false);
      expect(sheetContract.position).toBe('absolute');
      expect(sheetContract.left).toBeGreaterThanOrEqual(0);
      expect(sheetContract.right).toBeLessThanOrEqual(sheetContract.viewportWidth);
      expect(sheetContract.width).toBeLessThanOrEqual(width);
      expect(sheetContract.listOverflowY).toBe('auto');
      expect(sheetContract.listFits).toBe(true);
      expect(sheetContract.pageHeight).toBe(closedGeometry.pageHeight);
      expect(sheetContract.pageFitsViewport).toBe(true);

      const optionContract = await sheet.locator('[role="option"]').filter({ hasText: /USD|BTC/ }).first().evaluate(element => {
        const identity = element.querySelector<HTMLElement>('.convert-option-identity');
        const copy = element.querySelector<HTMLElement>('.crypto-identity-copy') || element.querySelector<HTMLElement>('.payment-method-copy');
        const name = copy?.querySelector<HTMLElement>('strong');
        const logo = element.querySelector<HTMLElement>('.crypto-logo') || element.querySelector<HTMLElement>('.settlement-payment-avatar');
        const flag = element.querySelector<HTMLElement>('.fiat-currency-flag');
        const logoBox = logo?.getBoundingClientRect();
        const flagBox = flag?.getBoundingClientRect();
        const nameStyle = name ? getComputedStyle(name) : null;
        const copyStyle = copy ? getComputedStyle(copy) : null;
        const flagStyle = flag ? getComputedStyle(flag) : null;

        return {
          optionFits: element.scrollWidth <= element.clientWidth,
          identityFits: !identity || identity.scrollWidth <= identity.clientWidth,
          copyWritingMode: copyStyle?.writingMode,
          nameOverflow: nameStyle?.overflow,
          nameTextOverflow: nameStyle?.textOverflow,
          nameWhiteSpace: nameStyle?.whiteSpace,
          logoWidth: logoBox?.width || 0,
          logoHeight: logoBox?.height || 0,
          flagWidth: flagBox?.width || 0,
          flagHeight: flagBox?.height || 0,
          flagRadius: flagStyle?.borderRadius,
        };
      });

      expect(optionContract.optionFits).toBe(true);
      expect(optionContract.identityFits).toBe(true);
      expect(optionContract.copyWritingMode).toBe('horizontal-tb');
      expect(optionContract.nameOverflow).toBe('hidden');
      expect(optionContract.nameTextOverflow).toBe('ellipsis');
      expect(optionContract.nameWhiteSpace).toBe('nowrap');
      expect(optionContract.logoWidth).toBeGreaterThanOrEqual(31);
      expect(optionContract.logoWidth).toBeLessThanOrEqual(49);
      expect(optionContract.logoHeight).toBeGreaterThanOrEqual(31);
      expect(optionContract.logoHeight).toBeLessThanOrEqual(49);
      if (optionContract.flagWidth) {
        expect(Math.abs(optionContract.flagWidth - optionContract.flagHeight)).toBeLessThanOrEqual(1);
        expect(optionContract.flagRadius).toBe('50%');
      }

      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    }

    const restoredSubmitTop = await page.getByTestId('button-preview-pricing').evaluate(element =>
      element.getBoundingClientRect().top + window.scrollY,
    );
    expect(Math.abs(restoredSubmitTop - closedGeometry.submitTop)).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId(`button-edit-pricing-${rules[0].id}`).click();
  await expect(page.getByTestId('input-pricing-markup')).toHaveValue('0.75');
  await page.getByTestId('button-close-pricing-drawer').click();
  await page.getByTestId(`button-edit-pricing-${rules[1].id}`).click();
  await expect(page.getByTestId('input-pricing-markup')).toBeDisabled();
  await expect(page.getByTestId('button-save-pricing-rule')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: 'Edit pricing rule' })).toBeVisible();
  await expect(page.getByTestId('input-pricing-markup')).toBeDisabled();
  await page.getByTestId('button-close-pricing-drawer').click();

  await page.getByTestId('button-add-pricing-rule').click();
  const mobilePricingForm = page.getByTestId('pricing-rule-drawer').locator('form');
  await expect.poll(() => mobilePricingForm.evaluate(element =>
    element.scrollHeight > element.clientHeight
  )).toBe(true);
  await page.getByTestId('button-save-pricing-rule').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('button-save-pricing-rule')).toBeVisible();
  await page.getByTestId('button-close-pricing-drawer').click();

  await expect(page.getByTestId(`pricing-rule-${rules[0].id}`)).toBeVisible();
  await page.getByTestId(`button-toggle-pricing-${rules[0].id}`).click();
  await expect(page.getByTestId(`pricing-rule-${rules[0].id}`)).toContainText('Disabled');

  page.once('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByTestId(`button-delete-pricing-${anySourceRuleId}`).click();
  await expect(page.getByTestId(`pricing-rule-${anySourceRuleId}`)).toHaveCount(0);

});

test('Price a route selectors stay inside the Live Preview card at supported widths', async ({ page }) => {
  const pricingRules = [{
    id: '00000000-0000-4000-8000-000000000101',
    name: 'USD bank to BTC',
    sourceAsset: null,
    targetAsset: null,
    sourceNetwork: null,
    targetNetwork: null,
    paymentMethod: null,
    payoutMethod: null,
    sourceSettlementOptionId: 'USD-BANK',
    targetSettlementOptionId: 'BTC-BITCOIN',
    markupBasisPoints: 75,
    fixedFee: '0.00005',
    priority: 100,
    enabled: true,
    version: 1,
    specificity: 2,
    missingSettlementOptionIds: [],
    createdAt: now,
    updatedAt: now,
  }];

  await page.route('**/api/exchange/config', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) }),
  );
  await page.route('**/api/admin/manual-desk-pricing-rules', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: pricingRules,
        diagnostics: {
          hasEnabledAnyToAnyFallback: false,
          orphanRules: [],
          uncoveredRoutes: [],
        },
      }),
    }),
  );
  await page.route('**/api/admin/providers/oneforge', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        provider: '1Forge',
        configured: true,
        state: 'healthy',
        fetchedAt: now,
        ageMs: 3000,
        rates: [{ currency: 'USD', unitsPerUsd: '1' }],
      }),
    }),
  );

  await page.goto('/admin/pricing');
  await expect(page.getByTestId('preview-source')).toBeVisible();

  for (const width of [320, 360, 375, 390, 412, 430, 1024, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('preview-source').scrollIntoViewIfNeeded();

    const closedSubmitTop = await page.getByTestId('button-preview-pricing').evaluate(element =>
      element.getBoundingClientRect().top + window.scrollY,
    );

    for (const selector of ['source', 'target'] as const) {
      const trigger = page.getByTestId(`preview-${selector}`);
      await trigger.click();

      const backdrop = page.locator('.pricing-preview > .qx-overlay-backdrop.qx-widget-anchored');
      const menu = page.locator('.pricing-preview > .qx-overlay-card.qx-widget-anchored');

      await expect(backdrop).toBeVisible();
      await expect(menu).toBeVisible();

      await expect(menu).toHaveAttribute('data-state', 'open');
      await expect.poll(() => menu.evaluate(element =>
        element.getAnimations().every(animation => animation.playState === 'finished'),
      )).toBe(true);

      const searchInput = menu.getByPlaceholder('Search options...');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).not.toBeFocused();
      await expect(menu.locator('.qx-overlay-chips > button')).toHaveCount(4);
      await expect(menu.getByRole('button', { name: 'All', exact: true })).toBeVisible();
      await expect(menu.getByRole('button', { name: 'Crypto', exact: true })).toBeVisible();
      await expect(menu.getByRole('button', { name: 'Fiat', exact: true })).toBeVisible();
      await expect(menu.getByRole('button', { name: 'Payment Methods', exact: true })).toBeVisible();

      const contract = await page.evaluate(({ selector, width }) => {
        const preview = document.querySelector<HTMLElement>('.pricing-preview')!;
        const menu = preview.querySelector<HTMLElement>(':scope > .qx-overlay-card.qx-widget-anchored')!;
        const backdrop = preview.querySelector<HTMLElement>(':scope > .qx-overlay-backdrop.qx-widget-anchored')!;
        const search = menu.querySelector<HTMLElement>('.qx-overlay-search')!;
        const tabs = menu.querySelector<HTMLElement>('.qx-overlay-chips')!;
        const results = menu.querySelector<HTMLElement>('.qx-overlay-list')!;
        const option = menu.querySelector<HTMLElement>('[role="option"] .convert-option-identity')!;
        const copy = menu.querySelector<HTMLElement>('.crypto-identity-copy') || menu.querySelector<HTMLElement>('.payment-method-copy')!;
        const paymentName = menu.querySelector<HTMLElement>('.crypto-identity-copy strong') || menu.querySelector<HTMLElement>('.payment-method-copy strong');
        const logo = menu.querySelector<HTMLElement>('.crypto-logo') || menu.querySelector<HTMLElement>('.settlement-payment-avatar')!;
        const flag = menu.querySelector<HTMLElement>('.fiat-currency-flag');
        const check = menu.querySelector<HTMLElement>('.qx-asset-option-check')!;
        const boxes = {
          menu: menu.getBoundingClientRect(),
          backdrop: backdrop.getBoundingClientRect(),
          search: search.getBoundingClientRect(),
          tabs: tabs.getBoundingClientRect(),
          results: results.getBoundingClientRect(),
          logo: logo.getBoundingClientRect(),
          flag: flag?.getBoundingClientRect(),
          check: check?.getBoundingClientRect(),
          preview: preview.getBoundingClientRect(),
        };
        const menuStyle = getComputedStyle(menu);
        const resultsStyle = getComputedStyle(results);
        const backdropStyle = getComputedStyle(backdrop);
        const copyStyle = getComputedStyle(copy);
        const nameStyle = paymentName ? getComputedStyle(paymentName) : null;
        const flagStyle = flag ? getComputedStyle(flag) : null;

        return {
          menuIsInsidePreview: menu.parentElement === preview,
          menuPosition: menuStyle.position,
          backdropPosition: backdropStyle.position,
          menuLeft: boxes.menu.left,
          menuRight: boxes.menu.right,
          menuBottom: boxes.menu.bottom,
          menuWidth: boxes.menu.width,
          menuFitsPreview:
            boxes.menu.left >= boxes.preview.left - 1
            && boxes.menu.right <= boxes.preview.right + 1
            && boxes.menu.top >= boxes.preview.top - 1
            && boxes.menu.bottom <= boxes.preview.bottom + 1,
          searchFits: boxes.search.left >= boxes.menu.left + 9
            && boxes.search.right <= boxes.menu.right - 9,
          resultsFollowTabs: boxes.results.top >= boxes.tabs.bottom,
          resultsWidthFits: results.scrollWidth <= results.clientWidth,
          resultsHeight: results.clientHeight,
          resultsOverflowY: resultsStyle.overflowY,
          optionFits: option.scrollWidth <= option.clientWidth,
          copyWritingMode: copyStyle.writingMode,
          paymentNameOverflow: nameStyle?.overflow,
          paymentNameTextOverflow: nameStyle?.textOverflow,
          paymentNameWhiteSpace: nameStyle?.whiteSpace,
          logoWidth: boxes.logo.width,
          logoHeight: boxes.logo.height,
          checkWidth: boxes.check?.width,
          checkHeight: boxes.check?.height,
          flagIsCircular: !boxes.flag || (
            Math.abs(boxes.flag.width - boxes.flag.height) <= 1
            && flagStyle?.borderRadius === '50%'
          ),
          pageFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      }, { selector, width });

      expect(contract.menuIsInsidePreview).toBe(true);
      expect(contract.menuPosition).toBe('absolute');
      expect(contract.backdropPosition).toBe('absolute');
      expect(contract.menuFitsPreview).toBe(true);
      expect(contract.menuLeft).toBeGreaterThanOrEqual(0);
      expect(contract.menuRight).toBeLessThanOrEqual(contract.viewportWidth);
      expect(contract.menuWidth).toBeLessThanOrEqual(560);
      expect(contract.menuBottom).toBeLessThanOrEqual(contract.viewportHeight + 800); // Account for slide-up animation
      expect(contract.searchFits).toBe(true);
      expect(contract.resultsFollowTabs).toBe(true);
      expect(contract.resultsWidthFits).toBe(true);
      expect(contract.resultsHeight).toBeLessThanOrEqual(340);
      expect(contract.resultsOverflowY).toBe('auto');
      expect(contract.optionFits).toBe(true);
      expect(contract.copyWritingMode).toBe('horizontal-tb');
      if (selector === 'source') {
        expect(contract.paymentNameOverflow).toBe('hidden');
        expect(contract.paymentNameTextOverflow).toBe('ellipsis');
        expect(contract.paymentNameWhiteSpace).toBe('nowrap');
      }
      expect(contract.logoWidth).toBeGreaterThanOrEqual(31.5);
      expect(contract.logoWidth).toBeLessThanOrEqual(42);
      expect(contract.logoHeight).toBeGreaterThanOrEqual(31.5);
      expect(contract.logoHeight).toBeLessThanOrEqual(42);
      expect(contract.checkWidth).toBeGreaterThanOrEqual(20);
      expect(contract.checkWidth).toBeLessThanOrEqual(24);
      expect(contract.checkHeight).toBeGreaterThanOrEqual(20);
      expect(contract.checkHeight).toBeLessThanOrEqual(24);
      expect(contract.flagIsCircular).toBe(true);
      expect(contract.pageFitsViewport).toBe(true);

      await searchInput.click();
      await expect(searchInput).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    }

    const restoredSubmitTop = await page.getByTestId('button-preview-pricing').evaluate(element =>
      element.getBoundingClientRect().top + window.scrollY,
    );
    expect(Math.abs(restoredSubmitTop - closedSubmitTop)).toBeLessThanOrEqual(1);
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByTestId('button-add-pricing-rule').scrollIntoViewIfNeeded();
    await page.getByTestId('button-add-pricing-rule').click();
    const drawer = page.getByTestId('pricing-rule-drawer');
    const trigger = page.getByTestId('select-pricing-source');
    const fieldGeometry = await page.evaluate(() => {
      const source = document.querySelector<HTMLElement>('[data-testid="select-pricing-source"]')!.getBoundingClientRect();
      const target = document.querySelector<HTMLElement>('[data-testid="select-pricing-target"]')!.getBoundingClientRect();
      const markup = document.querySelector<HTMLElement>('[data-testid="input-pricing-markup"]')!.getBoundingClientRect();
      return {
        sourceWidth: source.width,
        targetWidth: target.width,
        markupWidth: markup.width,
        sourceHeight: source.height,
        targetHeight: target.height,
        sameRow: Math.abs(source.top - target.top) <= 1,
      };
    });
    expect(Math.abs(fieldGeometry.sourceWidth - fieldGeometry.targetWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(fieldGeometry.sourceWidth - fieldGeometry.markupWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(fieldGeometry.sourceHeight - fieldGeometry.targetHeight)).toBeLessThanOrEqual(1);
    expect(fieldGeometry.sameRow).toBe(viewport.width > 640);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    const menu = page.locator('.pricing-drawer > .qx-overlay-card.qx-widget-anchored');
    const backdrop = page.locator('.pricing-drawer > .qx-overlay-backdrop.qx-widget-anchored');
    const search = menu.getByPlaceholder('Search currencies or payment methods');
    const filters = menu.locator('.qx-overlay-chips');
    const results = menu.locator('.qx-overlay-list');
    await expect(menu).toBeVisible();
    await expect(backdrop).toBeVisible();
    await expect(search).toBeVisible();
    await expect(search).not.toBeFocused();
    await expect.poll(() => menu.evaluate(element =>
      element.getAnimations().every(animation => animation.playState === 'finished'),
    )).toBe(true);
    await expect(filters.getByRole('button')).toHaveCount(4);
    await expect(menu.getByRole('option').first()).toBeVisible();
    await expect(menu.locator('[role="option"].selected .qx-asset-option-check')).toBeVisible();

    const contract = await page.evaluate((viewport) => {
      const drawer = document.querySelector<HTMLElement>('.pricing-drawer')!;
      const drawerHead = drawer.querySelector<HTMLElement>('.pricing-rule-drawer-head')!;
      const menu = drawer.querySelector<HTMLElement>(':scope > .qx-overlay-card.qx-widget-anchored')!;
      const backdrop = drawer.querySelector<HTMLElement>(':scope > .qx-overlay-backdrop.qx-widget-anchored')!;
      const search = menu.querySelector<HTMLInputElement>('.qx-overlay-search input')!;
      const icon = menu.querySelector<HTMLElement>('.qx-overlay-search-icon')!;
      const filters = menu.querySelector<HTMLElement>('.qx-overlay-chips')!;
      const filterButtons = [...filters.querySelectorAll<HTMLElement>('button')];
      const results = menu.querySelector<HTMLElement>('.qx-overlay-list')!;
      const row = results.querySelector<HTMLElement>('[role="option"]')!;
      const primary = row.querySelector<HTMLElement>('.crypto-identity-primary strong')!;
      const secondary = row.querySelector<HTMLElement>('.crypto-identity-name')!;
      const affordance = row.querySelector<HTMLElement>('.qx-asset-option-check')!;
      const menuBounds = menu.getBoundingClientRect();
      const backdropBounds = backdrop.getBoundingClientRect();
      const drawerBounds = drawer.getBoundingClientRect();
      const drawerHeadBounds = drawerHead.getBoundingClientRect();
      const searchBounds = search.getBoundingClientRect();
      const iconBounds = icon.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      const affordanceBounds = affordance.getBoundingClientRect();
      const primaryBounds = primary.getBoundingClientRect();
      const secondaryBounds = secondary.getBoundingClientRect();
      const menuStyle = getComputedStyle(menu);
      const backdropStyle = getComputedStyle(backdrop);
      const resultsStyle = getComputedStyle(results);
      const filterTops = filterButtons.map(button => Math.round(button.getBoundingClientRect().top));

      return {
        drawerPortal: menu.parentElement === drawer,
        centered: Math.abs((menuBounds.left + menuBounds.right) / 2 - (drawerBounds.left + drawerBounds.right) / 2) <= 1,
        insideDrawer: menuBounds.left >= drawerBounds.left
          && menuBounds.right <= drawerBounds.right
          && menuBounds.top >= drawerHeadBounds.bottom
          && menuBounds.bottom <= drawerBounds.bottom,
        insideVisualViewport: menuBounds.left >= 0
          && menuBounds.right <= window.innerWidth + 1
          && menuBounds.top >= 0
          && menuBounds.bottom <= window.innerHeight + 1,
        position: menuStyle.position,
        backdropPosition: backdropStyle.position,
        backdropCoversDrawerBody: Math.abs(backdropBounds.left - drawerBounds.left) <= 2
          && Math.abs(backdropBounds.top - drawerHeadBounds.bottom) <= 2
          && Math.abs(backdropBounds.width - drawerBounds.width) <= 2
          && Math.abs(backdropBounds.bottom - drawerBounds.bottom) <= 2,
        hasOpaqueSurface:
          menuStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
          && menuStyle.backgroundColor !== 'transparent'
          && Number(menuStyle.opacity) === 1,
        menuOverflowY: menuStyle.overflowY,
        resultsOverflowY: resultsStyle.overflowY,
        onlyResultsCanScrollVertically: results.scrollHeight >= results.clientHeight,
        searchHeight: searchBounds.height,
        iconSafelyBeforeText: iconBounds.right + 5 <= searchBounds.left,
        filtersShareOneRow: new Set(filterTops).size === 1,
        filtersUseControlledOverflow: getComputedStyle(filters).overflowX === 'auto',
        rowHeight: rowBounds.height,
        rowFitsWidth: row.scrollWidth <= row.clientWidth,
        copyDoesNotOverlap: primaryBounds.bottom <= secondaryBounds.top
          || secondaryBounds.bottom <= primaryBounds.top,
        hasRightAffordance: affordanceBounds.width >= 20
          && affordanceBounds.left >= rowBounds.left
          && affordanceBounds.right <= rowBounds.right,
        menuWidth: menuBounds.width,
        drawerWidth: drawerBounds.width,
        pageFitsViewport: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      };
    }, viewport);

    expect(contract.drawerPortal).toBe(true);
    expect(contract.centered).toBe(true);
    expect(contract.insideDrawer).toBe(true);
    expect(contract.insideVisualViewport).toBe(true);
    expect(contract.position).toBe('absolute');
    expect(contract.backdropPosition).toBe('absolute');
    expect(contract.backdropCoversDrawerBody).toBe(true);
    expect(contract.hasOpaqueSurface).toBe(true);
    expect(contract.menuOverflowY).toBe('hidden');
    expect(contract.resultsOverflowY).toBe('auto');
    expect(contract.onlyResultsCanScrollVertically).toBe(true);
    expect(contract.searchHeight).toBeGreaterThanOrEqual(41);
    expect(contract.searchHeight).toBeLessThanOrEqual(43);
    expect(contract.iconSafelyBeforeText).toBe(true);
    expect(contract.filtersShareOneRow).toBe(true);
    expect(contract.filtersUseControlledOverflow).toBe(true);
    expect(contract.rowHeight).toBeGreaterThanOrEqual(52);
    expect(contract.rowFitsWidth).toBe(true);
    expect(contract.copyDoesNotOverlap).toBe(true);
    expect(contract.hasRightAffordance).toBe(true);
    expect(contract.menuWidth).toBeLessThanOrEqual(532);
    expect(contract.menuWidth).toBeLessThanOrEqual(contract.drawerWidth - 32);
    expect(contract.pageFitsViewport).toBe(true);

    await search.click();
    await expect(search).toBeFocused();

    if (viewport.width === 1280) {
      await menu.getByRole('button', { name: 'Payment Methods', exact: true }).click();
      await expect(menu.getByRole('option')).toHaveCount(1);
      await expect(menu.getByRole('option')).toContainText(/Bank transfer.*USD/);
      await menu.getByRole('button', { name: 'All', exact: true }).click();
      await search.fill('Bank transfer');
      await expect(menu.getByRole('option')).toHaveCount(1);
      await expect(menu.getByRole('option')).toContainText(/Bank transfer.*USD/);
      await menu.getByTestId('search-pricing-source-clear').click();
      await expect(menu.getByRole('option').first()).toBeVisible();
    }

    await search.press('Escape');
    await expect(menu).toHaveCount(0);
    await drawer.getByTestId('button-close-pricing-drawer').click();
    await expect(drawer).toHaveCount(0);
  }
});