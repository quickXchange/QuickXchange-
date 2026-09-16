import { expect, test } from '@playwright/test';

const createdAt = '2026-08-20T09:00:00.000Z';

const operators = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const role = number <= 2 ? 'owner' : 'operator';
  const status = number <= 8 ? 'active' : number <= 10 ? 'suspended' : 'invited';
  return {
    id: `operator-${number}`,
    email: `operator${number}@example.test`,
    role,
    status,
    linkedToClerk: status !== 'invited',
    createdAt,
    updatedAt: `2026-08-${String(20 + (index % 8)).padStart(2, '0')}T12:00:00.000Z`,
  };
});

const auditLogs = Array.from({ length: 7 }, (_, index) => ({
  id: `audit-${index + 1}`,
  action: index === 0 ? 'staff.member_suspended' : index === 1 ? 'staff.invitation_approved' : 'staff.invitation_created',
  targetEmail: `operator${index + 1}@example.test`,
  createdAt: `2026-08-${String(29 - index).padStart(2, '0')}T12:00:00.000Z`,
}));

test('owners manage a compact responsive staff directory with real derived data', async ({ page }) => {
  let invitationPayload: unknown;

  await page.route('**/api/exchange/config', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      assets: [],
      fiatCurrencies: [],
      settlementOptions: [],
      manualSettlementOptions: [],
      instantSettlementOptions: [],
      providers: [],
      capabilities: { instantQuotes: false, instantOrders: false },
    }),
  }));
  await page.route('**/api/admin/operator-audit', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(auditLogs),
  }));
  await page.route('**/api/admin/operators/invitations', async route => {
    invitationPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'operator-invited',
        email: 'new-operator@example.test',
        role: 'operator',
        status: 'invited',
        linkedToClerk: false,
        createdAt,
        updatedAt: createdAt,
      }),
    });
  });
  await page.route('**/api/admin/operators', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([...operators, operators[0]]),
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/staff');

  await expect(page.getByRole('heading', { name: 'Staff Management' })).toBeVisible();
  await expect(page.getByText('Manage your operators, owners and access permissions.')).toBeVisible();
  await expect(page.locator('.staff-metric-card').filter({ hasText: 'Total Staff' })).toContainText('12');
  await expect(page.locator('.staff-metric-card').filter({ hasText: 'Active' })).toContainText('8');
  await expect(page.locator('.staff-metric-card').filter({ hasText: 'Suspended' })).toContainText('2');
  await expect(page.locator('.staff-metric-card').filter({ hasText: 'Owners' })).toContainText('2');

  await expect(page.locator('.staff-table tbody tr')).toHaveCount(10);
  await expect(page.getByText('Showing 1 to 10 of 12 operators')).toBeVisible();
  await page.getByLabel('Page 2').click();
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(2);

  const search = page.getByPlaceholder('Search operator, email, or ID...');
  await search.fill('operator12');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(1);
  await expect(page.getByText('operator12@example.test').first()).toBeVisible();

  const clearButton = page.getByTestId('input-operator-search-clear');
  await expect(clearButton).toBeVisible();
  await clearButton.click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(10);

  await search.fill(' ToR2  ');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(1);
  await expect(page.getByText('operator2@example.test').first()).toBeVisible();
  await clearButton.click();
  await page.locator('.staff-table-controls select').nth(0).selectOption('owner');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(2);
  await page.locator('.staff-table-controls select').nth(0).selectOption('all');
  await page.locator('.staff-table-controls select').nth(1).selectOption('suspended');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(2);
  await page.locator('.staff-table-controls select').nth(1).selectOption('all');

  await page.getByLabel('View operator1@example.test').click();
  await expect(page.getByRole('dialog', { name: 'operator1@example.test' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('operator-1');
  await page.getByLabel('Close operator details').click();

  await expect(page.locator('.staff-audit-item')).toHaveCount(5);
  await page.getByRole('button', { name: 'View All' }).click();
  await expect(page.locator('.staff-audit-item')).toHaveCount(7);

  await page.getByLabel('Email Address').fill('new-operator@example.test');
  await page.getByRole('button', { name: 'Create Invitation' }).click();
  await expect(page.getByText('Invitation created for new-operator@example.test.')).toBeVisible();
  expect(invitationPayload).toEqual({ email: 'new-operator@example.test' });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/staff');
  const staffTable = page.locator('.staff-table');
  await expect(staffTable).toBeVisible();
  await expect(staffTable.locator('tbody tr')).toHaveCount(10);
  const swipeMetrics = await staffTable.evaluate(async (table) => {
    const viewport = table.closest<HTMLElement>('.overflow-x-auto')!;
    const hint = viewport.previousElementSibling as HTMLElement;
    const firstHeader = table.querySelector<HTMLElement>('thead th:first-child')!;
    const lastHeader = table.querySelector<HTMLElement>('thead th:last-child')!;
    const firstCell = table.querySelector<HTMLElement>('tbody tr:first-child > :first-child')!;
    const lastCell = table.querySelector<HTMLElement>('tbody tr:first-child > :last-child')!;
    const before = [firstHeader, lastHeader, firstCell, lastCell].map(cell => cell.getBoundingClientRect().left);
    viewport.scrollLeft = Math.min(140, viewport.scrollWidth - viewport.clientWidth);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const after = [firstHeader, lastHeader, firstCell, lastCell].map(cell => cell.getBoundingClientRect().left);
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
  expect(swipeMetrics.tableWidth).toBeGreaterThan(swipeMetrics.viewportWidth);
  expect(swipeMetrics.scrollLeft).toBeGreaterThan(0);
  expect(swipeMetrics.hintOpacity).toBe('0');
  expect(swipeMetrics.stickyParts).toBe(0);
  for (const movement of swipeMetrics.movement) {
    expect(movement).toBeCloseTo(-swipeMetrics.scrollLeft, 0);
  }

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});