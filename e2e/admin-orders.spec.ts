import { expect, test } from '@playwright/test';

const quickexOrder = {
  id: 'QX-11111111-1111-4111-8111-111111111111',
  type: 'instant',
  status: 'sending payout',
  recordVersion: 3,
  fromAsset: 'BTC',
  fromNetwork: 'Bitcoin',
  toAsset: 'USDT',
  toNetwork: 'TRC20',
  amount: '9007199254740993.123456789012345678',
  receiveAmount: '12345678901234567890.000000000000000001',
  customerEmail: 'named-guest@example.test',
  customerName: 'Named Guest',
  customerRegistered: true,
  destinationAddress: 'destination-wallet-needle',
  destinationMemo: 'destination-memo-needle',
  refundAddress: 'refund-wallet',
  refundMemo: '',
  depositAddress: 'deposit-wallet',
  depositMemo: '',
  paymentMethod: '',
  payoutMethod: '',
  provider: 'Quickex',
  note: '',
  providerReference: 'provider-reference',
  providerOrderId: '9101',
  providerState: 'sending payout',
  rateMode: 'FIXED',
  quoteId: 'quote-id-'.repeat(100),
  errorCode: '',
  errorMessage: '',
  outcomeUnknown: true,
  providerClaimedDepositAmount: '9007199254740993.123456789012345678',
  providerExpectedReceiveAmount: '12345678901234567890.000000000000000001',
  providerPaidAmount: '9999999999999999999.999999999999999999',
  providerCreatedAt: '2025-06-10T09:15:00.000Z',
  providerUpdatedAt: '2025-06-10T09:30:00.000Z',
  providerCompleted: false,
  createdAt: '2025-06-10T09:16:00.000Z',
};

const manualOrder = {
  ...quickexOrder,
  id: 'QX-22222222-2222-4222-8222-222222222222',
  type: 'manual',
  status: 'pending',
  manualSettlementState: 'awaiting_funds',
  recordVersion: 0,
  fromAsset: 'EUR',
  fromNetwork: 'SEPA',
  paymentMethod: 'Paysera',
  amount: '350',
  receiveAmount: '0',
  customerEmail: 'anonymous@example.test',
  customerName: 'Guest',
  customerRegistered: false,
  provider: 'Manual desk',
  providerReference: '',
  providerOrderId: '',
  providerState: '',
  rateMode: undefined,
  outcomeUnknown: false,
  providerClaimedDepositAmount: null,
  providerExpectedReceiveAmount: null,
  providerPaidAmount: null,
  providerCreatedAt: null,
  providerUpdatedAt: null,
  providerCompleted: null,
  createdAt: '2025-06-12T10:00:00.000Z',
};

const secondManualOrder = {
  ...manualOrder,
  id: 'QX-33333333-3333-4333-8333-333333333333',
  sourceSettlementOptionId: 'fiat:eur:sepa',
  paymentMethod: 'SEPA',
  customerEmail: 'second-anonymous@example.test',
  amount: '125',
  receiveAmount: '0.004',
  createdAt: '2025-06-12T10:05:00.000Z',
};

test('operators can filter, inspect, and page through guest orders', async ({ page }) => {
  const orderRequests: URL[] = [];
  let bulkStatusPayload: Record<string, unknown> | undefined;
  let bulkArchivePayload: Record<string, unknown> | undefined;
  let bulkDeletePayload: Record<string, unknown> | undefined;
  const permanentlyDeletedOrderIds = new Set<string>();
  let manualStatusPayload: Record<string, unknown> | undefined;
  let manualDetailOrder = { ...manualOrder, assignedOperatorId: 'operator-1', archivedAt: null, archivedBy: null };
  const reconciliationAttempts = [
    { id: 'audit-accepted', outcome: 'accepted', operatorId: 'operator-1', operator: 'operator@example.test', requestId: 'request-accepted', createdAt: '2025-06-12T12:00:00.000Z' },
    { id: 'audit-conflict', outcome: 'conflict', operatorId: 'operator-1', operator: 'operator@example.test', requestId: 'request-conflict', createdAt: '2025-06-12T11:00:00.000Z' },
    { id: 'audit-unavailable', outcome: 'provider_unavailable', operatorId: 'operator-1', operator: 'operator@example.test', requestId: 'request-unavailable', createdAt: '2025-06-12T10:00:00.000Z' },
  ];

  await page.route(/\/api\/admin\/summary(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        product: 'swap',
        from: '2025-06-01T00:00:00.000Z',
        to: '2025-06-30T23:59:59.999Z',
        totalOrders: 0,
        pendingOrders: 0,
        completedOrders: 0,
        failedCancelledOrders: 0,
        totalCustomers: 0,
        totalUsers: 0,
        completionRate: 0,
        averageCompletionTimeMinutes: null,
        averageOrderValueUsd: 0,
        topPaymentMethods: [],
        topCurrencies: [],
        topTradingPairs: [],
        dailySeries: [],
        recentActivity: [],
        valuation: {
          observedAt: null,
          status: 'unavailable',
          valuedOrders: 0,
          totalOrders: 0,
          unavailableCurrencies: [],
        },
        operationalHealth: {
          providerFreshness: { state: 'healthy', syncing: false },
          catalog: { stale: false },
          unresolvedOrders: 0,
          notificationsPending: 0,
          notificationsFailed: 0,
          oldestPendingNotificationAt: null,
        },
      }),
    });
  });

  await page.route(/\/api\/orders(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    orderRequests.push(url);
    const search = url.searchParams.get('search');
    const filtered =
      url.searchParams.get('sourceSettlementOptionId') === 'crypto:btc-bitcoin' &&
      url.searchParams.get('targetSettlementOptionId') === 'crypto:usdt-trc20' &&
      url.searchParams.get('customerEmail') === 'named-guest@example.test' &&
      url.searchParams.get('status') === 'processing' &&
      url.searchParams.get('createdFrom') === '2025-06-01T00:00:00.000Z' &&
      url.searchParams.get('createdTo') === '2025-06-30T23:59:59.999Z' &&
      url.searchParams.get('outcomeUnknown') === 'true' &&
      search === 'Named Guest';
    const detailOrder = search && quickexOrder.id.toLowerCase().includes(search.toLowerCase())
      ? quickexOrder
      : search && manualOrder.id.toLowerCase().includes(search.toLowerCase())
        ? manualOrder
        : undefined;
    const secondPage = url.searchParams.get('page') === '2';
    const requestedType = url.searchParams.get('type');
    const availableItems = detailOrder
      ? [detailOrder]
      : filtered
        ? [quickexOrder]
      : requestedType === 'manual'
        ? [manualOrder, secondManualOrder]
        : [quickexOrder];
    const items = availableItems.filter((order) => !permanentlyDeletedOrderIds.has(order.id));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total: detailOrder || filtered ? items.length : 12 - permanentlyDeletedOrderIds.size,
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 25),
        refreshUnavailable: filtered,
      }),
    });
  });

  await page.route(/\/api\/exchange\/config(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        assets: [],
        fiatCurrencies: ['EUR'],
        settlementOptions: [],
        manualSettlementOptions: [
          { id: 'fiat:eur:paysera', assetId: 'eur', assetCode: 'EUR', routeNetwork: 'SEPA', kind: 'fiat-payment-method', title: 'Paysera', direction: 'both', logoUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2224%22%20r%3D%2218%22%20fill%3D%22%23259bf2%22%2F%3E%3C%2Fsvg%3E' },
          { id: 'fiat:eur:sepa', assetId: 'eur', assetCode: 'EUR', routeNetwork: 'SEPA', kind: 'fiat-payment-method', title: 'SEPA', direction: 'both', logoUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20600%20600%22%3E%3Crect%20width%3D%22600%22%20height%3D%22600%22%20rx%3D%22120%22%20fill%3D%22%232b3e85%22%2F%3E%3Ctext%20x%3D%22300%22%20y%3D%22340%22%20text-anchor%3D%22middle%22%20font-size%3D%22150%22%20fill%3D%22white%22%3ESEPA%3C%2Ftext%3E%3C%2Fsvg%3E' },
          { id: 'crypto:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Tether', networkTitle: 'TRON', direction: 'both', logoUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2224%22%20r%3D%2223%22%20fill%3D%22%2326a17b%22%2F%3E%3Cpath%20d%3D%22M25.8%2025.8v8.4h-3.6v-8.4c-7.2-.3-12.6-1.8-12.6-3.7s5.4-3.4%2012.6-3.7v-3.1h-8.5v-4.6h20.6v4.6h-8.5v3.1c7.2.3%2012.6%201.8%2012.6%203.7s-5.4%203.4-12.6%203.7Zm0-1.8c5.9-.3%2010.3-1.4%2010.3-2.7%200-1.2-4.4-2.4-10.3-2.7v3.2c-.6.1-1.2.1-1.8.1s-1.2%200-1.8-.1v-3.2c-5.9.3-10.3%201.4-10.3%202.7%200%201.2%204.4%202.4%2010.3%202.7v-1.1c.6.1%201.2.1%201.8.1s1.2%200%201.8-.1V24Z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E' },
        ],
        instantSettlementOptions: [
          { id: 'crypto:btc-bitcoin', assetId: 'btc', assetCode: 'BTC', routeNetwork: 'Bitcoin', kind: 'crypto-network', title: 'Bitcoin', networkTitle: 'Bitcoin', direction: 'both' },
          { id: 'crypto:usdt-trc20', assetId: 'usdt', assetCode: 'USDT', routeNetwork: 'TRC20', kind: 'crypto-network', title: 'Tether', networkTitle: 'TRON', direction: 'both', logoUrl: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2048%2048%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2224%22%20r%3D%2223%22%20fill%3D%22%2326a17b%22%2F%3E%3Cpath%20d%3D%22M25.8%2025.8v8.4h-3.6v-8.4c-7.2-.3-12.6-1.8-12.6-3.7s5.4-3.4%2012.6-3.7v-3.1h-8.5v-4.6h20.6v4.6h-8.5v3.1c7.2.3%2012.6%201.8%2012.6%203.7s-5.4%203.4-12.6%203.7Zm0-1.8c5.9-.3%2010.3-1.4%2010.3-2.7%200-1.2-4.4-2.4-10.3-2.7v3.2c-.6.1-1.2.1-1.8.1s-1.2%200-1.8-.1v-3.2c-5.9.3-10.3%201.4-10.3%202.7%200%201.2%204.4%202.4%2010.3%202.7v-1.1c.6.1%201.2.1%201.8.1s1.2%200%201.8-.1V24Z%22%20fill%3D%22white%22%2F%3E%3C%2Fsvg%3E' },
        ],
        providers: [],
        capabilities: { instantQuotes: true, instantOrders: true },
      }),
    });
  });

  await page.route('**/api/admin/operators', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'operator-1', email: 'operator@example.test', role: 'owner', status: 'active', linkedToClerk: true, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }]),
    });
  });
  await page.route('**/api/orders/bulk/status', async (route) => {
    bulkStatusPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [manualOrder, secondManualOrder].map((order) => ({
          id: order.id,
          success: true,
          order: { ...order, manualSettlementState: 'completed', recordVersion: order.recordVersion + 1 },
        })),
      }),
    });
  });
  await page.route('**/api/orders/bulk/archive', async (route) => {
    bulkArchivePayload = route.request().postDataJSON();
    const restoring = bulkArchivePayload?.archived === false;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: restoring
          ? [
              { id: manualOrder.id, success: true, order: { ...manualOrder, archivedAt: null, recordVersion: 1 } },
              { id: secondManualOrder.id, success: true, order: { ...secondManualOrder, archivedAt: null, recordVersion: 1 } },
            ]
          : [
              { id: manualOrder.id, success: true, order: { ...manualOrder, archivedAt: '2025-06-13T10:00:00.000Z', recordVersion: 1 } },
              { id: secondManualOrder.id, success: false, code: 'ORDER_VERSION_CONFLICT', error: 'The order changed.', retryable: true },
            ],
      }),
    });
  });
  await page.route('**/api/orders/bulk/delete', async (route) => {
    bulkDeletePayload = route.request().postDataJSON();
    const items = (bulkDeletePayload?.items ?? []) as Array<{ id: string }>;
    items.forEach((item) => permanentlyDeletedOrderIds.add(item.id));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: items.map((item) => ({ id: item.id, success: true })),
      }),
    });
  });
  await page.route(`**/api/orders/${quickexOrder.id}/audit-log`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(reconciliationAttempts.map((attempt, index) => ({
        id: attempt.id,
        action: index === 0 ? 'order.status_changed' : index === 1 ? 'order.assigned' : 'order.archived',
        actorType: 'operator',
        actorId: attempt.operatorId,
        actorEmail: attempt.operator,
        previousVersion: index,
        nextVersion: index + 1,
        details: index === 1 ? { assigneeEmail: attempt.operator } : {},
        createdAt: attempt.createdAt,
      }))),
    });
  });
  await page.route(`**/api/orders/${quickexOrder.id}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...quickexOrder, recordVersion: 3, assignedOperatorId: 'operator-1', archivedAt: null, archivedBy: null }),
    });
  });
  await page.route(`**/api/orders/${manualOrder.id}/audit-log`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(`**/api/orders/${manualOrder.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      manualStatusPayload = route.request().postDataJSON();
      manualDetailOrder = {
        ...manualDetailOrder,
        manualSettlementState: 'completed',
        status: 'completed',
        recordVersion: manualDetailOrder.recordVersion + 1,
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(manualDetailOrder),
    });
  });
  await page.goto('/admin/orders?type=instant');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOrdersTable = page.getByTestId('table-orders');
  await expect(mobileOrdersTable).toBeVisible();
  await expect(page.getByTestId(`row-order-${quickexOrder.id}`)).toBeVisible();
  const mobileTableContract = await page.locator('.orders-panel .redesigned-table-wrap').evaluate((wrapper) => {
    const table = wrapper.querySelector('table')!;
    const row = table.querySelector('tbody tr')!;
    const cell = row.querySelector('td')!;
    const root = document.documentElement;
    return {
      tableDisplay: getComputedStyle(table).display,
      rowDisplay: getComputedStyle(row).display,
      cellDisplay: getComputedStyle(cell).display,
      wrapperClientWidth: wrapper.clientWidth,
      wrapperScrollWidth: wrapper.scrollWidth,
      pageClientWidth: root.clientWidth,
      pageScrollWidth: root.scrollWidth,
    };
  });
  expect(mobileTableContract.tableDisplay).toBe('table');
  expect(mobileTableContract.rowDisplay).toBe('table-row');
  expect(mobileTableContract.cellDisplay).toBe('table-cell');
  expect(mobileTableContract.wrapperScrollWidth).toBeGreaterThan(mobileTableContract.wrapperClientWidth);
  expect(mobileTableContract.pageScrollWidth).toBeLessThanOrEqual(mobileTableContract.pageClientWidth);
  await page.locator('.orders-panel .redesigned-table-wrap').evaluate((wrapper) => { wrapper.scrollLeft = 180; });
  await expect.poll(() => page.locator('.orders-panel .redesigned-table-wrap').evaluate((wrapper) => wrapper.scrollLeft)).toBeGreaterThan(0);
  const quickexOrderSelection = page.getByTestId(`checkbox-order-${quickexOrder.id}`);
  const quickexOrderSelectionBox = await quickexOrderSelection.boundingBox();
  expect(quickexOrderSelectionBox?.width).toBeLessThanOrEqual(24);
  expect(quickexOrderSelectionBox?.height).toBeLessThanOrEqual(24);
  await quickexOrderSelection.check();
  await expect(page.getByTestId('bulk-selected-count')).toHaveText('1 order selected');
  await expect(page.getByTestId('button-bulk-status')).toBeDisabled();
  await expect(page.getByTestId('button-bulk-archive')).toBeVisible();
  await expect(page.getByTestId('button-bulk-delete')).toHaveCount(0);
  await expect(page.locator('.bulk-actions-context')).toContainText('synchronized from the provider');
  await page.getByTestId('button-clear-selection').click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByTestId('table-orders').getByText('Named Guest')).toBeVisible();
  await expect(page.getByTestId('table-orders').getByRole('columnheader')).toHaveText([
    '', 'Exchange', 'Amount', 'Status', 'Customer', 'Date & Time', 'Order ID / Actions',
  ]);
  await page.getByTestId(`row-menu-trigger-${quickexOrder.id}`).click();
  await expect(page.getByTestId(`row-menu-view-${quickexOrder.id}`)).toBeVisible();
  await expect(page.getByTestId(`row-menu-status-${quickexOrder.id}`)).toBeVisible();
  await expect(page.getByTestId(`row-menu-edit-${quickexOrder.id}`)).toBeVisible();
  await page.getByTestId(`row-menu-archive-${quickexOrder.id}`).click();
  await expect(page.getByRole('alertdialog')).toContainText('Nothing is permanently deleted');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

  await page.getByTestId('button-toggle-filters').click();
  await page.getByTestId('select-filter-send-method').click();
  await page.getByTestId('option-filter-send-method-crypto:btc-bitcoin').click();
  await page.getByTestId('select-filter-receive-method').click();
  await page.getByTestId('option-filter-receive-method-crypto:usdt-trc20').click();
  await page.getByTestId('select-filter-status').selectOption('processing');
  await page.getByTestId('input-filter-customer-email').fill('named-guest@example.test');
  await page.getByTestId('input-filter-createdfrom').fill('2025-06-01');
  await page.getByTestId('input-filter-createdto').fill('2025-06-30');
  await page.getByTestId('select-filter-outcome').selectOption('true');
  const orderSearch = page.getByTestId('input-filter-search');
  await orderSearch.fill('  Named Guest  ');

  await expect.poll(() => orderRequests.some((url) =>
    url.searchParams.get('sourceSettlementOptionId') === 'crypto:btc-bitcoin' &&
    url.searchParams.get('targetSettlementOptionId') === 'crypto:usdt-trc20' &&
    url.searchParams.get('customerEmail') === 'named-guest@example.test' &&
    url.searchParams.get('status') === 'processing' &&
    url.searchParams.get('createdFrom') === '2025-06-01T00:00:00.000Z' &&
    url.searchParams.get('createdTo') === '2025-06-30T23:59:59.999Z' &&
    url.searchParams.get('outcomeUnknown') === 'true' &&
    url.searchParams.get('search') === 'Named Guest',
  )).toBe(true);
  // The responsive dashboard may keep an off-screen compact representation mounted;
  // assert against the visible orders table rather than counting both representations.
  await expect(page.getByTestId('table-orders').locator('[data-testid^="row-order-"]:visible')).toHaveCount(1);
  await expect(page.getByTestId('notice-warning')).toContainText('Data below may be stale');
  await page.getByTestId('input-filter-search-clear').click();
  await expect(orderSearch).toHaveValue('');
  await expect.poll(() => orderRequests.some((url) =>
    url.searchParams.get('sourceSettlementOptionId') === 'crypto:btc-bitcoin' &&
    url.searchParams.get('search') === null,
  )).toBe(true);
  const partialOrderId = quickexOrder.id.slice(0, Math.max(8, quickexOrder.id.length - 4));
  await orderSearch.fill(partialOrderId);
  await expect.poll(() => orderRequests.some((url) => url.searchParams.get('search') === partialOrderId)).toBe(true);
  await expect(page.getByTestId(`row-order-${quickexOrder.id}`)).toBeVisible();
  await page.getByTestId('input-filter-search-clear').click();

  await page.getByTestId(`row-order-${quickexOrder.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/admin/orders/${quickexOrder.id}\\?type=instant$`));
  await expect(page.getByTestId('order-status-progression')).toBeVisible();
  await expect(page.getByTestId('order-details-drawer')).toContainText('Sending Address');
  await expect(page.getByTestId('order-details-drawer')).toContainText('Destination Memo / Tag');
  await expect(page.getByText('Quote ID')).toHaveCount(0);
  await expect(page.getByTestId('order-details-drawer')).toContainText('Assigned to:operator@example.test');
  await expect(page.getByTestId('order-details-drawer')).toBeVisible();
  await expect(page.getByTestId('order-details-drawer')).toContainText(quickexOrder.id);
  await page.getByTestId('button-close-order-drawer').click();
  await expect(page.getByTestId('table-orders')).toBeVisible();
  await page.getByTestId('tab-orders-swap').click();
  await expect(page.getByTestId('table-orders')).toBeVisible();
  await page.getByTestId(`checkbox-order-${manualOrder.id}`).check();
  await expect(page.getByTestId('bulk-selected-count')).toHaveText('1 order selected');
  await page.getByTestId(`checkbox-order-${secondManualOrder.id}`).check();
  await expect(page.getByTestId('checkbox-select-all-orders')).toBeChecked();
  await page.getByTestId(`checkbox-order-${manualOrder.id}`).uncheck();
  await expect.poll(() => page.getByTestId('checkbox-select-all-orders').evaluate((element) => (element as HTMLInputElement).indeterminate)).toBe(true);
  await page.getByTestId('checkbox-select-all-orders').check();
  await expect(page.getByTestId('bulk-selected-count')).toHaveText('2 orders selected');
  await page.getByTestId('button-bulk-status').click();
  await expect(page.getByRole('alertdialog')).toContainText('2 selected Swap orders');
  await expect(page.getByTestId('select-bulk-status').locator('option[value="completed"]')).toHaveCount(1);
  await page.getByTestId('select-bulk-status').selectOption('completed');
  await page.getByTestId('button-confirm-bulk-status').click();
  await expect.poll(() => bulkStatusPayload).toMatchObject({
    manualSettlementState: 'completed',
    items: [
      { id: manualOrder.id, recordVersion: 0 },
      { id: secondManualOrder.id, recordVersion: 0 },
    ],
  });
  await expect(page.getByTestId('notice-bulk-result')).toContainText('2 updated successfully');

  await page.getByTestId('checkbox-select-all-orders').check();
  await page.getByTestId('button-bulk-archive').click();
  await expect(page.getByRole('alertdialog')).toContainText('Nothing is permanently deleted');
  await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByTestId('button-bulk-archive')).toBeFocused();
  await page.getByTestId('button-bulk-archive').click();
  await page.getByTestId('button-confirm-bulk-archive').click();
  await expect.poll(() => bulkArchivePayload).toMatchObject({
    archived: true,
    items: [
      { id: manualOrder.id, recordVersion: 0 },
      { id: secondManualOrder.id, recordVersion: 0 },
    ],
  });
  await expect(page.getByTestId('notice-bulk-result')).toContainText('1 archived; 1 failed');

  await page.getByTestId('tab-orders-convert').click();
  await expect(page.getByTestId('table-orders')).toBeVisible();
  const clearFiltersButton = page.getByRole('button', { name: 'Clear filters' });
  if (await clearFiltersButton.isVisible()) await clearFiltersButton.click();

  await page.getByTestId('select-pagesize').selectOption('10');
  await expect.poll(() => orderRequests.some((url) =>
    url.searchParams.get('page') === '1' &&
    url.searchParams.get('pageSize') === '10' &&
    !url.searchParams.get('search'),
  )).toBe(true);
  await page.getByTestId('button-page-next').click();
  await expect.poll(() => orderRequests.some((url) =>
    url.searchParams.get('page') === '2' &&
    url.searchParams.get('pageSize') === '10',
  )).toBe(true);
  await expect(page.getByTestId('table-orders').getByTestId(`row-order-${quickexOrder.id}`)).toBeVisible();
  const convertRow = page.getByTestId('table-orders').getByTestId(`row-order-${quickexOrder.id}`);
  const convertExchange = convertRow.locator('.order-exchange-cell');
  await expect(convertExchange).toHaveText('');
  await expect(convertExchange.locator('.order-route-logo-frame')).toHaveCount(2);
  const desktopLogoSizes = await convertExchange.locator('.order-route-logo-frame').evaluateAll((frames) =>
    frames.map((frame) => {
      const inner = frame.firstElementChild!.getBoundingClientRect();
      const outer = frame.getBoundingClientRect();
      return {
        width: outer.width,
        height: outer.height,
        innerWidth: inner.width,
        innerHeight: inner.height,
      };
    })
  );
  expect(desktopLogoSizes.every(({ width, height, innerWidth, innerHeight }) =>
    width === 44 && height === 44 && innerWidth === 44 && innerHeight === 44
  )).toBe(true);
  await page.getByTestId('tab-orders-swap').click();
  await expect(page.getByTestId('table-orders')).toBeVisible();
  await expect(page.getByTestId('table-orders').getByRole('columnheader')).toHaveText([
    '', 'Exchange', 'Amount', 'Status', 'Customer', 'Date & Time', 'Order ID / Actions',
  ]);
  const manualRow = page.getByTestId('table-orders').getByTestId(`row-order-${manualOrder.id}`);
  await expect(manualRow.getByText('350 EUR', { exact: true })).toBeVisible();
  await expect(manualRow.getByText('0 USDT', { exact: true })).toBeVisible();
  const manualExchange = manualRow.locator('.order-exchange-cell');
  await expect(manualExchange).toHaveText('');
  await expect(manualExchange.locator('.order-route-logo-frame')).toHaveCount(2);
  const payseraLogo = manualExchange.locator('.payment-method-logo[data-brand="paysera"]');
  await expect(payseraLogo).toBeVisible();
  const payseraGeometry = await payseraLogo.evaluate((element) => {
    const styles = getComputedStyle(element);
    const imageStyles = getComputedStyle(element.querySelector('img') || element.querySelector('svg')!);
    return {
      borderRadius: styles.borderRadius,
      overflow: styles.overflow,
      objectFit: imageStyles.objectFit,
      hasBackground: styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent',
      hasIconFit: element.classList.contains('logo-avatar-fit-icon'),
    };
  });
  expect(payseraGeometry).toMatchObject({
    borderRadius: '50%',
    overflow: 'hidden',
    objectFit: 'contain',
    hasBackground: false,
    hasIconFit: true,
  });
  await expect(manualExchange.locator('.crypto-logo img[src^="data:image/svg+xml"]').first()).toBeVisible();
  const sepaLogo = page.getByTestId('table-orders')
    .getByTestId(`row-order-${secondManualOrder.id}`)
    .locator('.payment-method-logo[data-brand="sepa"]');
  await expect(sepaLogo).toBeVisible();
  await expect(sepaLogo).toHaveClass(/logo-avatar-fit-icon/);
  await expect(sepaLogo.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(manualRow.locator('.order-amount-cell').locator('img, [data-testid^="asset-mark-"]')).toHaveCount(0);
  await expect(manualExchange).not.toContainText('SEPA transfer');
  await expect(page.getByTestId('table-orders')).toContainText('Guest');
  await expect(page.getByTestId('table-orders')).toContainText('Pending');
  for (const width of [390, 768, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const expectedLogoSize = width <= 767 ? 40 : width <= 1199 ? 42 : 44;
    const responsiveLogoSizes = await manualExchange.locator('.order-route-logo-frame').evaluateAll((frames) =>
      frames.map((frame) => {
        const outer = frame.getBoundingClientRect();
        const inner = frame.firstElementChild!.getBoundingClientRect();
        return { width: outer.width, height: outer.height, innerWidth: inner.width, innerHeight: inner.height };
      })
    );
    expect(responsiveLogoSizes.every(({ width: logoWidth, height, innerWidth, innerHeight }) =>
      logoWidth === expectedLogoSize &&
      height === expectedLogoSize &&
      innerWidth === expectedLogoSize &&
      innerHeight === expectedLogoSize
    )).toBe(true);
    const pageLayout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > document.documentElement.clientWidth + 1 || bounds.left < -1;
        })
        .slice(0, 5)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`),
    }));
    expect(pageLayout.scrollWidth, `viewport ${width}px overflowed: ${pageLayout.offenders.join(', ')}`).toBeLessThanOrEqual(pageLayout.clientWidth);
    const panel = await page.locator('.orders-panel').boundingBox();
    const tableWrap = await page.locator('.orders-panel .table-wrap').boundingBox();
    expect(panel && tableWrap && tableWrap.x >= panel.x && tableWrap.x + tableWrap.width <= panel.x + panel.width + 1).toBe(true);
    expect(panel?.width || 0, `Orders panel collapsed at ${width}px`).toBeGreaterThanOrEqual(width * 0.59);
  }
  await page.getByTestId(`row-order-${manualOrder.id}`).click();
  await expect(page.getByTestId('order-details-drawer')).toBeVisible();
  await page.getByTestId('button-close-order-drawer').click();
  await expect(page.getByTestId('table-orders')).toBeVisible();
  await page.getByTestId('tab-orders-archived').click();
  await expect.poll(() => orderRequests.some((url) => url.searchParams.get('archived') === 'archived')).toBe(true);
  await page.getByTestId('checkbox-select-all-orders').check();
  await expect(page.getByTestId('bulk-actions-bar')).toContainText('Restore Selected');
  await expect(page.getByTestId('bulk-actions-bar')).toContainText('Delete Selected');
  await expect(page.getByTestId('bulk-actions-bar')).toContainText('Clear selection');
  await page.getByTestId('button-bulk-delete').click();
  await expect(page.getByRole('alertdialog')).toContainText('Permanently delete 2 archived orders?');
  await expect(page.getByRole('alertdialog')).toContainText('This action cannot be undone.');
  await expect(page.getByTestId('button-confirm-permanent-delete')).toHaveText('Delete Permanently');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('button-bulk-restore').click();
  await expect(page.getByRole('alertdialog')).toContainText('return to Active Orders');
  await page.getByTestId('button-confirm-bulk-restore').click();
  await expect.poll(() => bulkArchivePayload).toMatchObject({
    archived: false,
    items: [
      { id: manualOrder.id, recordVersion: 0 },
      { id: secondManualOrder.id, recordVersion: 0 },
    ],
  });
  await expect(page.getByTestId('notice-bulk-result')).toContainText('2 restored successfully');
  await page.getByTestId('checkbox-select-all-orders').check();
  await page.getByTestId(`row-menu-trigger-${manualOrder.id}`).click();
  await expect(page.getByTestId(`row-menu-restore-${manualOrder.id}`)).toBeVisible();
  await expect(page.getByTestId(`row-menu-delete-permanently-${manualOrder.id}`)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('button-bulk-delete').click();
  await page.getByTestId('button-confirm-permanent-delete').click();
  await expect.poll(() => bulkDeletePayload).toMatchObject({
    items: [
      { id: manualOrder.id, recordVersion: 0 },
      { id: secondManualOrder.id, recordVersion: 0 },
    ],
  });
  await expect(page.getByTestId('empty-orders')).toBeVisible();
  await expect(page.getByTestId('bulk-actions-bar')).toHaveCount(0);
  await expect(page.locator('.panel-footer')).toContainText('Showing0 of10 orders');
  await page.getByTestId('button-admin-mobile-profile').click();
  await page.getByTestId('button-mobile-theme-dark').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});